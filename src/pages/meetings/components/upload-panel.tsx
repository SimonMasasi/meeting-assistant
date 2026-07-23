import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAtomValue } from "jotai";
import toast from "react-hot-toast";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import { appModeAtom } from "@/atoms/app-mode-atoms";
import { Meeting } from "@/services/meetings";
import {
  cancelFileUpload,
  listResumableUploads,
  onTranscribeStage,
  onUploadProgress,
  pauseFileUpload,
  startFileUpload,
  TranscribeStage,
  transcribeUploadedFile,
  UploadProgress,
} from "@/services/upload";
import { TranscribeStatus } from "./transcribe-status";

/** Audio containers the backend transcribes. */
const AUDIO_EXTENSIONS = ["wav", "mp3", "m4a", "mp4", "aac", "ogg", "flac", "webm"];

/** The file the panel is working on. */
interface Target {
  localPath: string;
  fileName: string;
}

/** Last path segment of a native path, for display. */
function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * Upload an existing audio file to the cloud backend and transcribe it into this
 * meeting.
 *
 * The transfer runs in Rust over the resumable tus protocol — this component
 * only holds UI state. It passes the **path** returned by the native file picker
 * straight to `invoke`; it never reads the file, because a recording can be
 * gigabytes and reading it here would allocate all of it inside the webview.
 *
 * Stage narration and the progress bar come from the shared
 * {@link TranscribeStatus}, the same component the per-recording Transcribe
 * action uses — it is the same backend pipeline, so it reads identically. What's
 * specific to this panel is the file picker and pause/resume, which only apply
 * to a user-driven upload.
 */
export function UploadPanel({
  meeting,
  onTranscriptChanged,
}: {
  meeting: Meeting;
  onTranscriptChanged?: () => void;
}) {
  const appMode = useAtomValue(appModeAtom);
  const [target, setTarget] = useState<Target | null>(null);
  const [stage, setStage] = useState<TranscribeStage | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  // Read by the async run loop, which outlives its own closure.
  const stageRef = useRef<TranscribeStage | null>(null);

  // Stage + progress are global channels. This panel owns the uploads with no
  // recordingId, so anything carrying one belongs to RecordingsList instead.
  useEffect(() => {
    let unlistenStage: (() => void) | null = null;
    let unlistenProgress: (() => void) | null = null;
    let active = true;

    onTranscribeStage((s) => {
      if (s.recordingId) return;
      stageRef.current = s;
      setStage(s);
      if (s.stage === "cancelled") {
        setTarget(null);
        setProgress(null);
        setStage(null);
      }
    }).then((fn) => (active ? (unlistenStage = fn) : fn()));

    onUploadProgress((p) => setProgress(p)).then((fn) =>
      active ? (unlistenProgress = fn) : fn(),
    );

    return () => {
      active = false;
      unlistenStage?.();
      unlistenProgress?.();
    };
  }, []);

  // An upload interrupted by the app closing leaves durable state behind. Offer
  // to continue it rather than making the user re-pick the file.
  useEffect(() => {
    if (appMode !== "cloud") return;
    listResumableUploads()
      .then((rows) => {
        const row = rows[0];
        if (!row) return;
        setTarget({ localPath: row.localPath, fileName: row.fileName });
        setStage({
          stage: "paused",
          uploadId: row.uploadId,
          recordingId: null,
          fileName: row.fileName,
          fileId: null,
          message: null,
          processedMs: null,
          totalMs: null,
          serverStage: null,
          backend: null,
        });
      })
      .catch(() => {});
  }, [appMode]);

  /**
   * Drive one upload run and, if it completes, the transcription that follows.
   * A pause or cancel ends the run without being an error — the server keeps the
   * offset either way.
   */
  const run = useCallback(
    async (chosen: Target) => {
      try {
        const outcome = await startFileUpload(chosen.localPath);
        if (outcome.status !== "completed") return;

        // The file id is a string and stays one — it is 64-bit and would lose
        // precision as a JS number.
        await transcribeUploadedFile(
          meeting.id,
          outcome.file.id,
          chosen.fileName,
        );
        toast.success(`${chosen.fileName} transcribed`);
        onTranscriptChanged?.();
        setTarget(null);
        setProgress(null);
        setStage(null);
      } catch (e) {
        // The "failed" stage already rendered the reason inline; this surfaces
        // it as a toast too, and leaves the file selected so a retry resumes.
        toast.error(String(e));
      }
    },
    [meeting.id, onTranscriptChanged],
  );

  /** Native picker → path string → Rust. Deliberately never reads the file. */
  const pickAndUpload = useCallback(async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
    });
    if (typeof selected !== "string") return;

    const chosen: Target = {
      localPath: selected,
      fileName: baseName(selected),
    };
    setTarget(chosen);
    setProgress(null);
    setStage(null);
    await run(chosen);
  }, [run]);

  const handlePause = useCallback(() => {
    const uploadId = stageRef.current?.uploadId;
    if (uploadId) pauseFileUpload(uploadId).catch(() => {});
  }, []);

  const handleResume = useCallback(() => {
    if (target) run(target);
  }, [run, target]);

  const handleCancel = useCallback(() => {
    if (!target) return;
    cancelFileUpload(stageRef.current?.uploadId ?? "", target.localPath).catch(
      (e) => toast.error(String(e)),
    );
  }, [target]);

  // Uploading is a cloud-mode concern; in local mode audio never leaves the
  // machine, so the panel has nothing to offer.
  if (appMode !== "cloud") return null;

  const paused = stage?.stage === "paused";
  const idle = !target;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <CloudUploadOutlinedIcon sx={{ fontSize: 18 }} />
          Upload audio
        </h2>
        {idle && (
          <button
            type="button"
            onClick={pickAndUpload}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Choose file
          </button>
        )}
      </div>

      {idle && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Upload a recording to transcribe it into this meeting. Large files are
          sent in chunks and resume automatically if the connection drops.
        </p>
      )}

      {target && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm text-slate-700 dark:text-slate-200">
              {target.fileName}
            </span>
            <div className="flex shrink-0 items-center">
              {stage?.stage === "uploading" && (
                <Tooltip title="Pause">
                  <IconButton size="small" onClick={handlePause}>
                    <PauseRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {paused && (
                <Tooltip title="Resume">
                  <IconButton size="small" onClick={handleResume}>
                    <PlayArrowRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </div>
          </div>

          {paused ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Paused — resume to continue from where it stopped.
            </p>
          ) : (
            stage && (
              <TranscribeStatus
                stage={stage}
                progress={progress}
                onCancel={handleCancel}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
