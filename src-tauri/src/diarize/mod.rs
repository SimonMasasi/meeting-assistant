//! On-device speaker diarization + transcription for in-person meetings.
//!
//! A physical meeting is captured from a single microphone (see
//! [`crate::commands::microphone`]). To answer "who said what", audio is teed off
//! the recording thread into a [`pipeline`] worker that runs an online,
//! utterance-by-utterance pipeline entirely offline on the CPU:
//!
//! ```text
//! device-rate samples → resample to 16 kHz mono → Silero VAD (utterance bounds)
//!   → per utterance: speaker embedding → online clustering → "Speaker N"
//!                    ASR                → text
//!   → persist a `transcripts` row + emit a `transcript-line` event
//! ```
//!
//! VAD and speaker clustering always run on-device via `sherpa-rs` (bindings to
//! k2-fsa sherpa-onnx); their ONNX model files are fetched on first use by
//! [`models`]. Only the ASR step varies by app mode — see [`transcriber`] — so
//! cloud mode skips the large Whisper download entirely.

pub mod audio;
pub mod models;
pub mod pipeline;
pub mod transcriber;
