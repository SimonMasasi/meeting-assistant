import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
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
import AppDialog from "@/components/shared/dialogs/app-dialog";
import {
  deleteRecording,
  isRecording,
  listMeetingRecordings,
  mergeRecordings,
  SavedRecording,
} from "@/services/recording";
import { MeetingDetail } from "../mock-data";

/** Human-readable file size. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
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
}: {
  meeting: MeetingDetail;
  refreshSignal?: number;
}) {
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

                  <Tooltip title="Delete">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(rec)}
                        disabled={merging || recordingActive}
                        className="!text-slate-400 hover:!text-red-500"
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </div>

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
