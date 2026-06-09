import { invoke } from "@tauri-apps/api/core";

export interface SavedRecording {
  id: string;
  fileName: string;
  path: string;
  size: number;
}

/**
 * Start capturing the default microphone into a WAV file under the meeting's
 * storage folder. Rejects if a recording is already running or no input device
 * is available (the Rust side surfaces a readable message).
 */
export function startRecording(meetingId: string): Promise<void> {
  return invoke<void>("start_recording", { meetingId });
}

/** Stop the active recording, finalize the WAV, and return its file reference. */
export function stopRecording(): Promise<SavedRecording> {
  return invoke<SavedRecording>("stop_recording");
}

/** Whether a recording is currently in progress (e.g. to restore UI state). */
export function isRecording(): Promise<boolean> {
  return invoke<boolean>("is_recording");
}

export type MicPermission =
  | "granted"
  | "denied"
  | "notDetermined"
  | "restricted";

/** Current microphone authorization, without prompting. */
export function checkMicrophonePermission(): Promise<MicPermission> {
  return invoke<MicPermission>("check_microphone_permission");
}

/**
 * Ensure mic access, prompting when possible. If access was previously denied,
 * macOS won't re-prompt — this opens System Settings → Microphone so the user
 * can grant it again — and returns the (possibly still denied) status.
 */
export function requestMicrophonePermission(): Promise<MicPermission> {
  return invoke<MicPermission>("request_microphone_permission");
}
