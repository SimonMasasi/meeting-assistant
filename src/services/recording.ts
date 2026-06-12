import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface SavedRecording {
  id: string;
  fileName: string;
  path: string;
  size: number;
}

export interface MicrophoneDevice {
  name: string;
  isDefault: boolean;
}

/** List available microphone input devices, marking the OS default. */
export function listMicrophones(): Promise<MicrophoneDevice[]> {
  return invoke<MicrophoneDevice[]>("list_microphones");
}

/**
 * Start capturing a microphone into a WAV file under the meeting's storage
 * folder. `deviceName` selects the input device by name (from `listMicrophones`);
 * omit it to use the OS default. Rejects if a recording is already running or no
 * input device is available (the Rust side surfaces a readable message).
 */
export function startRecording(
  meetingId: string,
  deviceName?: string,
  transcribe = false,
): Promise<void> {
  return invoke<void>("start_recording", {
    meetingId,
    deviceName: deviceName ?? null,
    transcribe,
  });
}

/** Stop the active recording, finalize the WAV, and return its file reference. */
export function stopRecording(): Promise<SavedRecording> {
  return invoke<SavedRecording>("stop_recording");
}

/** Whether a recording is currently in progress (e.g. to restore UI state). */
export function isRecording(): Promise<boolean> {
  return invoke<boolean>("is_recording");
}

/**
 * Subscribe to live microphone level updates (a smoothed 0..1 amplitude) emitted
 * by the backend while a recording is active, for driving a waveform animation.
 * Resolves with an unlisten function — call it to stop receiving events.
 */
export function onRecordingLevel(
  cb: (level: number) => void,
): Promise<UnlistenFn> {
  return listen<number>("recording-level", (e) => cb(e.payload));
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
