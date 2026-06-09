//! Native microphone capture for in-person meetings.
//!
//! In-person meetings have no online stream to pull audio from, so we record the
//! room with the machine's default input device. Capture runs on a dedicated
//! thread because a [`cpal`] stream is `!Send` and must be created, played, and
//! dropped on the same thread; the command layer only holds a stop flag and the
//! thread's join handle in managed state between `start_recording` and
//! `stop_recording`.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{SystemTime, UNIX_EPOCH};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use tauri::State;

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

/// A reference to a finished recording, returned to the frontend.
#[derive(Serialize)]
pub struct SavedRecording {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub size: u64,
}

/// Begin capturing the default microphone into a fresh WAV file under the
/// meeting's storage folder. Errors if a recording is already running or no
/// input device is available.
#[tauri::command]
pub async fn start_recording(
    app: tauri::AppHandle,
    state: State<'_, RecordingState>,
    meeting_id: String,
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
        std::thread::spawn(move || capture(path, stop, ready_tx))
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

/// Runs on the dedicated capture thread: open the default input device, stream
/// samples into the WAV writer until `stop` is set, then finalize the file.
fn capture(
    path: PathBuf,
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
    let device = match host.default_input_device() {
        Some(d) => d,
        None => {
            let msg = "No microphone (input device) was found".to_string();
            let _ = ready.send(Err(msg.clone()));
            return Err(Error::Message(msg));
        }
    };
    let supported = try_ready!(device.default_input_config());

    let channels = supported.channels();
    let sample_format = supported.sample_format();
    let spec = hound::WavSpec {
        channels,
        sample_rate: supported.sample_rate().0,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let writer: SharedWriter = Arc::new(Mutex::new(Some(try_ready!(hound::WavWriter::create(
        &path, spec
    )))));
    let config: cpal::StreamConfig = supported.config();

    let err_fn = |err| eprintln!("microphone stream error: {err}");
    let w = writer.clone();
    let stream = match sample_format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _: &_| write_samples(data, &w, |s| (s.clamp(-1.0, 1.0) * 32767.0) as i16),
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _: &_| write_samples(data, &w, |s| s),
            err_fn,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config,
            move |data: &[u16], _: &_| write_samples(data, &w, |s| (s as i32 - 32768) as i16),
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

    while !stop.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    // Dropping the stream halts the callback before we finalize the header.
    drop(stream);
    if let Some(w) = writer.lock().unwrap().take() {
        w.finalize()?;
    }
    Ok(())
}

/// Convert a callback buffer to 16-bit samples and append them to the WAV.
fn write_samples<T: Copy>(data: &[T], writer: &SharedWriter, to_i16: impl Fn(T) -> i16) {
    if let Ok(mut guard) = writer.lock() {
        if let Some(w) = guard.as_mut() {
            for &sample in data {
                let _ = w.write_sample(to_i16(sample));
            }
        }
    }
}
