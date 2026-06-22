//! Tauri command handlers, grouped by domain. Each submodule owns its own
//! command-specific structs alongside the commands that produce them.

pub mod ai;
pub mod attachments;
pub mod greet;
pub mod mail;
pub mod mic_permission;
pub mod microphone;
pub mod models;
pub mod recordings;
pub mod storage;
pub mod summary;
pub mod transcription;
