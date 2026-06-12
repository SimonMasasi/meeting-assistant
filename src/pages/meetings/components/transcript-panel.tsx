import { useCallback, useEffect, useState } from "react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  getTranscript,
  onTranscriptLine,
  renameSpeaker,
  segmentToLine,
  TranscriptSegment,
} from "@/services/transcription";
import { MeetingDetail } from "../mock-data";

/** Distinct speaker labels in order of first appearance (drives avatar colors). */
function labelOrderOf(segments: TranscriptSegment[]): string[] {
  const seen: string[] = [];
  for (const s of segments) {
    if (!seen.includes(s.speakerLabel)) seen.push(s.speakerLabel);
  }
  return seen;
}

export function TranscriptPanel({ meeting }: { meeting: MeetingDetail }) {
  // Real, speaker-labeled lines from the on-device pipeline (persisted + live).
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);

  const load = useCallback(() => {
    getTranscript(meeting.id)
      .then(setSegments)
      .catch(() => {});
  }, [meeting.id]);

  // Load whatever was previously transcribed for this meeting.
  useEffect(() => {
    load();
  }, [load]);

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

  const rename = useCallback(
    async (seg: TranscriptSegment) => {
      const current = seg.speakerName ?? seg.speakerLabel;
      const next = window.prompt(`Rename "${current}"`, current)?.trim();
      if (!next || next === current) return;
      try {
        await renameSpeaker(meeting.id, seg.speakerLabel, next);
        load();
      } catch {
        /* surfaced elsewhere; keep the UI responsive */
      }
    },
    [meeting.id, load],
  );

  const hasLive = segments.length > 0;
  const labelOrder = labelOrderOf(segments);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-5 flex flex-col min-h-0 max-h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Transcript</h2>
        <button className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
          {meeting.language}
          <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
        </button>
      </div>

      {/* Status banner */}
      <div className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-secondary-500 to-success-400 shadow">
        <AutoAwesomeIcon sx={{ fontSize: 16 }} />
        {hasLive
          ? "Speakers detected on-device. Click a name to rename them."
          : "Enable live transcription while recording to detect speakers."}
      </div>

      {/* Lines: real pipeline output when present, otherwise the seeded sample. */}
      <div className="mt-4 space-y-5 overflow-y-auto pr-1 flex-1">
        {hasLive
          ? segments.map((seg) => {
              const line = segmentToLine(seg, labelOrder);
              return (
                <div key={line.id} className="flex gap-3">
                  <div
                    className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${line.color}`}
                  >
                    {line.initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => rename(seg)}
                        title="Rename speaker"
                        className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-800 hover:text-primary-600"
                      >
                        {line.speaker}
                        <EditOutlinedIcon
                          sx={{ fontSize: 13 }}
                          className="opacity-0 group-hover:opacity-100 text-slate-400"
                        />
                      </button>
                      <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-500">
                        {line.timestamp}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      {line.text}
                    </p>
                  </div>
                </div>
              );
            })
          : meeting.transcript.map((line) => (
              <div key={line.id} className="flex gap-3">
                <div
                  className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${line.color}`}
                >
                  {line.initials}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">
                      {line.speaker}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-500">
                      {line.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    {line.text}
                  </p>
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}
