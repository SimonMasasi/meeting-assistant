//! Native microphone capture for in-person meetings.
//!
//! In-person meetings have no online stream to pull audio from, so we record the
//! room with the machine's default input device. Capture runs on a dedicated
//! thread because a [`cpal`] stream is `!Send` and must be created, played, and
//! dropped on the same thread; the command layer only holds a stop flag and the
//! thread's join handle in managed state between `start_recording` and
//! `stop_recording`.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{SystemTime, UNIX_EPOCH};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use tauri::{Emitter, State};

use crate::cloud::{self, AppMode};
use crate::commands::storage::resolve_storage_dir;
use crate::db::pool;
use crate::diarize::audio::{downmix, Resampler16k, TARGET_RATE};
use crate::diarize::transcriber::TranscribeBackend;
use crate::error::{Error, Result};

/// The WAV writer shared between the recorder thread and cpal's audio callback.
type SharedWriter = Arc<Mutex<Option<hound::WavWriter<std::io::BufWriter<std::fs::File>>>>>;

/// A buffer of normalized (`-1.0..1.0`) interleaved samples teed from one capture
/// source to the transcription mixer. `source` indexes the mixer's source list
/// (0 = microphone, 1 = system audio).
struct SourceChunk {
    source: usize,
    interleaved: Vec<f32>,
}

/// An in-progress recording, held in managed state from `start_recording` until
/// `stop_recording` flips the stop flag and joins the capture thread.
struct ActiveRecording {
    meeting_id: String,
    path: PathBuf,
    /// Second WAV for captured system/loopback audio, when that source is on.
    system_path: Option<PathBuf>,
    stop: Arc<AtomicBool>,
    thread: JoinHandle<Result<()>>,
}

/// Managed state wrapping the single active recording, if any. Registered with
/// the Tauri builder via `.manage(RecordingState::default())`.
#[derive(Default)]
pub struct RecordingState(Mutex<Option<ActiveRecording>>);

impl RecordingState {
    /// Whether a capture is currently in progress. The recordings-management
    /// commands use this to refuse deleting or merging files while one is still
    /// being written.
    pub fn is_active(&self) -> bool {
        self.0.lock().unwrap().is_some()
    }
}

/// A reference to a finished recording, returned to the frontend. Also returned
/// by the recordings management commands in `commands::recordings`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRecording {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub size: u64,
    /// Playback length in seconds, computed from the WAV header when a recording
    /// is listed. `None` for a just-finished recording (the UI doesn't need it
    /// then) or when the file can't be read. Never persisted.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<f64>,
}

/// An available audio input device, surfaced to the frontend so the user can
/// choose which microphone to record from. cpal has no stable device IDs, so the
/// `name` doubles as the identifier passed back into `start_recording`.
#[derive(Serialize)]
pub struct MicrophoneDevice {
    pub name: String,
    pub is_default: bool,
}

/// List the available microphone (input) devices, marking the OS default. Returns
/// an empty list when no input device is present. Devices whose name can't be read
/// are skipped rather than failing the whole call.
#[tauri::command]
pub fn list_microphones() -> Result<Vec<MicrophoneDevice>> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok());

    let mut devices = Vec::new();
    for device in host.input_devices().map_err(|e| Error::Message(e.to_string()))? {
        if let Ok(name) = device.name() {
            let is_default = default_name.as_deref() == Some(name.as_str());
            devices.push(MicrophoneDevice { name, is_default });
        }
    }
    Ok(devices)
}

