import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

/**
 * Resumable (tus 1.0.0) uploads of meeting audio to the cloud backend.
 *
 * The transfer itself runs entirely in Rust — see `src-tauri/src/commands/tus_upload.rs`.
 * This module only passes a **file path** across and listens for progress.
 *
 * Never read the file here. Recordings reach 2 GB, and `fs.readFile` would
 * return the whole thing as a `Uint8Array` in the webview, which crashes it.
 * The dialog plugin already gives us a path; hand that straight to `invoke`.
 */

/** The backend `UploadedFile` record returned once an upload finalizes. */
export interface UploadedFile {
  /**
   * The backend file id. A **string**, always: ids are 64-bit and would lose
   * precision as a JS number. Never `parseInt` it — pass it along verbatim.
   */
  id: string;
  filename: string;
  contentType: string;
  size: number;
  filePath: string;
  fileType: string;
  fileHash?: string | null;
  mimetype?: string | null;
}

/** Emitted per chunk (throttled to ~4/sec by the backend). */
export interface UploadProgress {
  uploadId: string;
  /** Byte counts are safe as JS numbers — 2 GB is far below 2^53. */
  bytesSent: number;
  totalBytes: number;
  bytesPerSecond: number;
  etaSeconds: number;
  /** First event of a run that picked up from a non-zero server offset. */
  resumed: boolean;
}

/**
 * How an upload run ended. A pause is not a failure: every byte already sent is
 * durable server-side, so resuming just starts the command again.
 */
export type UploadOutcome =
  | { status: "completed"; uploadId: string; file: UploadedFile }
  | { status: "paused"; uploadId: string; bytesSent: number; totalBytes: number }
  | { status: "cancelled"; uploadId: string };

/**
 * Where the upload → transcribe pipeline currently is.
 *
 * Getting audio transcribed in cloud mode is two long operations back to back —
 * sending the bytes, then waiting on the server — and from outside they look
 * identical: nothing happens for minutes. Progress *within* the upload arrives
 * on {@link onUploadProgress}; this says which half is running.
 */
export type TranscribeStageName =
  | "preparing"
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "finalizing"
  | "done"
  | "cancelled"
  /** Stopped after the in-flight chunk; resumable. File-picker path only. */
  | "paused"
  | "failed";

/**
 * The server's own stages within transcription, from its `status` events.
 * Only "transcribing" ever reports a position, and only on the local backend.
 */
export type ServerStage =
  | "downloading"
  | "diarizing"
  | "transcribing"
  | "saving";

export interface TranscribeStage {
  stage: TranscribeStageName;
  /** While uploading: matches `UploadProgress.uploadId`, and cancels this upload. */
  uploadId: string | null;
  /** Set when started from a saved recording; null for the file-picker path. */
  recordingId: string | null;
  fileName: string;
  /** The backend file id once known — a string, never parsed as a number. */
  fileId: string | null;
  /** Why it failed, on "failed". */
  message: string | null;
  /**
   * What the *server* is doing inside our "transcribing" stage. The outer
   * `stage` is the desktop pipeline's phase; this is the detail underneath.
   *
   * They behave very differently: "diarizing" runs before any segment exists and
   * emits no progress at all, so it must read as its own indeterminate step
   * rather than as a "transcribing" bar that cannot move.
   */
  serverStage: ServerStage | null;
  /**
   * Which engine transcribed ("soniox" | "local"). Soniox's async API exposes no
   * partials, so it never reports a position — the absence of a progress bar is
   * a property of the backend, not a stall.
   */
  backend: string | null;
  /**
   * How far into the audio the server has transcribed, and how long the audio is.
   * Only on "transcribing", and only when the server's transcription backend
   * reports a position — Soniox has no partials, so both stay null and the UI
   * shows an indeterminate bar instead of inventing a number.
   */
  processedMs: number | null;
  totalMs: number | null;
}

/** Stages the pipeline has finished with — nothing further will arrive. */
export function isTerminalStage(stage: TranscribeStageName): boolean {
  return stage === "done" || stage === "cancelled" || stage === "failed";
}

/** Pipeline stage changes for uploads and cloud transcription. */
export function onTranscribeStage(
  cb: (s: TranscribeStage) => void,
): Promise<UnlistenFn> {
  return listen<TranscribeStage>("transcribe-stage", (e) => cb(e.payload));
}

/** An upload that can still be continued, e.g. after the app was killed. */
export interface ResumableUpload {
  uploadId: string;
  localPath: string;
  fileName: string;
  totalSize: number;
  /** Epoch seconds. The server expires uploads after 24 h. */
  createdAt: number;
}

/**
 * Upload the file at `localPath`, resuming automatically if a previous attempt
 * left an unfinished transfer for that path. Resolves when the run ends — which
 * may be a completion, a pause, or a cancellation. Subscribe with
 * {@link onUploadProgress} to drive a progress bar.
 */
export function startFileUpload(localPath: string): Promise<UploadOutcome> {
  return invoke<UploadOutcome>("start_file_upload", { localPath });
}

/** Stop after the chunk currently in flight. The offset stays durable server-side. */
export function pauseFileUpload(uploadId: string): Promise<void> {
  return invoke<void>("pause_file_upload", { uploadId });
}

/** Continue a paused (or restart-interrupted) upload from the server's offset. */
export function resumeFileUpload(localPath: string): Promise<UploadOutcome> {
  return invoke<UploadOutcome>("resume_file_upload", { localPath });
}

/**
 * Abandon an upload: the backend issues the tus `DELETE` and clears its stored
 * state. `localPath` lets an upload that isn't currently running (left over from
 * a previous launch) be torn down too.
 */
export function cancelFileUpload(
  uploadId: string,
  localPath?: string,
): Promise<void> {
  return invoke<void>("cancel_file_upload", {
    uploadId,
    localPath: localPath ?? null,
  });
}

/**
 * Transcribe an already-uploaded file into a meeting, by the `id` from a
 * completed {@link UploadOutcome}. Long-running — minutes for a large recording
 * — so keep the UI responsive while it's in flight. Read the result back with
 * `getTranscript` from `@/services/transcription`.
 */
export function transcribeUploadedFile(
  meetingId: string,
  fileId: string,
  fileName?: string,
): Promise<void> {
  return invoke<void>("transcribe_uploaded_file", {
    meetingId,
    fileId,
    fileName: fileName ?? null,
  });
}

/** Unfinished uploads that can be resumed, newest first. */
export function listResumableUploads(): Promise<ResumableUpload[]> {
  return invoke<ResumableUpload[]>("list_resumable_uploads");
}

/** Per-chunk progress for every running upload. */
export function onUploadProgress(
  cb: (p: UploadProgress) => void,
): Promise<UnlistenFn> {
  return listen<UploadProgress>("upload-progress", (e) => cb(e.payload));
}

/** Fired once an upload finalizes, carrying the backend file record. */
export function onUploadComplete(
  cb: (file: UploadedFile) => void,
): Promise<UnlistenFn> {
  return listen<UploadedFile>("upload-complete", (e) => cb(e.payload));
}

/** Human-readable byte count, e.g. "1.9 GB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${bytes} B` : `${value.toFixed(1)} ${units[unit]}`;
}

/** Transfer speed as "12.4 MB/s". */
export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "—";
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** Remaining time as "3m 20s", or "—" while the rate is still unknown. */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
