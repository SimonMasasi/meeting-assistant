//! The online speech pipeline worker.
//!
//! Runs on a dedicated thread spawned by the recorder. It owns the (heavy, not
//! `Send`-across-await) sherpa-onnx models and consumes interleaved device-rate
//! audio over an [`mpsc`] channel: closing the channel (dropping the sender)
//! tells the worker to flush and exit. For each utterance the VAD delimits, it
//! assigns a speaker via online clustering, transcribes the words, persists a
//! `transcripts` row, and emits a `transcript-line` event for the live UI.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::Arc;

use serde::Serialize;
use sherpa_rs::{
    embedding_manager::EmbeddingManager,
    silero_vad::{SileroVad, SileroVadConfig},
    speaker_id::{EmbeddingExtractor, ExtractorConfig},
};
use tauri::Emitter;

use crate::db::pool;
use crate::diarize::audio::{downmix, Resampler16k, TARGET_RATE};
use crate::diarize::models::ModelPaths;
use crate::diarize::transcriber::{
    CloudTranscriber, TranscribeBackend, Transcriber, WhisperTranscriber,
};
use crate::error::{Error, Result};

/// Silero processes audio in fixed 512-sample windows at 16 kHz.
const VAD_WINDOW: usize = 512;
/// Cosine-similarity threshold for matching an utterance to a known speaker.
/// Above it, the utterance joins that speaker; below, a new speaker is minted.
const SPEAKER_MATCH_THRESHOLD: f32 = 0.5;

/// One speaker-labeled transcript line. Shared with the command layer (returned
/// by `get_transcript`) and used as the `transcript-line` event payload.
#[derive(Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub id: String,
    pub speaker_label: String,
    pub speaker_name: Option<String>,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

/// Progress of the worker, emitted as `transcription-status` so the UI can show
/// "transcribing live" and a backlog countdown after the recording stops.
///
/// `received_ms` is the wall-clock audio handed to the worker so far; while
/// recording it climbs in real time, then freezes when the tee closes.
/// `processed_ms` is how much of that has been run through the pipeline, so
/// `backlog_ms` is how far behind real time the worker is — it drains to zero as
/// the worker catches up, at which point `state` becomes `done`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionStatus {
    /// "loading" | "running" | "done"
    pub state: &'static str,
    pub received_ms: i64,
    pub processed_ms: i64,
    pub backlog_ms: i64,
}

/// Entry point for the worker thread. Never panics: any setup/inference failure
/// is reported to the frontend via a `transcription-error` event and ends the
/// worker without affecting the WAV recording running on the capture thread.
#[allow(clippy::too_many_arguments)]
pub fn run(
    app: tauri::AppHandle,
    meeting_id: String,
    recording_id: Option<String>,
    input_rate: u32,
    channels: u16,
    models: ModelPaths,
    language: String,
    backend: TranscribeBackend,
    rx: Receiver<Vec<f32>>,
    captured: Arc<AtomicU64>,
) {
    emit_status(&app, "loading", 0, 0);
    if let Err(e) = run_inner(
        &app,
        &meeting_id,
        recording_id,
        input_rate,
        channels,
        models,
        &language,
        backend,
        rx,
        &captured,
    ) {
        eprintln!("transcription pipeline error: {e}");
        let _ = app.emit("transcription-error", e.to_string());
    }
    // Always signal completion so the UI's "Finishing transcription…" indicator
    // clears even if the flush above errored before reaching its own "done" emit.
    // A duplicate "done" on the success path is harmless (the UI just re-arms its
    // brief "Transcript ready" clear timer).
    let total = (captured.load(Ordering::Relaxed) * 1000 / input_rate as u64) as i64;
    emit_status(&app, "done", total, total);
}

/// Emit a `transcription-status` update. `received`/`processed` are sample-domain
/// millisecond counts; backlog is derived and floored at zero.
fn emit_status(app: &tauri::AppHandle, state: &'static str, received_ms: i64, processed_ms: i64) {
    let _ = app.emit(
        "transcription-status",
        TranscriptionStatus {
            state,
            received_ms,
            processed_ms,
            backlog_ms: (received_ms - processed_ms).max(0),
        },
    );
}