/// Begin capturing a microphone into a fresh WAV file under the meeting's
/// storage folder. `device_name` selects the input device by name (as returned
/// by `list_microphones`); `None`, or a name that no longer matches any device,
/// falls back to the OS default. Errors if a recording is already running or no
/// input device is available.
#[tauri::command]
pub async fn start_recording(
    app: tauri::AppHandle,
    state: State<'_, RecordingState>,
    meeting_id: String,
    device_name: Option<String>,
    system_device_name: Option<String>,
    transcribe: bool,
) -> Result<()> {
    if state.0.lock().unwrap().is_some() {
        return Err(Error::Message(
            "A recording is already in progress".to_string(),
        ));
    }

    // Fail loudly if the OS hasn't granted mic access — otherwise capture would
    // succeed but write a silent file. The frontend requests permission first,
    // so this is a backstop.
    if crate::commands::mic_permission::current_status()
        != crate::commands::mic_permission::MicPermission::Granted
    {
        return Err(Error::Message(
            "Microphone permission has not been granted".to_string(),
        ));
    }

    let dir = resolve_storage_dir(&app)
        .await?
        .join("meeting-assistant")
        .join(&meeting_id);
    std::fs::create_dir_all(&dir)?;

    // The chosen Whisper size + language drive which models the pipeline loads
    // and the recognizer's language. Read here (async) so the capture thread
    // doesn't need DB access.
    let transcription = {
        let pool = pool(&app).await?;
        crate::commands::transcription::fetch_transcription_settings(&pool).await?
    };

    // Cloud mode transcribes each utterance on the backend, so it loads no Whisper
    // model. Read here (async) for the same reason as the settings above.
    let backend = match cloud::current_mode(&app).await? {
        AppMode::Cloud => TranscribeBackend::Cloud,
        AppMode::Local => TranscribeBackend::Local,
    };

    // Seconds-since-epoch keeps successive recordings for a meeting distinct.
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(format!("recording-{stamp}.wav"));
    // System/loopback audio (e.g. remote call participants) is captured to its own
    // WAV alongside the mic and mixed into the transcription pipeline.
    let system_path = system_device_name
        .as_ref()
        .map(|_| dir.join(format!("recording-{stamp}-system.wav")));

    let stop = Arc::new(AtomicBool::new(false));

    // The stream must be built on the capture thread (it is `!Send`). The thread
    // reports whether setup succeeded over `ready` before entering its loop, so
    // device/permission failures surface here instead of being lost.
    let (ready_tx, ready_rx) = mpsc::channel::<std::result::Result<(), String>>();
    let thread = {
        let path = path.clone();
        let system_path = system_path.clone();
        let stop = stop.clone();
        let app = app.clone();
        let meeting_id = meeting_id.clone();
        let model_size = transcription.model_size.clone();
        let language = transcription.language.clone();
        std::thread::spawn(move || {
            capture(
                app,
                path,
                device_name,
                system_device_name,
                system_path,
                meeting_id,
                transcribe,
                model_size,
                language,
                backend,
                stop,
                ready_tx,
            )
        })
    };

    match ready_rx.recv() {
        Ok(Ok(())) => {}
        Ok(Err(msg)) => {
            let _ = thread.join();
            return Err(Error::Message(msg));
        }
        Err(_) => {
            let _ = thread.join();
            return Err(Error::Message(
                "Recorder thread exited before it started".to_string(),
            ));
        }
    }

    *state.0.lock().unwrap() = Some(ActiveRecording {
        meeting_id,
        path,
        system_path,
        stop,
        thread,
    });
    Ok(())
}

/// Stop the active recording, finalize the WAV, record a metadata row, and
/// return a reference the frontend can attach to the meeting.
#[tauri::command]
pub async fn stop_recording(
    app: tauri::AppHandle,
    state: State<'_, RecordingState>,
) -> Result<SavedRecording> {
    let active = state
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| Error::Message("No recording in progress".to_string()))?;

    active.stop.store(true, Ordering::Relaxed);
    active
        .thread
        .join()
        .map_err(|_| Error::Message("Recorder thread panicked".to_string()))??;

    let pool = pool(&app).await?;
    let saved = register_recording(&pool, &active.meeting_id, &active.path).await?;
    // Register the system-audio file too, when one was captured, so it shows in
    // the recordings list (it appears on the next refresh). Don't fail the whole
    // stop if only the optional system file can't be registered.
    if let Some(sp) = &active.system_path {
        if sp.exists() {
            if let Err(e) = register_recording(&pool, &active.meeting_id, sp).await {
                eprintln!("failed to register system recording: {e}");
            }
        }
    }

    Ok(saved)
}

