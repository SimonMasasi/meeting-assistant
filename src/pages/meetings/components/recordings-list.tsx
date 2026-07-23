import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useAtomValue } from "jotai";
import toast from "react-hot-toast";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CallMergeRoundedIcon from "@mui/icons-material/CallMergeRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import GraphicEqRoundedIcon from "@mui/icons-material/GraphicEqRounded";
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import AppDialog from "@/components/shared/dialogs/app-dialog";
import {
  deleteRecording,
  isRecording,
  listMeetingRecordings,
  mergeRecordings,
  SavedRecording,
} from "@/services/recording";
import {
  ensureTranscriptionModels,
  onTranscriptionError,
  onTranscriptionStatus,
  transcribeRecording,
  transcriptionModelsReady,
} from "@/services/transcription";
import { appModeAtom } from "@/atoms/app-mode-atoms";
import { Meeting } from "@/services/meetings";
import {
  cancelFileUpload,
  isTerminalStage,
  onTranscribeStage,
  onUploadProgress,
  TranscribeStage,
  UploadProgress,
} from "@/services/upload";
import { TranscribeStatus } from "./transcribe-status";

/** Human-readable file size. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Short label for the transcribe button's tooltip, tracking the live stage. */
function stageTooltip(stage: TranscribeStage | null): string {
  switch (stage?.stage) {
    case "preparing":
      return "Preparing…";
    case "uploading":
      return "Uploading…";
    case "uploaded":
      return "Upload complete";
    case "finalizing":
      return "Saving transcript…";
    default:
      return "Transcribing…";
  }
}

