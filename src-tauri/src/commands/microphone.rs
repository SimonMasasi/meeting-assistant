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

use crate::commands::storage::resolve_storage_dir;
use crate::db::pool;
use crate::error::{Error, Result};

/// The WAV writer shared between the recorder thread and cpal's audio callback.
type SharedWriter = Arc<Mutex<Option<hound::WavWriter<std::io::BufWriter<std::fs::File>>>>>;

/// An in-progress recording, held in managed state from `start_recording` until
/// `stop_recording` flips the stop flag and joins the capture thread.
struct ActiveRecording {
    meeting_id: String,
    path: PathBuf,
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

    // Seconds-since-epoch keeps successive recordings for a meeting distinct.
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(format!("recording-{stamp}.wav"));

    let stop = Arc::new(AtomicBool::new(false));

    // The stream must be built on the capture thread (it is `!Send`). The thread
    // reports whether setup succeeded over `ready` before entering its loop, so
    // device/permission failures surface here instead of being lost.
    let (ready_tx, ready_rx) = mpsc::channel::<std::result::Result<(), String>>();
    let thread = {
        let path = path.clone();
        let stop = stop.clone();
        let app = app.clone();
        let meeting_id = meeting_id.clone();
        std::thread::spawn(move || {
            capture(app, path, device_name, meeting_id, transcribe, stop, ready_tx)
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

    let size = std::fs::metadata(&active.path)?.len();
    let file_name = active
        .path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("recording.wav")
        .to_string();
    let saved = SavedRecording {
        id: format!("{}-{}", active.meeting_id, file_name),
        file_name,
        path: active.path.to_string_lossy().to_string(),
        size,
        duration_secs: None,
    };

    let pool = pool(&app).await?;
    sqlx::query(
        "INSERT INTO recordings (id, meeting_id, file_name, path, size)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET
             file_name = excluded.file_name,
             path      = excluded.path,
             size      = excluded.size",
    )
    .bind(&saved.id)
    .bind(&active.meeting_id)
    .bind(&saved.file_name)
    .bind(&saved.path)
    .bind(saved.size as i64)
    .execute(&pool)
    .await?;

    Ok(saved)
}

/// Whether a recording is currently in progress. Lets the UI restore its state
/// (e.g. after a route change) without tracking it separately.
#[tauri::command]
pub fn is_recording(state: State<'_, RecordingState>) -> bool {
    state.0.lock().unwrap().is_some()
}

/// Runs on the dedicated capture thread: open the chosen (or default) input
/// device, stream samples into the WAV writer until `stop` is set, then finalize
/// the file.
fn capture(
    app: tauri::AppHandle,
    path: PathBuf,
    device_name: Option<String>,
    meeting_id: String,
    transcribe: bool,
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

    // Prefer the named device when it's still present; otherwise fall back to the
    // OS default so a stale/removed selection doesn't break recording.
    let selected = device_name.as_deref().and_then(|wanted| {
        host.input_devices()
            .ok()?
            .find(|d| d.name().map(|n| n == wanted).unwrap_or(false))
    });
    let device = match selected.or_else(|| host.default_input_device()) {
        Some(d) => d,
        None => {
            let msg = "No microphone (input device) was found".to_string();
            let _ = ready.send(Err(msg.clone()));
            return Err(Error::Message(msg));
        }
    };
    let supported = try_ready!(device.default_input_config());

    let channels = supported.channels();
    let sample_rate = supported.sample_rate().0;
    let sample_format = supported.sample_format();
    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let writer: SharedWriter = Arc::new(Mutex::new(Some(try_ready!(hound::WavWriter::create(
        &path, spec
    )))));
    let config: cpal::StreamConfig = supported.config();

    // Total mono frames captured so far, bumped by the audio callback as audio is
    // recorded. The transcription worker reads this to measure how much audio is
    // still queued ahead of it (its real backlog), so the "Finishing transcription…"
    // countdown reflects the channel queue rather than just the current chunk.
    let captured = Arc::new(AtomicU64::new(0));

    // Live transcription tee: when enabled and the models are already present,
    // hand each callback's samples to a worker thread that resamples, diarizes,
    // and transcribes in real time. The WAV path below is untouched — this only
    // copies samples. Missing models degrade gracefully to plain recording.
    let (tee, pipeline): (Option<mpsc::Sender<Vec<f32>>>, Option<JoinHandle<()>>) = if transcribe {
        match crate::diarize::models::resolve(&app)
            .ok()
            .filter(|m| m.all_present())
        {
            Some(models) => {
                let (tx, rx) = mpsc::channel::<Vec<f32>>();
                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("recording.wav")
                    .to_string();
                let recording_id = format!("{meeting_id}-{file_name}");
                let app = app.clone();
                let worker_captured = captured.clone();
                let handle = std::thread::spawn(move || {
                    crate::diarize::pipeline::run(
                        app,
                        meeting_id,
                        Some(recording_id),
                        sample_rate,
                        channels,
                        models,
                        rx,
                        worker_captured,
                    );
                });
                (Some(tx), Some(handle))
            }
            None => {
                let _ = app.emit(
                    "transcription-error",
                    "Speech models are not downloaded yet".to_string(),
                );
                (None, None)
            }
        }
    } else {
        (None, None)
    };

    // Latest peak amplitude (0.0..1.0) seen by the audio callback since the loop
    // below last read it, stored as `f32` bits. The callback only writes here —
    // emitting Tauri events from a real-time audio thread could block it.
    let peak = Arc::new(AtomicU32::new(0));

    let err_fn = |err| eprintln!("microphone stream error: {err}");
    let w = writer.clone();
    let p = peak.clone();
    // A clone of the tee sender owned by the audio callback; the original stays
    // in this function so the channel only closes once recording fully stops.
    let t = tee.clone();
    let c = captured.clone();
    let stream = match sample_format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _: &_| write_samples(data, &w, &p, t.as_ref(), &c, channels, |s| (s.clamp(-1.0, 1.0) * 32767.0) as i16),
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _: &_| write_samples(data, &w, &p, t.as_ref(), &c, channels, |s| s),
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config,
            move |data: &[u16], _: &_| write_samples(data, &w, &p, t.as_ref(), &c, channels, |s| (s as i32 - 32768) as i16),
            err_fn,
            None,
        ),
        other => {
            let msg = format!("Unsupported microphone sample format: {other:?}");
            let _ = ready.send(Err(msg.clone()));
            return Err(Error::Message(msg));
        }
    };
    let stream = try_ready!(stream);
    try_ready!(stream.play());

    // Setup succeeded; capture is live.
    let _ = ready.send(Ok(()));

    // Drive the UI's waveform: read-and-reset the peak each tick (~20fps) and
    // emit a smoothed 0.0..1.0 level. Smoothing decays toward the new peak so
    // the animation eases up and down instead of flickering.
    let mut smoothed = 0.0f32;
    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(50));
        let raw = f32::from_bits(peak.swap(0, Ordering::Relaxed));
        // Snap up to a louder peak immediately; ease back down on quiet.
        smoothed = if raw > smoothed {
            raw
        } else {
            smoothed * 0.6 + raw * 0.4
        };
        let _ = app.emit("recording-level", smoothed);
    }

    // Dropping the stream halts the callback (and drops its tee clone) before we
    // finalize the header.
    drop(stream);
    if let Some(w) = writer.lock().unwrap().take() {
        w.finalize()?;
    }

    // Close the tee so the transcription worker knows recording ended; it then
    // drains any remaining backlog and persists/emits the final lines on its own
    // thread. We deliberately do NOT join it: if the worker fell behind real time
    // it could take a while to catch up, and `stop_recording` must return
    // promptly so the UI can react. Dropping the handle detaches the thread.
    drop(tee);
    drop(pipeline);
    Ok(())
}

