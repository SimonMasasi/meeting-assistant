import LinearProgress from "@mui/material/LinearProgress";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import {
  formatBytes,
  formatEta,
  formatSpeed,
  TranscribeStage,
  UploadProgress,
} from "@/services/upload";
import { formatTimestamp } from "@/services/transcription";

/**
 * Narrates the upload → transcribe pipeline for one file.
 *
 * Both entry points render this: the per-recording "Transcribe" action in
 * {@link ../components/recordings-list} and the file picker in
 * {@link ../components/upload-panel}. They run the identical backend pipeline,
 * so they say the same things in the same words.
 *
 * The distinction that matters is upload vs. server work. They take comparable
 * amounts of time and look the same from outside — nothing happening — but only
 * the upload has measurable progress, and only the upload can be cancelled.
 */
export function TranscribeStatus({
  stage,
  progress,
  onCancel,
}: {
  stage: TranscribeStage;
  /** The matching `upload-progress` payload, when one has arrived. */
  progress: UploadProgress | null;
  /** Omit to hide the cancel control (e.g. the caller has nothing to cancel). */
  onCancel?: () => void;
}) {
  const uploading = stage.stage === "uploading";
  const total = progress?.totalBytes ?? 0;
  const sent = progress?.bytesSent ?? 0;

  // Two things can report real progress: the upload (bytes) and, while the server
  // transcribes, its position in the audio. The latter only arrives from backends
  // that produce partials — Soniox doesn't, so that case still gets an
  // indeterminate bar rather than a number invented to look reassuring.
  //
  // The server's own sub-stage gates this. Only its "transcribing" step reports a
  // position at all: "downloading", "diarizing" and "saving" emit none, and
  // diarizing in particular can run for a long time before the first segment
  // exists. Showing a bar frozen at the last position through all of that reads
  // as a hang, so those stages are explicitly indeterminate.
  const audioTotal = stage.totalMs ?? 0;
  const audioDone = stage.processedMs ?? 0;
  const serverIsTranscribing =
    stage.serverStage == null || stage.serverStage === "transcribing";
  const transcribingWithPosition =
    stage.stage === "transcribing" && serverIsTranscribing && audioTotal > 0;

  const determinate = uploading ? total > 0 : transcribingWithPosition;
  const percent = uploading
    ? total > 0
      ? Math.min(100, (sent / total) * 100)
      : 0
    : transcribingWithPosition
      ? Math.min(100, (audioDone / audioTotal) * 100)
      : 0;

  if (stage.stage === "done" || stage.stage === "cancelled") return null;

  if (stage.stage === "failed") {
    return (
      <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
        {stage.message || "Transcription failed"}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <LinearProgress
          variant={determinate ? "determinate" : "indeterminate"}
          value={percent}
          className="flex-1 rounded"
        />
        {uploading && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel upload"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <CloseRoundedIcon sx={{ fontSize: 14 }} />
            Cancel
          </button>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
        <span>{primaryLabel(stage, progress)}</span>
        {uploading && progress && (
          <span>
            {formatSpeed(progress.bytesPerSecond)} ·{" "}
            {formatEta(progress.etaSeconds)} left
          </span>
        )}
      </div>

      {uploading && progress?.resumed && total > 0 && (
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Resuming at {Math.round((sent / total) * 100)}%
        </p>
      )}
    </div>
  );
}

/** The main line of text: what is happening, and how far along if knowable. */
function primaryLabel(
  stage: TranscribeStage,
  progress: UploadProgress | null,
): string {
  switch (stage.stage) {
    case "preparing":
      return "Preparing…";
    case "uploading":
      if (!progress || progress.totalBytes === 0) return "Starting upload…";
      return `Uploading · ${formatBytes(progress.bytesSent)} of ${formatBytes(
        progress.totalBytes,
      )}`;
    case "uploaded":
      return "Upload complete";
    case "transcribing":
      return serverLabel(stage);
    case "finalizing":
      return "Saving transcript…";
    default:
      return "Working…";
  }
}

/**
 * What the server is doing, once it has told us. Each sub-stage gets its own
 * wording because they are genuinely different waits — naming them all
 * "transcribing" is how a long diarization pass ends up looking like a freeze.
 */
function serverLabel(stage: TranscribeStage): string {
  switch (stage.serverStage) {
    case "downloading":
      return "Fetching the audio on the server…";
    case "diarizing":
      // No progress events arrive during this step at all, and it can run for a
      // large share of the total time. Say so, so the silence is expected.
      return "Analysing speakers… no progress is reported during this step";
    case "saving":
      return "Saving transcript…";
    case "transcribing":
    default:
      // With a position, say where it is — lines are streaming into the
      // transcript panel meanwhile, so the wait is no longer blind.
      if (stage.totalMs && stage.totalMs > 0) {
        return `Transcribing · ${formatTimestamp(
          stage.processedMs ?? 0,
        )} of ${formatTimestamp(stage.totalMs)}`;
      }
      // No position: either the run just started, or this backend has none.
      // Soniox returns everything at the end, so name it rather than let the
      // missing bar read as a stall.
      return stage.backend === "soniox"
        ? "Transcribing on the server… Soniox reports no progress until it finishes"
        : "Transcribing on the server… this can take several minutes";
  }
}
