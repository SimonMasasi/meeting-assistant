//! Microphone authorization handling.
//!
//! On macOS, capturing audio requires the user to grant the app microphone
//! access (TCC). The bug this fixes: we used to just open a `cpal` stream, which
//! on a denied/undetermined permission silently yields an empty WAV instead of a
//! clear error. Here we query `AVCaptureDevice`'s authorization status up front
//! and can trigger the system prompt.
//!
//! macOS only re-prompts when the status is *not determined*; once a user has
//! denied access, `requestAccess` returns immediately without UI. So when the
//! status is already denied we open System Settings to the Microphone pane,
//! which is the only way the user can grant access again.
//!
//! Other platforms don't gate microphone capture behind a runtime prompt the
//! same way, so they report [`MicPermission::Granted`].

use serde::Serialize;

/// The user's current microphone authorization, mirrored from the OS.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum MicPermission {
    /// Access granted; recording can proceed.
    Granted,
    /// The user explicitly denied access. A re-request only opens System Settings.
    Denied,
    /// Never asked yet; requesting will show the system prompt.
    NotDetermined,
    /// Blocked by policy (e.g. parental controls / MDM); the user can't change it.
    Restricted,
}

/// Current authorization status, without prompting.
#[tauri::command]
pub fn check_microphone_permission() -> MicPermission {
    platform::status()
}

/// Ensure the app can use the microphone, prompting when possible.
///
/// - Not determined → show the system prompt and return the user's choice.
/// - Denied/Restricted → open System Settings (macOS won't re-prompt) and return
///   the (possibly still denied) status.
/// - Granted → returned as-is.
#[tauri::command]
pub async fn request_microphone_permission() -> MicPermission {
    // The macOS prompt is driven by a completion handler we block on, so run it
    // off the async runtime's worker thread.
    tauri::async_runtime::spawn_blocking(platform::request)
        .await
        .unwrap_or(MicPermission::Denied)
}

/// Status helper for other modules (e.g. the recorder guard).
pub fn current_status() -> MicPermission {
    platform::status()
}

#[cfg(target_os = "macos")]
mod platform {
    use super::MicPermission;
    use std::sync::mpsc;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2::{class, msg_send};
    use objc2_foundation::NSString;

    // Force the AVFoundation framework to load so `AVCaptureDevice` is resolvable
    // (cpal links CoreAudio, not AVFoundation).
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}

    // `AVAuthorizationStatus` is an NSInteger; these are its documented values.
    const STATUS_NOT_DETERMINED: isize = 0;
    const STATUS_RESTRICTED: isize = 1;
    const STATUS_DENIED: isize = 2;
    const STATUS_AUTHORIZED: isize = 3;

    /// `AVMediaTypeAudio` is the constant string `@"soun"`; building it directly
    /// avoids linking against the extern symbol.
    fn audio_media_type() -> objc2::rc::Retained<NSString> {
        NSString::from_str("soun")
    }

    fn map(status: isize) -> MicPermission {
        match status {
            STATUS_AUTHORIZED => MicPermission::Granted,
            STATUS_DENIED => MicPermission::Denied,
            STATUS_RESTRICTED => MicPermission::Restricted,
            STATUS_NOT_DETERMINED => MicPermission::NotDetermined,
            _ => MicPermission::NotDetermined,
        }
    }

    pub fn status() -> MicPermission {
        let media_type = audio_media_type();
        let cls = class!(AVCaptureDevice);
        let status: isize =
            unsafe { msg_send![cls, authorizationStatusForMediaType: &*media_type] };
        map(status)
    }

    pub fn request() -> MicPermission {
        match status() {
            MicPermission::NotDetermined => {
                let media_type = audio_media_type();
                let cls = class!(AVCaptureDevice);
                let (tx, rx) = mpsc::channel();
                // The framework retains this block and calls it once the user
                // responds; we block below until then.
                let handler = RcBlock::new(move |granted: Bool| {
                    let _ = tx.send(granted.as_bool());
                });
                unsafe {
                    let _: () = msg_send![
                        cls,
                        requestAccessForMediaType: &*media_type,
                        completionHandler: &*handler,
                    ];
                }
                match rx.recv() {
                    Ok(true) => MicPermission::Granted,
                    _ => MicPermission::Denied,
                }
            }
            MicPermission::Denied | MicPermission::Restricted => {
                open_privacy_settings();
                status()
            }
            granted => granted,
        }
    }

    /// Open System Settings → Privacy & Security → Microphone.
    fn open_privacy_settings() {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
            .spawn();
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::MicPermission;

    pub fn status() -> MicPermission {
        MicPermission::Granted
    }

    pub fn request() -> MicPermission {
        MicPermission::Granted
    }
}