/// Insert (or refresh) a `recordings` row for a finished WAV and return its
/// reference. The id is `"{meeting_id}-{file_name}"`, matching the live tee.
async fn register_recording(
    pool: &sqlx::Pool<sqlx::Sqlite>,
    meeting_id: &str,
    path: &std::path::Path,
) -> Result<SavedRecording> {
    let size = std::fs::metadata(path)?.len();
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("recording.wav")
        .to_string();
    let saved = SavedRecording {
        id: format!("{meeting_id}-{file_name}"),
        file_name,
        path: path.to_string_lossy().to_string(),
        size,
        duration_secs: None,
    };
    sqlx::query(
        "INSERT INTO recordings (id, meeting_id, file_name, path, size)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET
             file_name = excluded.file_name,
             path      = excluded.path,
             size      = excluded.size",
    )
    .bind(&saved.id)
    .bind(meeting_id)
    .bind(&saved.file_name)
    .bind(&saved.path)
    .bind(saved.size as i64)
    .execute(pool)
    .await?;
    Ok(saved)
}

/// Whether a recording is currently in progress. Lets the UI restore its state
/// (e.g. after a route change) without tracking it separately.
#[tauri::command]
pub fn is_recording(state: State<'_, RecordingState>) -> bool {
    state.0.lock().unwrap().is_some()
}

/// Resolve a named input device, falling back to the OS default when the name is
/// `None` or no longer matches a present device.
fn resolve_input_device(host: &cpal::Host, name: Option<&str>) -> Option<cpal::Device> {
    let selected = name.and_then(|wanted| {
        host.input_devices()
            .ok()?
            .find(|d| d.name().map(|n| n == wanted).unwrap_or(false))
    });
    selected.or_else(|| host.default_input_device())
}

/// Build and start an input stream for one source, writing 16-bit PCM to `writer`,
/// tracking peak amplitude into `peak`, and (when `tee` is set) forwarding a
/// normalized `f32` copy tagged with `source` to the transcription mixer.
fn open_input_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    writer: SharedWriter,
    peak: Arc<AtomicU32>,
    tee: Option<mpsc::Sender<SourceChunk>>,
    source: usize,
) -> std::result::Result<cpal::Stream, String> {
    let err_fn = |err| eprintln!("audio stream error: {err}");
    let w = writer;
    let p = peak;
    let t = tee;
    let built = match sample_format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            config,
            move |data: &[f32], _: &_| {
                write_samples(data, &w, &p, t.as_ref(), source, |s| {
                    (s.clamp(-1.0, 1.0) * 32767.0) as i16
                })
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            config,
            move |data: &[i16], _: &_| write_samples(data, &w, &p, t.as_ref(), source, |s| s),
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            config,
            move |data: &[u16], _: &_| {
                write_samples(data, &w, &p, t.as_ref(), source, |s| (s as i32 - 32768) as i16)
            },
            err_fn,
            None,
        ),
        other => return Err(format!("Unsupported sample format: {other:?}")),
    };
    let stream = built.map_err(|e| e.to_string())?;
    stream.play().map_err(|e| e.to_string())?;
    Ok(stream)
}

