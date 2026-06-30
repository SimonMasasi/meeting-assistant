//! Management of saved recordings: listing, deletion, and merging.
//!
//! Live capture is owned by [`crate::commands::microphone`]; this module covers
//! everything done with the resulting WAV files afterwards. A meeting can
//! accumulate several recordings (one per start/stop), and the frontend lets the
//! user play them back, delete one, or merge a selection into a single combined
//! file (originals are then removed).
//!
//! Recordings are written at the input device's native rate/channel count
//! (16-bit PCM), so two recordings in the same meeting may not share a format.
//! Merging therefore conforms every source to one target spec (the max sample
//! rate and channel count across the selection) before concatenating, reusing
//! the same `rubato` sinc-resampler recipe as the live transcription path.

use std::collections::HashMap;
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use sqlx::Row;
use tauri::State;

use crate::commands::microphone::{RecordingState, SavedRecording};
use crate::commands::storage::resolve_storage_dir;
use crate::db::pool;
use crate::error::{Error, Result};

/// List every saved recording for a meeting, in the order they were captured.
///
/// Duration isn't stored, so it's read from each WAV header on the fly (cheap —
/// `hound` reads only the header). A missing or unreadable file yields
/// `duration_secs: None` for that row rather than failing the whole call.
#[tauri::command]
pub async fn list_meeting_recordings(
    app: tauri::AppHandle,
    meeting_id: String,
) -> Result<Vec<SavedRecording>> {
    // Recordings are on-device captures in both modes; in cloud mode the audio is
    // uploaded for transcription but the WAV itself stays local.
    let pool = pool(&app).await?;
    let rows = sqlx::query("SELECT id, file_name, path, size FROM recordings WHERE meeting_id = $1")
        .bind(&meeting_id)
        .fetch_all(&pool)
        .await?;

    let mut recordings: Vec<SavedRecording> = rows
        .into_iter()
        .map(|r| {
            let path: String = r.get("path");
            let duration_secs = wav_duration_secs(&path);
            SavedRecording {
                id: r.get("id"),
                file_name: r.get("file_name"),
                path,
                size: r.get::<i64, _>("size") as u64,
                duration_secs,
            }
        })
        .collect();

    // Chronological: the `recording-<unix_secs>` filename encodes capture time.
    recordings.sort_by(|a, b| match (parse_stamp(&a.file_name), parse_stamp(&b.file_name)) {
        (Some(x), Some(y)) => x.cmp(&y),
        _ => a.file_name.cmp(&b.file_name),
    });
    Ok(recordings)
}

/// Delete a single recording: remove its file and DB row, and clear the
/// `recording_id` pointer on any transcript lines that came from it (the lines
/// themselves are the meeting's record and are kept). Refuses while a capture is
/// in progress.
#[tauri::command]
pub async fn delete_recording(
    app: tauri::AppHandle,
    state: State<'_, RecordingState>,
    id: String,
) -> Result<()> {
    if state.is_active() {
        return Err(Error::Message(
            "Stop the current recording before deleting".to_string(),
        ));
    }

    let pool = pool(&app).await?;
    // Read the path from the DB rather than trusting a frontend-supplied one.
    let Some(row) = sqlx::query("SELECT path FROM recordings WHERE id = $1")
        .bind(&id)
        .fetch_optional(&pool)
        .await?
    else {
        return Ok(()); // Already gone — treat as success.
    };
    let path: String = row.get("path");

    remove_file_if_present(&path)?;

    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE transcripts SET recording_id = NULL WHERE recording_id = $1")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM recordings WHERE id = $1")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// Merge two or more of a meeting's recordings into one combined WAV (in capture