/** mm:ss for a duration in seconds, or "—" when unknown. */
function formatDuration(secs?: number): string {
  if (secs == null || !Number.isFinite(secs)) return "—";
  const total = Math.round(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Lists a meeting's saved recordings with inline playback, single-recording
 * delete, and multi-select merge. Merging combines the selection (in capture
 * order) into one file on the backend and deletes the originals; this card just
 * drives that flow and refreshes from the database afterward.
 */
export function RecordingsList({
  meeting,
  refreshSignal,
  onTranscriptChanged,
}: {
  meeting: Meeting;
  refreshSignal?: number;
  /** Called when a recording's transcript is (re)generated, so the parent can
   *  refresh the transcript panel. Fired when transcription starts (prior lines
   *  removed) and again when the worker reports "done". */
  onTranscriptChanged?: () => void;
}) {
  const appMode = useAtomValue(appModeAtom);
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The recording currently being transcribed, if any (drives the row spinner).
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  // Cloud mode runs upload-then-transcribe, minutes of work with no output. These
  // two drive the inline status under the row so the user can see which half is
  // running and how far along the upload is.
  const [transcribeStage, setTranscribeStage] = useState<TranscribeStage | null>(
    null,
  );
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  // Mirror the in-flight flag and the callback in refs so the global event
  // listeners (subscribed once) read current values without restale closures.
  const transcribingRef = useRef(false);
  // The transcribe handler awaits a call that outlives its own closure, so it
  // reads the final stage through a ref rather than a captured value.
  const transcribeStageRef = useRef<TranscribeStage | null>(null);
  const onTranscriptChangedRef = useRef(onTranscriptChanged);
  useEffect(() => {
    onTranscriptChangedRef.current = onTranscriptChanged;
  }, [onTranscriptChanged]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recs, active] = await Promise.all([
        listMeetingRecordings(meeting.id),
        isRecording(),
      ]);
      setRecordings(recs);
      setRecordingActive(active);
      // Drop any selected ids that no longer exist (e.g. after a merge/delete).
      setSelected(
        (prev) => new Set([...prev].filter((id) => recs.some((r) => r.id === id))),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [meeting.id]);

  // Reload on mount and whenever the parent bumps refreshSignal (e.g. after the
  // recorder starts or stops), so a newly saved file shows without a manual refresh.
  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  // Watch the (global) transcription worker so a post-hoc "Transcribe" finishes
  // cleanly: clear the row spinner and refresh the transcript on "done", and
  // surface failures. Only reacts when we started a transcription (transcribingRef).
  useEffect(() => {
    let unlistenStatus: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;
    let active = true;
    onTranscriptionStatus((s) => {
      if (s.state === "done" && transcribingRef.current) {
        transcribingRef.current = false;
        setTranscribingId(null);
        onTranscriptChangedRef.current?.();
      }
    }).then((fn) => {
      if (active) unlistenStatus = fn;
      else fn();
    });
    onTranscriptionError((msg) => {
      if (transcribingRef.current) {
        transcribingRef.current = false;
        setTranscribingId(null);
        toast.error(msg || "Transcription failed");
      }
    }).then((fn) => {
      if (active) unlistenError = fn;
      else fn();
    });
    return () => {
      active = false;
      if (unlistenStatus) unlistenStatus();
      if (unlistenError) unlistenError();
    };
  }, []);

  // Follow the cloud pipeline. Both subscriptions are global and registered once;
  // the stage payload carries the recordingId, so a stage for some other file
  // (e.g. the file-picker upload panel) is ignored here.
  useEffect(() => {
    let unlistenStage: (() => void) | null = null;
    let unlistenProgress: (() => void) | null = null;
    let active = true;

    onTranscribeStage((s) => {
      if (!s.recordingId) return;
      transcribeStageRef.current = s;
      setTranscribeStage(s);
      if (isTerminalStage(s.stage)) {
        // Clear the numbers so a later run can't briefly show the last one's.
        setUploadProgress(null);
        setTranscribingId(null);
        if (s.stage === "done") onTranscriptChangedRef.current?.();
        if (s.stage === "failed") toast.error(s.message || "Transcription failed");
        // Leave the failure text on screen; clear the rest.
        if (s.stage !== "failed") setTranscribeStage(null);
      }
    }).then((fn) => (active ? (unlistenStage = fn) : fn()));

    onUploadProgress((p) => setUploadProgress(p)).then((fn) =>
      active ? (unlistenProgress = fn) : fn(),
    );

    return () => {
      active = false;
      unlistenStage?.();
      unlistenProgress?.();
    };
  }, []);

  /** Stop the upload half of the pipeline. Server-side work can't be interrupted. */
  const handleCancelUpload = useCallback(() => {
    const uploadId = transcribeStage?.uploadId;
    if (uploadId) cancelFileUpload(uploadId).catch((e) => toast.error(String(e)));
  }, [transcribeStage?.uploadId]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePlay = (rec: SavedRecording) => {
    setPlayingId((cur) => (cur === rec.id ? null : rec.id));
  };

  const handleDelete = async (rec: SavedRecording) => {
    if (
      !window.confirm(`Delete "${rec.fileName}"? This can't be undone.`)
    )
      return;
    setError(null);
    try {
      if (playingId === rec.id) setPlayingId(null);
      await deleteRecording(rec.id);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleTranscribe = async (rec: SavedRecording) => {
    if (
      !window.confirm(
        `Transcribe "${rec.fileName}"? Any existing transcript for it will be replaced.`,
      )
    )
      return;
    setError(null);

    // Cloud mode: the WAV is uploaded, then transcribed on the server. Both halves
    // take minutes, so the `transcribe-stage` listener above drives the inline
    // status; the terminal stage clears the spinner and refreshes the transcript.
    if (appMode === "cloud") {
      setTranscribingId(rec.id);
      setUploadProgress(null);
      setTranscribeStage(null);
      try {
        await transcribeRecording(rec.id);
        // A cancel resolves normally, so only claim success if it really ran.
        if (transcribeStageRef.current?.stage !== "cancelled") {
          toast.success("Transcribed.");
        }
      } catch (e) {
        // The "failed" stage already showed the reason inline and toasted it.
        setError(typeof e === "string" ? e : "Failed to transcribe recording");
      } finally {
        // The terminal stage normally clears this; do it here too so a dropped
        // event can't leave the row spinning forever. The command having
        // resolved means the pipeline is over either way.
        setTranscribingId(null);
      }
      return;
    }

    try {
      // First use downloads the speech models, which can take a minute.
      if (!(await transcriptionModelsReady()).ready) {
        const toastId = toast.loading("Downloading speech models…");
        try {
          await ensureTranscriptionModels();
        } finally {
          toast.dismiss(toastId);
        }
      }
      transcribingRef.current = true;
      setTranscribingId(rec.id);
      await transcribeRecording(rec.id);
      // The recording's prior lines were just removed server-side; refresh so the
      // panel drops them before fresh lines stream in. "done" triggers a final one.
      onTranscriptChangedRef.current?.();
      toast.success("Transcribing… lines will appear in the transcript.");
    } catch (e) {
      transcribingRef.current = false;
      setTranscribingId(null);
      setError(typeof e === "string" ? e : "Failed to transcribe recording");
    }
  };

  const handleMerge = async () => {
    setMerging(true);
    setError(null);
    try {
      await mergeRecordings(meeting.id, [...selected]);
      setSelected(new Set());
      setPlayingId(null);
      setConfirmOpen(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setMerging(false);
    }
  };

  const selectedRecordings = recordings.filter((r) => selected.has(r.id));
  const canMerge = selected.size >= 2 && !recordingActive && !merging;

  return (
    <div className="intro-y bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-5 transition-shadow duration-300 hover:shadow-xl">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
          Saved recordings
          {recordings.length > 0 && (
            <span className="ml-1.5 text-sm font-medium text-slate-400 dark:text-slate-500">
              ({recordings.length})
            </span>
          )}
        </h3>
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={load} disabled={loading}>
              <RefreshRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </div>

      {recordingActive && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          A recording is in progress — stop it to merge or delete recordings.
        </p>
      )}

      {loading && recordings.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">Loading…</p>
      ) : recordings.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
          No recordings yet. Use the recorder above to capture this meeting.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recordings.map((rec) => {
            const isPlaying = playingId === rec.id;
            return (
              <li
                key={rec.id}
                className="rounded-xl border border-slate-100 dark:border-slate-700 px-2.5 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    size="small"
                    checked={selected.has(rec.id)}
                    onChange={() => toggleSelect(rec.id)}
                    disabled={merging}
                  />
                  <Tooltip title={isPlaying ? "Pause" : "Play"}>
                    <IconButton
                      size="small"
                      onClick={() => togglePlay(rec)}
                      className="!text-primary-600"
                    >
                      {isPlaying ? (
                        <PauseRoundedIcon fontSize="small" />
                      ) : (
                        <PlayArrowRoundedIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      <GraphicEqRoundedIcon
                        sx={{ fontSize: 15 }}
                        className="text-slate-400 flex-shrink-0"
                      />
                      <span className="truncate">{rec.fileName}</span>
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {formatDuration(rec.durationSecs)} · {formatSize(rec.size)}
                    </p>
                  </div>

                  <Tooltip
                    title={
                      transcribingId === rec.id
                        ? // Name the actual stage: "Transcribing" is wrong while
                          // the file is still uploading, which is half the wait.
                          stageTooltip(transcribeStage)
                        : "Transcribe"
                    }
                  >
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleTranscribe(rec)}
                        disabled={
                          merging || recordingActive || transcribingId !== null
                        }
                        className="!text-slate-400 hover:!text-primary-600"
                      >
                        {transcribingId === rec.id ? (
                          <AutorenewIcon
                            fontSize="small"
                            className="animate-spin"
                          />
                        ) : (
                          <SubtitlesOutlinedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>

                  <Tooltip title="Delete">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(rec)}
                        disabled={merging || recordingActive || transcribingId !== null}
                        className="!text-slate-400 hover:!text-red-500"
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </div>

                {/* Upload → transcribe narration, in the same expanding region
                    the audio player uses, so it reads as part of this row. */}
                {transcribeStage?.recordingId === rec.id && (
                  <div className="animate-fade-in">
                    <TranscribeStatus
                      stage={transcribeStage}
                      progress={uploadProgress}
                      onCancel={handleCancelUpload}
                    />
                  </div>
                )}

                {isPlaying && (
                  <audio
                    className="mt-2 w-full animate-fade-in"
                    controls
                    autoPlay
                    src={convertFileSrc(rec.path)}
                    onEnded={() => setPlayingId(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {recordings.length > 1 && (
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!canMerge}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <CallMergeRoundedIcon sx={{ fontSize: 18 }} />
          Merge selected{selected.size >= 2 ? ` (${selected.size})` : ""}
        </button>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2 animate-fade-in">
          {error}
        </p>
      )}

      <AppDialog
        open={confirmOpen}
        onclose={() => !merging && setConfirmOpen(false)}
        title="Merge recordings"
        size="sm"
        dialogContent={
          <div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              The {selectedRecordings.length} selected recordings will be combined
              into one file, in the order they were recorded. The originals will be{" "}
              <span className="font-semibold text-red-600">permanently deleted</span>.
            </p>
            <ul className="mt-3 space-y-1 max-h-40 overflow-auto">
              {selectedRecordings.map((r) => (
                <li
                  key={r.id}
                  className="text-xs text-slate-500 dark:text-slate-400 truncate"
                >
                  • {r.fileName} ({formatDuration(r.durationSecs)})
                </li>
              ))}
            </ul>

            {merging && <LinearProgress className="mt-4 rounded" />}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={merging}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={merging}
                className="px-3 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {merging ? "Merging…" : "Merge & delete originals"}
              </button>
            </div>
          </div>
        }
      />
    </div>
  );
}