/// Runs on the dedicated capture thread: open the chosen (or default) microphone
/// and, optionally, a system-audio device; stream both into their WAV files until
/// `stop` is set; and, when transcription is on, mix them to 16 kHz mono and feed
/// the live pipeline. Finalizes the file(s) on stop.
#[allow(clippy::too_many_arguments)]
fn capture(
    app: tauri::AppHandle,
    path: PathBuf,
    device_name: Option<String>,
    system_device_name: Option<String>,
    system_path: Option<PathBuf>,
    meeting_id: String,
    transcribe: bool,
    model_size: String,
    language: String,
    backend: TranscribeBackend,
    stop: Arc<AtomicBool>,
    ready: mpsc::Sender<std::result::Result<(), String>>,
) -> Result<()> {
    // Report any setup failure back to `start_recording` and bail out.
    macro_rules! try_ready {
        ($expr:expr) => {
            match $expr {
                Ok(v) => v,
                Err(e) => {
                    let _ = ready.send(Err(e.to_string()));
                    return Err(Error::Message(e.to_string()));
                }
            }
        };
    }

    let host = cpal::default_host();

    // --- Microphone (always present) ---
    let mic_device = match resolve_input_device(&host, device_name.as_deref()) {
        Some(d) => d,
        None => {
            let msg = "No microphone (input device) was found".to_string();
            let _ = ready.send(Err(msg.clone()));
            return Err(Error::Message(msg));
        }
    };
    let mic_cfg = try_ready!(mic_device.default_input_config());
    let mic_channels = mic_cfg.channels();
    let mic_rate = mic_cfg.sample_rate().0;
    let mic_format = mic_cfg.sample_format();
    let mic_writer: SharedWriter =
        Arc::new(Mutex::new(Some(try_ready!(hound::WavWriter::create(
            &path,
            wav_spec(mic_channels, mic_rate)
        )))));
    let mic_config: cpal::StreamConfig = mic_cfg.config();

    // --- System audio (optional) ---
    // The user explicitly opted in, so a failure to open it is surfaced rather
    // than silently downgraded to mic-only.
    struct SystemSetup {
        device: cpal::Device,
        config: cpal::StreamConfig,
        format: cpal::SampleFormat,
        channels: u16,
        rate: u32,
        writer: SharedWriter,
    }
    let system = if let Some(name) = system_device_name.as_deref() {
        let device = match resolve_input_device(&host, Some(name)) {
            Some(d) => d,
            None => {
                let msg = format!(
                    "Could not find the system-audio device '{name}'. Check it's connected (e.g. BlackHole)."
                );
                let _ = ready.send(Err(msg.clone()));
                return Err(Error::Message(msg));
            }
        };
        let cfg = try_ready!(device.default_input_config());
        let channels = cfg.channels();
        let rate = cfg.sample_rate().0;
        let format = cfg.sample_format();
        let writer: SharedWriter = match &system_path {
            Some(p) => Arc::new(Mutex::new(Some(try_ready!(hound::WavWriter::create(
                p,
                wav_spec(channels, rate)
            ))))),
            None => Arc::new(Mutex::new(None)),
        };
        Some(SystemSetup {
            device,
            config: cfg.config(),
            format,
            channels,
            rate,
            writer,
        })
    } else {
        None
    };

    // Peak amplitude (0.0..1.0) for the UI meter, written by the audio callbacks
    // and read+reset by the level loop below. Both sources share it so the meter
    // reflects combined loudness; emitting events from the audio thread is avoided.
    let peak = Arc::new(AtomicU32::new(0));

    // Live transcription: when enabled and the models for the chosen size are
    // present, both sources tee into a mixer thread that resamples each to 16 kHz
    // mono and sums them, feeding the pipeline a single stream. The WAV writers
    // are untouched by this — it only copies samples.
    let (mut mic_tee, mut sys_tee): (
        Option<mpsc::Sender<SourceChunk>>,
        Option<mpsc::Sender<SourceChunk>>,
    ) = (None, None);
    let mut mixer: Option<JoinHandle<()>> = None;
    let mut pipeline: Option<JoinHandle<()>> = None;
    if transcribe {
        // Cloud mode only needs the VAD + speaker-embedding models on disk; the
        // Whisper bundle it would never load isn't a precondition.
        match crate::diarize::models::resolve(&app, &model_size)
            .ok()
            .filter(|m| match backend {
                TranscribeBackend::Cloud => m.diarize_present(),
                TranscribeBackend::Local => m.all_present(),
            })
        {
            Some(models) => {
                let (chunk_tx, chunk_rx) = mpsc::channel::<SourceChunk>();
                let (mixed_tx, mixed_rx) = mpsc::channel::<Vec<f32>>();
                // 16 kHz mono frames forwarded to the pipeline, for its backlog clock.
                let captured = Arc::new(AtomicU64::new(0));

                // Source list: index 0 = mic, index 1 = system (when present).
                let mut sources = vec![(mic_rate, mic_channels)];
                if let Some(s) = &system {
                    sources.push((s.rate, s.channels));
                }

                let mixer_captured = captured.clone();
                mixer = Some(std::thread::spawn(move || {
                    run_mixer(chunk_rx, sources, mixed_tx, mixer_captured);
                }));

                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("recording.wav")
                    .to_string();
                let recording_id = format!("{meeting_id}-{file_name}");
                let app_pipe = app.clone();
                pipeline = Some(std::thread::spawn(move || {
                    crate::diarize::pipeline::run(
                        app_pipe,
                        meeting_id,
                        Some(recording_id),
                        TARGET_RATE,
                        1,
                        models,
                        language,
                        backend,
                        mixed_rx,
                        captured,
                    );
                }));

                sys_tee = system.as_ref().map(|_| chunk_tx.clone());
                mic_tee = Some(chunk_tx);
            }
            None => {
                let _ = app.emit(
                    "transcription-error",
                    "Speech models are not downloaded yet".to_string(),
                );
            }
        }
    }

    // Open the streams. The callbacks own clones of the tee senders; the originals
    // stay here so the mixer channel only closes once recording fully stops.
    let mic_stream = try_ready!(open_input_stream(
        &mic_device,
        &mic_config,
        mic_format,
        mic_writer.clone(),
        peak.clone(),
        mic_tee.clone(),
        0,
    ));
    let sys_stream: Option<cpal::Stream> = if let Some(s) = &system {
        Some(try_ready!(open_input_stream(
            &s.device,
            &s.config,
            s.format,
            s.writer.clone(),
            peak.clone(),
            sys_tee.clone(),
            1,
        )))
    } else {
        None
    };

    // Setup succeeded; capture is live.
    let _ = ready.send(Ok(()));

    // Drive the UI's waveform: read-and-reset the peak each tick (~20fps) and
    // emit a smoothed 0.0..1.0 level. Smoothing decays toward the new peak so
    // the animation eases up and down instead of flickering.
    let mut smoothed = 0.0f32;
    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(50));
        let raw = f32::from_bits(peak.swap(0, Ordering::Relaxed));
        smoothed = if raw > smoothed {
            raw
        } else {
            smoothed * 0.6 + raw * 0.4
        };
        let _ = app.emit("recording-level", smoothed);
    }

    // Dropping the streams halts the callbacks (and their tee clones) before we
    // finalize the headers.
    drop(mic_stream);
    drop(sys_stream);
    if let Some(w) = mic_writer.lock().unwrap().take() {
        w.finalize()?;
    }
    if let Some(s) = &system {
        if let Some(w) = s.writer.lock().unwrap().take() {
            w.finalize()?;
        }
    }

    // Close the tees so the mixer (then the pipeline) drains its backlog, persists
    // the final lines, and exits on its own thread. We deliberately do NOT join
    // them: a worker that fell behind real time could take a while to catch up,
    // and `stop_recording` must return promptly. Dropping the handles detaches.
    drop(mic_tee);
    drop(sys_tee);
    drop(mixer);
    drop(pipeline);
    Ok(())
}

