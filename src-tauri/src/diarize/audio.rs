//! Audio conditioning for the speech pipeline.
//!
//! The recorder captures at the input device's native format (commonly 44.1 or
//! 48 kHz, mono or stereo), but Silero VAD, the speaker-embedding model, and
//! Whisper all expect **16 kHz mono `f32`**. This module downmixes to mono and
//! resamples to 16 kHz in a streaming fashion, so it can run on the live capture
//! as small buffers arrive rather than on a whole file.

use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};

use crate::error::{Error, Result};

/// Target sample rate for every model in the pipeline.
pub const TARGET_RATE: u32 = 16_000;

/// Average interleaved samples across `channels` into a mono signal. A no-op for
/// already-mono input.
pub fn downmix(interleaved: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return interleaved.to_vec();
    }
    let ch = channels as usize;
    interleaved
        .chunks_exact(ch)
        .map(|frame| frame.iter().sum::<f32>() / ch as f32)
        .collect()
}

/// Streaming mono resampler to [`TARGET_RATE`].
///
/// `SincFixedIn` consumes a fixed number of input frames per call, so incoming
/// mono samples are buffered and drained one fixed block at a time; leftover
/// samples carry over to the next [`push`](Resampler16k::push). When the input is
/// already 16 kHz it passes through untouched.
pub struct Resampler16k {
    inner: Option<SincFixedIn<f32>>,
    /// Mono samples awaiting a full resampler block.
    in_buf: Vec<f32>,
    /// Input frames the resampler wants per `process` call.
    block: usize,
}

impl Resampler16k {
    pub fn new(input_rate: u32) -> Result<Self> {
        if input_rate == TARGET_RATE {
            return Ok(Self {
                inner: None,
                in_buf: Vec::new(),
                block: 0,
            });
        }

        // Linear interpolation with a modest oversampling factor: speech models
        // are robust to small resampling artifacts, and this keeps the live
        // pipeline cheap enough to stay ahead of real time.
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 128,
            window: WindowFunction::BlackmanHarris2,
        };
        let block = 1024;
        let resampler = SincFixedIn::<f32>::new(
            TARGET_RATE as f64 / input_rate as f64,
            2.0,
            params,
            block,
            1, // mono
        )
        .map_err(|e| Error::Transcription(format!("resampler init failed: {e}")))?;

        Ok(Self {
            inner: Some(resampler),
            in_buf: Vec::new(),
            block,
        })
    }

    /// Feed mono samples; append any produced 16 kHz samples to `out`.
    pub fn push(&mut self, mono: &[f32], out: &mut Vec<f32>) -> Result<()> {
        match self.inner.as_mut() {
            None => {
                out.extend_from_slice(mono);
                Ok(())
            }
            Some(resampler) => {
                self.in_buf.extend_from_slice(mono);
                while self.in_buf.len() >= self.block {
                    let chunk: Vec<f32> = self.in_buf.drain(..self.block).collect();
                    let resampled = resampler
                        .process(&[chunk], None)
                        .map_err(|e| Error::Transcription(format!("resample failed: {e}")))?;
                    if let Some(channel) = resampled.into_iter().next() {
                        out.extend_from_slice(&channel);
                    }
                }
                Ok(())
            }
        }
    }
}
