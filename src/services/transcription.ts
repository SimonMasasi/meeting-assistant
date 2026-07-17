import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { colorFor, initialsOf, TranscriptLine } from "@/pages/meetings/mock-data";

/** A persisted/live transcript line as returned by the Rust pipeline. */
export interface TranscriptSegment {
  id: string;
  speakerLabel: string;
  speakerName: string | null;
  startMs: number;
  endMs: number;
  text: string;
}

/** Progress for a model download, emitted while `ensureTranscriptionModels` runs. */
export interface TranscriptionProgress {
  stage: "downloading" | "extracting" | "ready" | string;
  file: string;
  pct: number;
}

/**
 * Live progress of the transcription worker. `receivedMs` is the audio handed to
 * the worker, `processedMs` how much it has transcribed, and `backlogMs` how far
 * behind real time it is — which drains to zero (and `state` to "done") after the
 * recording stops.
 */
export interface TranscriptionStatus {
  state: "loading" | "running" | "done" | string;
  receivedMs: number;
  processedMs: number;
  backlogMs: number;
}

/** Which speech models are on disk. */
export interface ModelsReady {
  /** VAD + speaker embedding: needed in both modes, and all cloud mode needs. */
  diarize: boolean;
  /** The Whisper bundle: only local mode transcribes on-device. */
  whisper: boolean;
  /** Mode-aware: can transcription start without a download? */
  ready: boolean;
}

/** Whether the speech models the current mode needs are already downloaded. */
export function transcriptionModelsReady(): Promise<ModelsReady> {
  return invoke<ModelsReady>("transcription_models_ready");
}

/**
 * Download any missing speech models the current mode needs: VAD + speaker
 * embedding, plus Whisper in local mode (cloud mode transcribes on the backend).
 * Resolves once everything is present; subscribe with `onTranscriptionProgress`
 * to show a download bar. Safe to call repeatedly.
 */
export function ensureTranscriptionModels(): Promise<void> {
  return invoke<void>("ensure_transcription_models");
}

/** Load the saved, speaker-labeled transcript for a meeting, in spoken order. */
export function getTranscript(meetingId: string): Promise<TranscriptSegment[]> {
  return invoke<TranscriptSegment[]>("get_transcript", { meetingId });
}

/**
 * (Re)transcribe an already-saved recording on demand. Any existing transcript
 * for that recording is removed first, then it's run through the on-device
 * pipeline; progress streams via the usual `transcript-line` /
 * `transcription-status` events. Resolves once the worker is launched, not when
 * it finishes — watch `onTranscriptionStatus` for the "done" state.
 */
export function transcribeRecording(recordingId: string): Promise<void> {
  return invoke<void>("transcribe_recording", { recordingId });
}

/** Give a speaker cluster a display name, applied to all of its lines. */
export function renameSpeaker(
  meetingId: string,
  speakerLabel: string,
  newName: string,
): Promise<void> {
  return invoke<void>("rename_speaker", { meetingId, speakerLabel, newName });
}

/** Live transcript lines, emitted one per utterance as the meeting is recorded. */
export function onTranscriptLine(
  cb: (line: TranscriptSegment) => void,
): Promise<UnlistenFn> {
  return listen<TranscriptSegment>("transcript-line", (e) => cb(e.payload));
}

/** Model-download / pipeline progress updates. */
export function onTranscriptionProgress(
  cb: (p: TranscriptionProgress) => void,
): Promise<UnlistenFn> {
  return listen<TranscriptionProgress>("transcription-progress", (e) =>
    cb(e.payload),
  );
}

/** Worker progress: model loading, live transcription, and post-stop backlog. */
export function onTranscriptionStatus(
  cb: (status: TranscriptionStatus) => void,
): Promise<UnlistenFn> {
  return listen<TranscriptionStatus>("transcription-status", (e) =>
    cb(e.payload),
  );
}

/** Non-fatal pipeline errors (e.g. models missing, inference failed). */
export function onTranscriptionError(
  cb: (message: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("transcription-error", (e) => cb(e.payload));
}

/** mm:ss for a millisecond offset, matching the transcript timestamp style. */
export function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Map a backend segment to the presentational `TranscriptLine` the UI renders.
 * The avatar color is keyed off the raw cluster label so it stays stable for a
 * speaker even after they're renamed; speaker order of first appearance drives
 * the palette.
 */
export function segmentToLine(
  seg: TranscriptSegment,
  labelOrder: string[],
): TranscriptLine {
  const speaker = seg.speakerName ?? seg.speakerLabel;
  const colorIndex = Math.max(0, labelOrder.indexOf(seg.speakerLabel));
  return {
    id: seg.id,
    speaker,
    initials: initialsOf(speaker),
    color: colorFor(colorIndex),
    timestamp: formatTimestamp(seg.startMs),
    text: seg.text,
  };
}