#[allow(clippy::too_many_arguments)]
fn run_inner(
    app: &tauri::AppHandle,
    meeting_id: &str,
    recording_id: Option<String>,
    input_rate: u32,
    channels: u16,
    models: ModelPaths,
    language: &str,
    backend: TranscribeBackend,
    rx: Receiver<Vec<f32>>,
    captured: &AtomicU64,
) -> Result<()> {
    let path = |p: &std::path::Path| p.to_string_lossy().to_string();

    let mut transcriber: Box<dyn Transcriber> = match backend {
        TranscribeBackend::Local => Box::new(WhisperTranscriber::new(&models, language)?),
        TranscribeBackend::Cloud => Box::new(CloudTranscriber::new(app.clone(), language)),
    };
    // Cloud lines are provisional: they display live, then the backend's batch
    // transcript supersedes them once the recording is transcribed server-side.
    let provisional = backend == TranscribeBackend::Cloud;

    let mut extractor = EmbeddingExtractor::new(ExtractorConfig {
        model: path(&models.embedding),
        ..Default::default()
    })
    .map_err(|e| Error::Transcription(format!("embedding model init failed: {e}")))?;
    let mut manager = EmbeddingManager::new(
        extractor
            .embedding_size
            .try_into()
            .map_err(|_| Error::Transcription("invalid embedding size".into()))?,
    );

    let mut vad = SileroVad::new(
        SileroVadConfig {
            model: path(&models.vad),
            window_size: VAD_WINDOW as i32,
            ..Default::default()
        },
        // Internal ring-buffer capacity in seconds; segments are drained
        // continuously so this need only cover the longest single utterance.
        30.0,
    )
    .map_err(|e| Error::Transcription(format!("VAD init failed: {e}")))?;

    let mut resampler = Resampler16k::new(input_rate)?;
    let pool = tauri::async_runtime::block_on(pool(app))?;

    // Continue speaker/line numbering after anything already stored for this
    // meeting so a second recording appends rather than overwrites.
    let mut seq: i64 = tauri::async_runtime::block_on(
        sqlx::query_scalar::<_, i64>(
            "SELECT COALESCE(MAX(seq), -1) + 1 FROM transcripts WHERE meeting_id = $1",
        )
        .bind(meeting_id)
        .fetch_one(&pool),
    )
    .unwrap_or(0);
    let mut speaker_counter: u32 = 0;

    let mut pending = Vec::<f32>::new();

    // Wall-clock audio accounting, used to drive the status/backlog indicator.
    // `received` is read from the shared `captured` counter the capture thread
    // bumps as audio is recorded (mono frames at the input rate) — so it reflects
    // everything still queued in the channel, not just what this worker has
    // dequeued. `processed` counts 16 kHz samples actually fed to the VAD. The gap
    // between them is the true backlog the worker must still drain.
    let mut processed_16k: u64 = 0;
    let mut last_emit_16k: u64 = 0;
    let received_ms = || (captured.load(Ordering::Relaxed) * 1000 / input_rate as u64) as i64;
    let processed_ms = |s: u64| (s * 1000 / TARGET_RATE as u64) as i64;
    emit_status(app, "running", 0, 0);

    // Drain the channel until the recorder drops its sender, processing every
    // full VAD window as audio arrives.
    for interleaved in rx.iter() {
        let mono = downmix(&interleaved, channels);
        resampler.push(&mono, &mut pending)?;
        processed_16k += drain_windows(
            &mut pending,
            &mut vad,
            &mut *transcriber,
            &mut extractor,
            &mut manager,
            &mut speaker_counter,
            &mut |seg| {
                persist_and_emit(
                    app,
                    &pool,
                    meeting_id,
                    &recording_id,
                    &mut seq,
                    provisional,
                    seg,
                )
            },
        )? as u64;

        // Throttle to ~2 updates/sec of processed audio so the UI stays current
        // (including while draining a post-stop backlog) without event spam.
        if processed_16k - last_emit_16k >= TARGET_RATE as u64 / 2 {
            last_emit_16k = processed_16k;
            emit_status(
                app,
                "running",
                received_ms(),
                processed_ms(processed_16k),
            );
        }
    }

    // Recording stopped: pad with trailing silence so the VAD closes the final
    // utterance, then flush whatever remains. The consumed-sample count isn't
    // needed here — the "done" status below reports the backlog fully cleared.
    pending.extend(std::iter::repeat(0.0).take(TARGET_RATE as usize / 2));
    drain_windows(
        &mut pending,
        &mut vad,
        &mut *transcriber,
        &mut extractor,
        &mut manager,
        &mut speaker_counter,
        &mut |seg| {
            persist_and_emit(
                app,
                &pool,
                meeting_id,
                &recording_id,
                &mut seq,
                provisional,
                seg,
            )
        },
    )?;

    // Caught up: report the backlog cleared and the worker finished.
    let total = received_ms();
    emit_status(app, "done", total, total);
    Ok(())
}

