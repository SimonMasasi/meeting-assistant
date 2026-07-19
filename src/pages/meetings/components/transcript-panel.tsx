import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  clearTranscript,
  getTranscript,
  onTranscriptLine,
  renameSpeaker,
  segmentToLine,
  TranscriptSegment,
} from "@/services/transcription";
import { Meeting } from "@/services/meetings";

/** Distinct speaker labels in order of first appearance (drives avatar colors). */
function labelOrderOf(segments: TranscriptSegment[]): string[] {
  const seen: string[] = [];
  for (const s of segments) {
    if (!seen.includes(s.speakerLabel)) seen.push(s.speakerLabel);
  }
  return seen;
}

export function TranscriptPanel({
  meeting,
  refreshSignal,
}: {
  meeting: Meeting;
  /** Bumped by the parent to force a reload from the DB (e.g. after a recording
   *  is (re)transcribed), so stale lines are dropped before fresh ones stream in. */
  refreshSignal?: number;
}) {
  // Real, speaker-labeled lines from the on-device pipeline (persisted + live).
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);

  const load = useCallback(() => {
    getTranscript(meeting.id)
      .then(setSegments)
      .catch(() => {});
  }, [meeting.id]);

  // Load whatever was previously transcribed for this meeting, and reload whenever
  // the parent bumps refreshSignal.
  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  // Append lines live as the meeting is recorded. The event is global, so this
  // works regardless of which view started the recording.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = true;
    onTranscriptLine((line) => {
      setSegments((prev) =>
        prev.some((s) => s.id === line.id) ? prev : [...prev, line],
      );
    }).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [meeting.id]);

  // Inline speaker-name editing. We key the open editor off the clicked line's
  // id, but the rename itself applies to the whole speaker cluster (by label).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startEdit = useCallback((seg: TranscriptSegment) => {
    setEditingId(seg.id);
    setDraftName(seg.speakerName ?? seg.speakerLabel);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setDraftName("");
  }, []);

  const saveEdit = useCallback(
    async (seg: TranscriptSegment) => {
      const next = draftName.trim();
      const current = seg.speakerName ?? seg.speakerLabel;
      if (!next || next === current) {
        cancelEdit();
        return;
      }
      try {
        await renameSpeaker(meeting.id, seg.speakerLabel, next);
        load();
      } catch {
        /* surfaced elsewhere; keep the UI responsive */
      } finally {
        cancelEdit();
      }
    },
    [draftName, meeting.id, load, cancelEdit],
  );

  const [clearing, setClearing] = useState(false);
  const runClear = useCallback(async () => {
    setClearing(true);
    try {
      await clearTranscript(meeting.id);
      setSegments([]);
      toast.success("Transcript cleared.");
    } catch (e) {
      // Leave the current lines in place if the clear failed.
      toast.error(typeof e === "string" ? e : "Failed to clear transcript.");
    } finally {
      setClearing(false);
    }
  }, [meeting.id]);

  // window.confirm is unreliable in the Tauri webview, so ask for confirmation with
  // a toast that stays until the user chooses. Only one confirm toast at a time.
  const clearAll = useCallback(() => {
    const id = "clear-transcript-confirm";
    toast(
      (t) => (
        <div className="flex w-72 flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Delete saved transcript?
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              This permanently removes all lines and speaker names for this
              meeting. This can&apos;t be undone.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => toast.dismiss(t.id)}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                runClear();
              }}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-danger-500 hover:bg-danger-600"
            >
              Delete
            </button>
          </div>
        </div>
      ),
      { id, duration: Infinity },
    );
  }, [runClear]);

  const hasLive = segments.length > 0;
  const labelOrder = labelOrderOf(segments);

  return (
    <div className="intro-y bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-5 flex flex-col min-h-0 max-h-[70vh] transition-shadow duration-300 hover:shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Transcript</h2>
        <div className="flex items-center gap-3">
          {hasLive && (
            <button
              onClick={clearAll}
              disabled={clearing}
              title="Clear transcript"
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-danger-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
              {clearing ? "Clearing…" : "Clear"}
            </button>
          )}
          <button className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            {meeting.language}
            <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
          </button>
        </div>
      </div>

      {/* Status banner */}
      <div className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-secondary-500 to-success-400 shadow animate-fade-in">
        <AutoAwesomeIcon sx={{ fontSize: 16 }} />
        {hasLive
          ? "Speakers detected on-device. Click a name to rename them."
          : "Enable live transcription while recording to detect speakers."}
      </div>

      {/* Lines: real, speaker-labeled pipeline output (persisted + live). */}
      <div className="mt-4 space-y-5 overflow-y-auto pr-1 flex-1">
        {hasLive ? (
          segments.map((seg) => {
            const line = segmentToLine(seg, labelOrder);
            return (
              <div key={line.id} className="flex gap-3 animate-fade-in-up motion-reduce:animate-none">
                <div
                  className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${line.color}`}
                >
                  {line.initials}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {editingId === seg.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          autoFocus
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(seg);
                            else if (e.key === "Escape") cancelEdit();
                          }}
                          onBlur={() => saveEdit(seg)}
                          aria-label="Speaker name"
                          className="w-36 px-2 py-0.5 rounded-md border border-primary-400 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
                        />
                        <button
                          // onMouseDown so this fires before the input's onBlur.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            saveEdit(seg);
                          }}
                          title="Save name"
                          className="p-0.5 rounded text-success-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <CheckIcon sx={{ fontSize: 16 }} />
                        </button>
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            cancelEdit();
                          }}
                          title="Cancel"
                          className="p-0.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <CloseIcon sx={{ fontSize: 16 }} />
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => startEdit(seg)}
                        title="Rename speaker"
                        className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-primary-600"
                      >
                        {line.speaker}
                        <EditOutlinedIcon
                          sx={{ fontSize: 13 }}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500"
                        />
                      </button>
                    )}
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {line.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {line.text}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center gap-1 py-10 text-slate-400 dark:text-slate-500">
            <p className="text-sm font-medium">No transcript yet</p>
            <p className="text-xs">
              Start recording with live transcription to capture this meeting.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
