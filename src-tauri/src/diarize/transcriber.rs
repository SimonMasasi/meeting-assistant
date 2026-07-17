//! Speech-to-text backends for the pipeline.
//!
//! The pipeline segments audio with an on-device VAD and clusters speakers with an
//! on-device embedding model regardless of mode; only the speech-to-text step
//! varies. In local mode that's Whisper running here; in cloud mode each utterance
//! is POSTed to the backend, which keeps the large Whisper bundle off the device.

use std::io::Cursor;
use std::time::{Duration, Instant};

use sherpa_rs::whisper::{WhisperConfig, WhisperRecognizer};
use tauri::Emitter;

use crate::diarize::models::ModelPaths;
use crate::error::{Error, Result};

/// Which speech-to-text backend the pipeline should use.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum TranscribeBackend {
    Local,
    Cloud,
}

/// Turns one utterance's worth of 16 kHz mono audio into text.
///
/// `Ok("")` means "no speech here" — the pipeline drops the line silently, which is
/// also how a recoverable failure degrades. `Err` is fatal: the pipeline reports it
/// and exits, leaving the WAV recording (a different thread) untouched.
///
/// Deliberately not `Send`: `WhisperRecognizer` isn't, and the pipeline builds its
/// transcriber in place on its own thread.
pub trait Transcriber {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> Result<String>;
}

/// On-device speech-to-text via sherpa-onnx Whisper.
pub struct WhisperTranscriber {
    inner: WhisperRecognizer,
}

impl WhisperTranscriber {
    pub fn new(models: &ModelPaths, language: &str) -> Result<Self> {
        let path = |p: &std::path::Path| p.to_string_lossy().to_string();
        let inner = WhisperRecognizer::new(WhisperConfig {
            encoder: path(&models.whisper_encoder),
            decoder: path(&models.whisper_decoder),
            tokens: path(&models.whisper_tokens),
            language: language.into(),
            ..Default::default()
        })
        .map_err(|e| Error::Transcription(format!("whisper init failed: {e}")))?;
        Ok(Self { inner })
    }
}

impl Transcriber for WhisperTranscriber {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> Result<String> {
        Ok(self.inner.transcribe(sample_rate, samples).text.trim().to_string())
    }
}

/// Short: this sits on the critical path of a live recording, so a hung request
/// must not stall the pipeline for long. Dropping one line beats freezing.
const UTTERANCE_TIMEOUT: Duration = Duration::from_secs(15);
/// Give up on live transcription after this many utterances fail back-to-back.
const MAX_CONSECUTIVE_FAILURES: u32 = 5;
/// A hard-down backend would otherwise fire an error per utterance (~10-20/min).
const ERROR_EMIT_INTERVAL: Duration = Duration::from_secs(30);

/// Cloud speech-to-text: one stateless HTTP round-trip per utterance.
///
/// Transient failures drop a single line and keep going; only a sustained outage
/// stops the pipeline, since the WAV is still being written and can be batch
/// transcribed afterwards.
pub struct CloudTranscriber {
    app: tauri::AppHandle,
    language: String,
    consecutive_failures: u32,
    last_error_emit: Option<Instant>,
}

impl CloudTranscriber {
    pub fn new(app: tauri::AppHandle, language: &str) -> Self {
        Self {
            app,
            language: language.to_string(),
            consecutive_failures: 0,
            last_error_emit: None,
        }
    }

    /// One round-trip. Separate so the caller can retry it without re-encoding.
    fn post(&self, wav: Vec<u8>) -> Result<String> {
        let path = format!(
            "/inference/transcribe-utterance?language={}",
            self.language
        );
        let data = tauri::async_runtime::block_on(crate::cloud::client::authed_multipart(
            &self.app,
            &path,
            "utterance.wav",
            wav,
            UTTERANCE_TIMEOUT,
        ))?;
        Ok(data
            .get("text")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string())
    }