/// Convert a callback buffer to 16-bit samples, append them to the WAV, record
/// the buffer's peak amplitude (0.0..1.0) into `peak` for the UI meter, and —
/// when live transcription is on — forward a normalized `f32` copy over `tee` to
/// the transcription worker. Sending never blocks the audio thread for long: the
/// channel is unbounded and the receiver only does heavy work on its own thread.
fn write_samples<T: Copy>(
    data: &[T],
    writer: &SharedWriter,
    peak: &AtomicU32,
    tee: Option<&mpsc::Sender<Vec<f32>>>,
    captured: &AtomicU64,
    channels: u16,
    to_i16: impl Fn(T) -> i16,
) {
    // Account for the audio captured this callback in mono frames (matching the
    // worker's `downmix` accounting), so it can measure how far behind it is.
    captured.fetch_add((data.len() / channels.max(1) as usize) as u64, Ordering::Relaxed);

    let mut buffer_peak = 0.0f32;
    let mut tee_buf = if tee.is_some() {
        Vec::with_capacity(data.len())
    } else {
        Vec::new()
    };
    if let Ok(mut guard) = writer.lock() {
        if let Some(w) = guard.as_mut() {
            for &sample in data {
                let s = to_i16(sample);
                let _ = w.write_sample(s);
                let amp = (s as f32).abs() / 32767.0;
                if amp > buffer_peak {
                    buffer_peak = amp;
                }
                if tee.is_some() {
                    tee_buf.push(s as f32 / 32768.0);
                }
            }
        }
    }
    if let Some(tx) = tee {
        if !tee_buf.is_empty() {
            let _ = tx.send(tee_buf);
        }
    }
    // Keep the highest peak across callbacks until the loop reads and resets it.
    let prev = f32::from_bits(peak.load(Ordering::Relaxed));
    if buffer_peak > prev {
        peak.store(buffer_peak.to_bits(), Ordering::Relaxed);
    }
}
