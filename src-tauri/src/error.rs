//! Application-wide error type shared by all Tauri commands.
//!
//! Commands return [`Result<T>`], letting their bodies use `?` directly on
//! `std::fs`, `serde_json`, and base64 calls instead of sprinkling
//! `.map_err(|e| e.to_string())` everywhere. The [`Serialize`] impl turns the
//! error into a plain string when it crosses the IPC boundary, so the frontend
//! receives a readable message in its `catch` block.

use serde::{Serialize, Serializer};

/// Convenience alias for results returned from commands and helpers.
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Base64(#[from] base64::DecodeError),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),

    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),

    #[error(transparent)]
    Wav(#[from] hound::Error),

    /// On-device transcription / speaker-diarization failures (model load,
    /// download, or inference). sherpa-rs surfaces errors as `eyre`/boxed types,
    /// so they're flattened to a message at the call site.
    #[error("transcription error: {0}")]
    Transcription(String),

    /// Internal control signal: a resumable upload's server-side state is gone
    /// (410/404/403), so the transfer must be re-created from zero. Caught by
    /// [`crate::commands::tus_upload::upload_path`] and never surfaced to the
    /// frontend — if it ever is, the message still reads sensibly.
    #[error("the upload could not be resumed and must be started again")]
    UploadRestartNeeded,

    /// Domain errors that don't originate from an underlying library error,
    /// e.g. validation failures.
    #[error("{0}")]
    Message(String),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