/// order), then delete the originals. The merged file is written to a temp path
/// and atomically renamed, so the originals are never removed unless the merge
/// fully succeeded.
#[tauri::command]
pub async fn merge_recordings(
    app: tauri::AppHandle,
    state: State<'_, RecordingState>,
    meeting_id: String,
    ids: Vec<String>,
) -> Result<SavedRecording> {
    if state.is_active() {
        return Err(Error::Message(
            "Stop the current recording before merging".to_string(),
        ));
    }

    let mut wanted = ids;
    wanted.sort();
    wanted.dedup();
    if wanted.len() < 2 {
        return Err(Error::Message(
            "Select at least two recordings to merge".to_string(),
        ));
    }

    let pool = pool(&app).await?;
    let rows = sqlx::query("SELECT id, file_name, path FROM recordings WHERE meeting_id = $1")
        .bind(&meeting_id)
        .fetch_all(&pool)
        .await?;
    let mut by_id: HashMap<String, (String, String)> = HashMap::new();
    for r in rows {
        by_id.insert(r.get("id"), (r.get("file_name"), r.get("path")));
    }

    // Resolve every requested id against this meeting; reject stale/foreign ids.
    let mut sources: Vec<(String, String, String)> = Vec::new(); // (id, file_name, path)
    for id in &wanted {
        match by_id.get(id) {
            Some((file_name, path)) => sources.push((id.clone(), file_name.clone(), path.clone())),
            None => {
                return Err(Error::Message(format!(
                    "Recording {id} is not part of this meeting"
                )))
            }
        }
    }
    sources.sort_by(|a, b| match (parse_stamp(&a.1), parse_stamp(&b.1)) {
        (Some(x), Some(y)) => x.cmp(&y),
        _ => a.1.cmp(&b.1),
    });

    let ordered_paths: Vec<PathBuf> = sources.iter().map(|s| PathBuf::from(&s.2)).collect();
    let source_ids: Vec<String> = sources.iter().map(|s| s.0.clone()).collect();

    // Destination: a new timestamped, `-merged` file in the meeting's folder so
    // it sorts after every source and is easy to recognise.
    let dir = resolve_storage_dir(&app)
        .await?
        .join("meeting-assistant")
        .join(&meeting_id);
    std::fs::create_dir_all(&dir)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let file_name = format!("recording-{stamp}-merged.wav");
    let final_path = dir.join(&file_name);
    let tmp_path = dir.join(format!("{file_name}.tmp"));

    // Reading/resampling/writing is blocking, CPU + IO heavy work; keep it off
    // the async runtime. The tmp is cleaned up if anything fails mid-merge.
    let merge_tmp = tmp_path.clone();
    let merge_final = final_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = merge_into_file(&ordered_paths, &merge_tmp, &merge_final);
        if result.is_err() {
            let _ = std::fs::remove_file(&merge_tmp);
        }
        result
    })
    .await
    .map_err(|e| Error::Message(format!("merge task failed: {e}")))??;

    let size = std::fs::metadata(&final_path)?.len();
    let final_path_str = final_path.to_string_lossy().to_string();
    let duration_secs = wav_duration_secs(&final_path_str);
    let merged_id = format!("{meeting_id}-{file_name}");

    // Publish atomically: add the merged row, repoint transcripts to it, and drop
    // the source rows in a single transaction so the DB can't end up half-merged.
    // (Transcript `start_ms`/`end_ms` stay relative to each original take; the
    // transcript UI orders by `seq`, not absolute offset, so this is fine.)
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO recordings (id, meeting_id, file_name, path, size)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET
             file_name = excluded.file_name,
             path      = excluded.path,
             size      = excluded.size",
    )
    .bind(&merged_id)
    .bind(&meeting_id)
    .bind(&file_name)
    .bind(&final_path_str)
    .bind(size as i64)
    .execute(&mut *tx)
    .await?;
    for sid in &source_ids {
        sqlx::query("UPDATE transcripts SET recording_id = $1 WHERE recording_id = $2")
            .bind(&merged_id)
            .bind(sid)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM recordings WHERE id = $1")
            .bind(sid)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    // Source files are removed last: a leftover orphan is recoverable, but losing
    // the merged result is not. Tolerate per-file failures.
    for (_, _, path) in &sources {
        let _ = std::fs::remove_file(path);
    }

    Ok(SavedRecording {
        id: merged_id,
        file_name,
        path: final_path_str,
        size,
        duration_secs,
    })
}

// --- internals -------------------------------------------------------------