/// 16-bit PCM WAV spec for a captured source.
fn wav_spec(channels: u16, sample_rate: u32) -> hound::WavSpec {
    hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    }
}

/// One source inside the mixer: its resampler to 16 kHz mono and the buffer of
/// resampled samples awaiting mixing.
struct MixSource {
    resampler: Resampler16k,
    channels: u16,
    buf: Vec<f32>,
}

/// Mixer thread: resample every source to 16 kHz mono and sum them into one
/// stream for the transcription pipeline.
///
/// `sources[i]` is the `(sample_rate, channels)` of source index `i`. Each
/// incoming [`SourceChunk`] is downmixed and resampled, then the overlapping
/// portion across all sources is summed and forwarded; `captured` is advanced by
/// the 16 kHz frames emitted, so the pipeline's backlog clock stays correct.
fn run_mixer(
    rx: mpsc::Receiver<SourceChunk>,
    sources: Vec<(u32, u16)>,
    tx: mpsc::Sender<Vec<f32>>,
    captured: Arc<AtomicU64>,
) {
    let mut srcs: Vec<MixSource> = Vec::with_capacity(sources.len());
    for (rate, channels) in sources {
        match Resampler16k::new(rate) {
            Ok(resampler) => srcs.push(MixSource {
                resampler,
                channels,
                buf: Vec::new(),
            }),
            Err(e) => {
                eprintln!("mixer resampler init failed: {e}");
                return;
            }
        }
    }

    for chunk in rx.iter() {
        if let Some(src) = srcs.get_mut(chunk.source) {
            let mono = downmix(&chunk.interleaved, src.channels);
            let mut out = Vec::new();
            if src.resampler.push(&mono, &mut out).is_ok() {
                src.buf.extend_from_slice(&out);
            }
        }
        emit_mixed(&mut srcs, &tx, &captured);
    }

    // Channel closed: flush the overlap, then the single remaining tail (the other
    // sources are silent by now), so no captured audio is dropped.
    emit_mixed(&mut srcs, &tx, &captured);
    for src in &mut srcs {
        if !src.buf.is_empty() {
            let tail = std::mem::take(&mut src.buf);
            captured.fetch_add(tail.len() as u64, Ordering::Relaxed);
            let _ = tx.send(tail);
        }
    }
}