    /// Report a dropped line, at most once per [`ERROR_EMIT_INTERVAL`].
    fn emit_error_throttled(&mut self, e: &Error) {
        let now = Instant::now();
        let due = self
            .last_error_emit
            .map_or(true, |t| now.duration_since(t) >= ERROR_EMIT_INTERVAL);
        if due {
            self.last_error_emit = Some(now);
            let _ = self.app.emit(
                "transcription-error",
                format!("Cloud transcription failed for an utterance — the line was skipped. ({e})"),
            );
        }
    }
}

impl Transcriber for CloudTranscriber {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> Result<String> {
        let wav = encode_wav(sample_rate, samples)?;

        // Retry once immediately: no backoff, because audio is already queueing up
        // behind us and the round trip is itself the delay. The endpoint is
        // stateless, so a duplicate request is harmless.
        let result = match self.post(wav.clone()) {
            Ok(text) => Ok(text),
            Err(_) => self.post(wav),
        };

        match result {
            Ok(text) => {
                self.consecutive_failures = 0;
                Ok(text)
            }
            Err(e) => {
                self.consecutive_failures += 1;
                self.emit_error_throttled(&e);
                if self.consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                    return Err(Error::Transcription(format!(
                        "Cloud transcription failed repeatedly — live transcript stopped. \
                         The recording is unaffected; use the Transcribe button after stopping. ({e})"
                    )));
                }
                // Drop just this line and keep listening.
                Ok(String::new())
            }
        }
    }
}

/// Encode 16 kHz mono float samples as an in-memory 16-bit PCM WAV. The backend
/// expects exactly this shape (16 kHz, mono, 16-bit PCM).
fn encode_wav(sample_rate: u32, samples: &[f32]) -> Result<Vec<u8>> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::with_capacity(samples.len() * 2 + 44));
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| Error::Transcription(format!("wav encode failed: {e}")))?;
        for &s in samples {
            let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
            writer
                .write_sample(v)
                .map_err(|e| Error::Transcription(format!("wav encode failed: {e}")))?;
        }
        writer
            .finalize()
            .map_err(|e| Error::Transcription(format!("wav encode failed: {e}")))?;
    }
    Ok(cursor.into_inner())
}

#[cfg(test)]
mod tests {
    use super::encode_wav;
    use crate::diarize::audio::TARGET_RATE;

    /// The backend rejects anything that isn't 16 kHz mono 16-bit PCM, so the
    /// header must say exactly that and the samples must survive the round-trip.
    #[test]
    fn utterances_encode_as_16k_mono_pcm() {
        let samples = [0.0f32, 0.5, -0.5, 1.0, -1.0];
        let bytes = encode_wav(TARGET_RATE, &samples).expect("encode");

        let mut reader = hound::WavReader::new(std::io::Cursor::new(bytes)).expect("parse");
        let spec = reader.spec();
        assert_eq!(spec.channels, 1);
        assert_eq!(spec.sample_rate, TARGET_RATE);
        assert_eq!(spec.bits_per_sample, 16);
        assert_eq!(spec.sample_format, hound::SampleFormat::Int);

        let decoded: Vec<i16> = reader.samples::<i16>().map(|s| s.unwrap()).collect();
        assert_eq!(decoded, vec![0, 16383, -16383, 32767, -32767]);
    }

    /// Samples outside [-1, 1] must clamp rather than wrap: a wrapped peak would
    /// flip loud speech to the opposite rail and corrupt the utterance.
    #[test]
    fn out_of_range_samples_clamp() {
        let bytes = encode_wav(TARGET_RATE, &[9.0, -9.0]).expect("encode");
        let mut reader = hound::WavReader::new(std::io::Cursor::new(bytes)).expect("parse");
        let decoded: Vec<i16> = reader.samples::<i16>().map(|s| s.unwrap()).collect();
        assert_eq!(decoded, vec![32767, -32767]);
    }
}