/// Parse the `<unix_secs>` out of a `recording-<ts>.wav` (or `-merged`) name, for
/// chronological ordering. Returns `None` for unexpected names.
fn parse_stamp(file_name: &str) -> Option<u64> {
    let rest = file_name.strip_prefix("recording-")?;
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<u64>().ok()
}

/// Playback length in seconds from a WAV header, or `None` if it can't be read.
pub(crate) fn wav_duration_secs(path: &str) -> Option<f64> {
    let reader = hound::WavReader::open(path).ok()?;
    let sample_rate = reader.spec().sample_rate;
    if sample_rate == 0 {
        return None;
    }
    // `duration()` is the per-channel sample count, read straight from the header.
    Some(reader.duration() as f64 / sample_rate as f64)
}

/// Remove a file, treating an already-absent file as success.
fn remove_file_if_present(path: &str) -> Result<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

type WavOut = hound::WavWriter<BufWriter<File>>;

/// Concatenate `sources` (already in capture order) into one WAV at `tmp_path`,
/// then atomically rename it to `final_path`. Every source is conformed to a
/// shared target spec first. Errors leave `final_path` untouched.
fn merge_into_file(sources: &[PathBuf], tmp_path: &Path, final_path: &Path) -> Result<()> {
    // Probe each source header and validate the encoding we know how to read.
    let mut specs = Vec::with_capacity(sources.len());
    for p in sources {
        let spec = hound::WavReader::open(p)?.spec();
        if spec.bits_per_sample != 16 || spec.sample_format != hound::SampleFormat::Int {
            return Err(Error::Message(format!(
                "{} is not 16-bit PCM, so it can't be merged",
                p.display()
            )));
        }
        specs.push(spec);
    }

    // Target = the most capable spec in the set, so nothing is downsampled or
    // collapsed to mono unless every source already is.
    let target_rate = specs.iter().map(|s| s.sample_rate).max().unwrap_or(16_000);
    let target_channels = specs.iter().map(|s| s.channels).max().unwrap_or(1);
    let target_spec = hound::WavSpec {
        channels: target_channels,
        sample_rate: target_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = hound::WavWriter::create(tmp_path, target_spec)?;
    for (path, spec) in sources.iter().zip(specs.iter()) {
        append_source(path, *spec, target_channels, target_rate, &mut writer)?;
    }
    writer.finalize()?;

    std::fs::rename(tmp_path, final_path)?;
    Ok(())
}

/// Read one source WAV and append it to `writer`, converting channel layout and
/// sample rate to the target as needed. Streams in frame chunks to bound memory.
fn append_source(
    path: &Path,
    spec: hound::WavSpec,
    target_channels: u16,
    target_rate: u32,
    writer: &mut WavOut,
) -> Result<()> {
    let mut reader = hound::WavReader::open(path)?;

    // Fast path: identical spec → copy samples straight through, no float round-trip.
    if spec.channels == target_channels && spec.sample_rate == target_rate {
        for s in reader.samples::<i16>() {
            writer.write_sample(s?)?;
        }
        return Ok(());
    }

    let src_channels = spec.channels;
    let frame_samples = src_channels.max(1) as usize;
    let mut resampler = if spec.sample_rate != target_rate {
        Some(MultiResampler::new(
            spec.sample_rate,
            target_rate,
            target_channels as usize,
        )?)
    } else {
        None
    };

    // Chunk on frame boundaries (the threshold is a whole multiple of the frame
    // size), so no partial frame is ever split across chunks.
    const CHUNK_FRAMES: usize = 16_384;
    let chunk_samples = CHUNK_FRAMES * frame_samples;
    let mut buf: Vec<i16> = Vec::with_capacity(chunk_samples);
    for s in reader.samples::<i16>() {
        buf.push(s?);
        if buf.len() >= chunk_samples {
            flush_chunk(&buf, src_channels, target_channels, resampler.as_mut(), writer)?;
            buf.clear();
        }
    }
    if !buf.is_empty() {
        flush_chunk(&buf, src_channels, target_channels, resampler.as_mut(), writer)?;
    }
    Ok(())
}

/// Convert one interleaved 16-bit chunk to the target layout/rate and write it.
fn flush_chunk(
    interleaved: &[i16],
    src_channels: u16,
    target_channels: u16,
    resampler: Option<&mut MultiResampler>,
    writer: &mut WavOut,
) -> Result<()> {
    let planar = to_target_planar(interleaved, src_channels, target_channels);
    match resampler {
        None => write_planar(writer, &planar),
        Some(rs) => {
            let mut out: Vec<Vec<f32>> = vec![Vec::new(); target_channels as usize];
            rs.push(&planar, &mut out)?;
            write_planar(writer, &out)
        }
    }
}

/// Deinterleave a 16-bit chunk into `target_channels` planar `f32` buffers in
/// `[-1, 1]`. Same channel count → straight deinterleave; otherwise downmix to
/// mono and fan that out to every target channel (good enough for voice).
fn to_target_planar(interleaved: &[i16], src_channels: u16, target_channels: u16) -> Vec<Vec<f32>> {
    let src_ch = src_channels.max(1) as usize;
    let tgt_ch = target_channels.max(1) as usize;
    let frames = interleaved.len() / src_ch;

    if src_ch == tgt_ch {
        let mut planar = vec![Vec::with_capacity(frames); tgt_ch];
        for f in 0..frames {
            for (c, plane) in planar.iter_mut().enumerate() {
                plane.push(interleaved[f * src_ch + c] as f32 / 32768.0);
            }
        }
        planar
    } else {
        let mut mono = Vec::with_capacity(frames);
        for f in 0..frames {
            let sum: f32 = (0..src_ch)
                .map(|c| interleaved[f * src_ch + c] as f32 / 32768.0)
                .sum();
            mono.push(sum / src_ch as f32);
        }
        vec![mono; tgt_ch]
    }
}

/// Interleave planar `f32` channels back to 16-bit and append to `writer`.
fn write_planar(writer: &mut WavOut, planar: &[Vec<f32>]) -> Result<()> {
    if planar.is_empty() {
        return Ok(());
    }
    let frames = planar.iter().map(|c| c.len()).min().unwrap_or(0);
    for f in 0..frames {
        for plane in planar {
            let s = (plane[f].clamp(-1.0, 1.0) * 32767.0) as i16;
            writer.write_sample(s)?;
        }
    }
    Ok(())
}

/// Streaming multi-channel sinc resampler, mirroring the live pipeline's
/// [`crate::diarize::audio::Resampler16k`] recipe but parameterised on the output
/// rate and channel count. `SincFixedIn` consumes a fixed input block, so samples
/// are buffered per channel and drained a block at a time; a sub-block tail (<
/// ~1024 frames) at the end of a source is dropped, matching the live resampler.
struct MultiResampler {
    inner: SincFixedIn<f32>,
    channels: usize,
    block: usize,
    in_bufs: Vec<Vec<f32>>,
}

impl MultiResampler {
    fn new(input_rate: u32, output_rate: u32, channels: usize) -> Result<Self> {
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 128,
            window: WindowFunction::BlackmanHarris2,
        };
        let block = 1024;
        let inner = SincFixedIn::<f32>::new(
            output_rate as f64 / input_rate as f64,
            2.0,
            params,
            block,
            channels,
        )
        .map_err(|e| Error::Message(format!("resampler init failed: {e}")))?;
        Ok(Self {
            inner,
            channels,
            block,
            in_bufs: vec![Vec::new(); channels],
        })
    }

    /// Feed planar input frames; append produced output frames to `out` per channel.
    fn push(&mut self, planar: &[Vec<f32>], out: &mut [Vec<f32>]) -> Result<()> {
        for (c, plane) in self.in_bufs.iter_mut().enumerate() {
            if let Some(src) = planar.get(c) {
                plane.extend_from_slice(src);
            }
        }
        while self.in_bufs[0].len() >= self.block {
            let chunk: Vec<Vec<f32>> = (0..self.channels)
                .map(|c| self.in_bufs[c].drain(..self.block).collect())
                .collect();
            let resampled = self
                .inner
                .process(&chunk, None)
                .map_err(|e| Error::Message(format!("resample failed: {e}")))?;
            for (c, ch) in resampled.into_iter().enumerate() {
                out[c].extend_from_slice(&ch);
            }
        }
        Ok(())
    }
}