/// A finished utterance before persistence: speaker + text + 16 kHz sample bounds.
struct Utterance {
    speaker_label: String,
    start_sample: u64,
    n_samples: usize,
    text: String,
}

/// Feed buffered 16 kHz mono samples to the VAD one window at a time, handling
/// every utterance it completes. Samples that don't fill a final window are kept
/// in `pending` for the next call. Returns the number of 16 kHz samples consumed,
/// for the caller's backlog accounting.
#[allow(clippy::too_many_arguments)]
fn drain_windows(
    pending: &mut Vec<f32>,
    vad: &mut SileroVad,
    transcriber: &mut dyn Transcriber,
    extractor: &mut EmbeddingExtractor,
    manager: &mut EmbeddingManager,
    speaker_counter: &mut u32,
    on_utterance: &mut dyn FnMut(Utterance) -> Result<()>,
) -> Result<usize> {
    let mut offset = 0;
    while offset + VAD_WINDOW <= pending.len() {
        let window = pending[offset..offset + VAD_WINDOW].to_vec();
        offset += VAD_WINDOW;
        vad.accept_waveform(window);
        while !vad.is_empty() {
            let segment = vad.front();
            let start_sample = segment.start as u64;
            let n_samples = segment.samples.len();
            let text = transcriber.transcribe(TARGET_RATE, &segment.samples)?;
            // Skip non-speech the VAD let through but the transcriber found empty,
            // before it can register a phantom speaker cluster. In cloud mode a
            // dropped line arrives here as empty text too, for the same reason.
            if text.is_empty() {
                vad.pop();
                continue;
            }
            let speaker_label = assign_speaker(extractor, manager, speaker_counter, segment.samples)?;
            vad.pop();

            on_utterance(Utterance {
                speaker_label,
                start_sample,
                n_samples,
                text,
            })?;
        }
    }
    // Drop the consumed prefix, keeping the sub-window remainder for next time.
    pending.drain(..offset);
    Ok(offset)
}

/// Embed an utterance and match it to an existing speaker, or register a new one.
fn assign_speaker(
    extractor: &mut EmbeddingExtractor,
    manager: &mut EmbeddingManager,
    speaker_counter: &mut u32,
    samples: Vec<f32>,
) -> Result<String> {
    let mut embedding = extractor
        .compute_speaker_embedding(samples, TARGET_RATE)
        .map_err(|e| Error::Transcription(format!("embedding failed: {e}")))?;
    if let Some(name) = manager.search(&embedding, SPEAKER_MATCH_THRESHOLD) {
        return Ok(name);
    }
    *speaker_counter += 1;
    let name = format!("Speaker {}", *speaker_counter);
    manager
        .add(name.clone(), &mut embedding)
        .map_err(|e| Error::Transcription(format!("speaker register failed: {e}")))?;
    Ok(name)
}

/// Insert one transcript row and emit it to the live UI.
fn persist_and_emit(
    app: &tauri::AppHandle,
    pool: &sqlx::Pool<sqlx::Sqlite>,
    meeting_id: &str,
    recording_id: &Option<String>,
    seq: &mut i64,
    provisional: bool,
    utt: Utterance,
) -> Result<()> {
    let start_ms = (utt.start_sample as i64) * 1000 / TARGET_RATE as i64;
    let end_ms = start_ms + (utt.n_samples as i64) * 1000 / TARGET_RATE as i64;
    let line = TranscriptSegment {
        id: format!("{meeting_id}-{}", *seq),
        speaker_label: utt.speaker_label,
        speaker_name: None,
        start_ms,
        end_ms,
        text: utt.text,
    };

    tauri::async_runtime::block_on(
        sqlx::query(
            "INSERT INTO transcripts
                (id, meeting_id, recording_id, seq, speaker_label, speaker_name, start_ms, end_ms, text, provisional)
             VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9)",
        )
        .bind(&line.id)
        .bind(meeting_id)
        .bind(recording_id)
        .bind(*seq)
        .bind(&line.speaker_label)
        .bind(line.start_ms)
        .bind(line.end_ms)
        .bind(&line.text)
        .bind(provisional as i64)
        .execute(pool),
    )?;
    *seq += 1;

    let _ = app.emit("transcript-line", line);
    Ok(())
}