/// Sum the overlapping (min-length) prefix of every source's 16 kHz mono buffer,
/// forward it, and drain those samples. Bounds memory if a source stalls (e.g. a
/// misconfigured system device producing nothing) by dropping its oldest samples.
fn emit_mixed(srcs: &mut [MixSource], tx: &mpsc::Sender<Vec<f32>>, captured: &AtomicU64) {
    // Safety valve: if one source falls far behind, drop its oldest samples so the
    // lead buffer can't grow without bound. Normal (clocked) sources stay near-empty.
    const MAX_BUF: usize = 5 * TARGET_RATE as usize;
    for s in srcs.iter_mut() {
        if s.buf.len() > MAX_BUF {
            let excess = s.buf.len() - MAX_BUF;
            s.buf.drain(..excess);
        }
    }

    let n = srcs.iter().map(|s| s.buf.len()).min().unwrap_or(0);
    if n == 0 {
        return;
    }
    let mut mixed = vec![0f32; n];
    for s in srcs.iter_mut() {
        for (i, v) in s.buf.iter().take(n).enumerate() {
            mixed[i] += *v;
        }
        s.buf.drain(..n);
    }
    for v in mixed.iter_mut() {
        *v = v.clamp(-1.0, 1.0);
    }
    captured.fetch_add(n as u64, Ordering::Relaxed);
    let _ = tx.send(mixed);
}

/// Convert a callback buffer to 16-bit samples, append them to the WAV (when a
/// writer is present), record the buffer's peak amplitude into `peak` for the UI
/// meter, and — when transcription is on — forward a normalized `f32` copy tagged
/// with `source` over `tee` to the mixer. Sending never blocks the audio thread
/// for long: the channel is unbounded and the mixer does its work on its own thread.
fn write_samples<T: Copy>(
    data: &[T],
    writer: &SharedWriter,
    peak: &AtomicU32,
    tee: Option<&mpsc::Sender<SourceChunk>>,
    source: usize,
    to_i16: impl Fn(T) -> i16,
) {
    let want_tee = tee.is_some();
    let mut buffer_peak = 0.0f32;
    let mut tee_buf = if want_tee {
        Vec::with_capacity(data.len())
    } else {
        Vec::new()
    };
    if let Ok(mut guard) = writer.lock() {
        let mut w = guard.as_mut();
        for &sample in data {
            let s = to_i16(sample);
            if let Some(writer) = w.as_mut() {
                let _ = writer.write_sample(s);
            }
            let amp = (s as f32).abs() / 32767.0;
            if amp > buffer_peak {
                buffer_peak = amp;
            }
            if want_tee {
                tee_buf.push(s as f32 / 32768.0);
            }
        }
    }
    if let Some(tx) = tee {
        if !tee_buf.is_empty() {
            let _ = tx.send(SourceChunk {
                source,
                interleaved: tee_buf,
            });
        }
    }
    // Keep the highest peak across callbacks until the loop reads and resets it.
    let prev = f32::from_bits(peak.load(Ordering::Relaxed));
    if buffer_peak > prev {
        peak.store(buffer_peak.to_bits(), Ordering::Relaxed);
    }
}
