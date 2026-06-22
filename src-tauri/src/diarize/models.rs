//! ONNX model resolution and fetch-on-first-use.
//!
//! The pipeline needs three models — a Silero VAD, a speaker-embedding extractor,
//! and a Whisper ASR bundle. They total a few hundred MB, so rather than bundle
//! them in the installer we download them on first use into the OS app-data dir
//! and reuse them thereafter. Progress is emitted to the frontend as
//! `transcription-progress` events so a download can show a bar.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{Emitter, Manager};

use crate::error::{Error, Result};

/// Silero VAD, hosted alongside the sherpa-onnx ASR model releases.
const VAD_URL: &str =
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";
/// NeMo English speaker-verification embedding model (512-dim).
const EMBEDDING_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/nemo_en_speakerverification_speakernet.onnx";

const VAD_FILE: &str = "silero_vad.onnx";
const EMBEDDING_FILE: &str = "nemo_en_speakerverification_speakernet.onnx";

/// Whisper model sizes we offer. These are the *multilingual* sherpa-onnx
/// bundles (no `.en` suffix) so the chosen transcription language applies. Larger
/// sizes are more accurate but slower and bigger to download:
/// tiny ≈ 75 MB, base ≈ 145 MB, small ≈ 460 MB.
pub const WHISPER_SIZES: [&str; 3] = ["tiny", "base", "small"];

/// Normalize an arbitrary size string to one we support, defaulting to "tiny".
pub fn normalize_size(size: &str) -> &'static str {
    let s = size.trim().to_lowercase();
    WHISPER_SIZES.into_iter().find(|&w| w == s).unwrap_or("tiny")
}

/// Download URL for a Whisper size's tar.bz2 bundle. It unpacks to
/// `sherpa-onnx-whisper-{size}/{size}-encoder.onnx, {size}-decoder.onnx, {size}-tokens.txt`.
fn whisper_url(size: &str) -> String {
    format!("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-{size}.tar.bz2")
}

/// The unpacked directory name for a Whisper size.
fn whisper_dir_name(size: &str) -> String {
    format!("sherpa-onnx-whisper-{size}")
}

/// Resolved on-disk paths for every model the pipeline loads.
#[derive(Clone)]
pub struct ModelPaths {
    pub vad: PathBuf,
    pub embedding: PathBuf,
    pub whisper_encoder: PathBuf,
    pub whisper_decoder: PathBuf,
    pub whisper_tokens: PathBuf,
}

impl ModelPaths {
    /// Whether every required file exists on disk.
    pub fn all_present(&self) -> bool {
        [
            &self.vad,
            &self.embedding,
            &self.whisper_encoder,
            &self.whisper_decoder,
            &self.whisper_tokens,
        ]
        .iter()
        .all(|p| p.exists())
    }
}

/// Progress for a single model download, emitted as `transcription-progress`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    stage: String,
    file: String,
    pct: u8,
}

/// The directory holding downloaded models: `<app_data_dir>/models`.
pub fn models_dir(app: &tauri::AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| Error::Transcription(format!("no app data dir: {e}")))?
        .join("models");
    Ok(dir)
}

/// Compute the expected model paths for a given Whisper size without downloading
/// anything. The VAD and speaker-embedding models are size-independent and shared;
/// only the Whisper subdirectory varies, so multiple sizes can coexist on disk.
pub fn resolve(app: &tauri::AppHandle, size: &str) -> Result<ModelPaths> {
    let size = normalize_size(size);
    let dir = models_dir(app)?;
    let whisper = dir.join(whisper_dir_name(size));
    Ok(ModelPaths {
        vad: dir.join(VAD_FILE),
        embedding: dir.join(EMBEDDING_FILE),
        whisper_encoder: whisper.join(format!("{size}-encoder.onnx")),
        whisper_decoder: whisper.join(format!("{size}-decoder.onnx")),
        whisper_tokens: whisper.join(format!("{size}-tokens.txt")),
    })
}

/// Ensure all models for a given Whisper size are present, downloading any that
/// are missing. Idempotent: returns immediately once everything is in place.
pub fn ensure(app: &tauri::AppHandle, size: &str) -> Result<ModelPaths> {
    let size = normalize_size(size);
    let paths = resolve(app, size)?;
    if paths.all_present() {
        return Ok(paths);
    }

    let dir = models_dir(app)?;
    std::fs::create_dir_all(&dir)?;

    if !paths.vad.exists() {
        download_to(app, VAD_URL, &paths.vad, VAD_FILE)?;
    }
    if !paths.embedding.exists() {
        download_to(app, EMBEDDING_URL, &paths.embedding, EMBEDDING_FILE)?;
    }
    if !paths.whisper_encoder.exists()
        || !paths.whisper_decoder.exists()
        || !paths.whisper_tokens.exists()
    {
        let label = format!("whisper-{size}");
        let tarball = dir.join(format!("{label}.tar.bz2"));
        download_to(app, &whisper_url(size), &tarball, &label)?;
        emit(app, "extracting", &label, 100);
        extract_tar_bz2(&tarball, &dir)?;
        let _ = std::fs::remove_file(&tarball);
    }

    if !paths.all_present() {
        return Err(Error::Transcription(
            "model download finished but some files are still missing".into(),
        ));
    }
    emit(app, "ready", "models", 100);
    Ok(paths)
}

/// Stream a URL to `dest` (via a `.part` temp file), emitting throttled progress.
fn download_to(app: &tauri::AppHandle, url: &str, dest: &Path, label: &str) -> Result<()> {
    emit(app, "downloading", label, 0);
    let resp = ureq::get(url)
        .call()
        .map_err(|e| Error::Transcription(format!("download of {label} failed: {e}")))?;
    let total: u64 = resp
        .header("Content-Length")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let tmp = dest.with_extension("part");
    let mut file = std::fs::File::create(&tmp)?;
    let mut reader = resp.into_reader();
    let mut buf = [0u8; 64 * 1024];
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])?;
        downloaded += n as u64;
        // Emit at most ~every 2 MB to avoid flooding the event loop.
        if total > 0 && downloaded - last_emit >= 2 * 1024 * 1024 {
            last_emit = downloaded;
            let pct = ((downloaded * 100) / total).min(100) as u8;
            emit(app, "downloading", label, pct);
        }
    }
    file.flush()?;
    drop(file);
    std::fs::rename(&tmp, dest)?;
    emit(app, "downloading", label, 100);
    Ok(())
}

/// Unpack a `.tar.bz2` into `dir`.
fn extract_tar_bz2(tarball: &Path, dir: &Path) -> Result<()> {
    let file = std::fs::File::open(tarball)?;
    let decoder = bzip2::read::BzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);
    archive
        .unpack(dir)
        .map_err(|e| Error::Transcription(format!("failed to unpack whisper bundle: {e}")))?;
    Ok(())
}

fn emit(app: &tauri::AppHandle, stage: &str, file: &str, pct: u8) {
    let _ = app.emit(
        "transcription-progress",
        DownloadProgress {
            stage: stage.to_string(),
            file: file.to_string(),
            pct,
        },
    );
}
