import IosShareIcon from "@mui/icons-material/IosShare";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { MeetingDetail } from "../mock-data";

export function MeetingHeader({ meeting }: { meeting: MeetingDetail }) {
  const isOnline = meeting.source === "online";

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg bg-slate-900 aspect-[16/9]">
      {/* Cover backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.35),transparent_55%)]" />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white drop-shadow-sm">
            {meeting.title}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-200/90">
            <span>
              {meeting.date}, {meeting.time}
            </span>
            <span className="inline-flex items-center gap-1">
              <VisibilityOutlinedIcon sx={{ fontSize: 14 }} />
              {meeting.views} Views
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm">
              {isOnline ? (
                <VideocamOutlinedIcon sx={{ fontSize: 14 }} />
              ) : (
                <GroupsOutlinedIcon sx={{ fontSize: 14 }} />
              )}
              {isOnline ? "Online" : "In-person"}
            </span>
          </div>
        </div>

        <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-slate-700 text-sm font-semibold shadow hover:bg-slate-100 transition-colors">
          <IosShareIcon sx={{ fontSize: 16 }} />
          Share
        </button>
      </div>

      {/* Center play control */}
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          aria-label="Play recording"
          className="group flex items-center justify-center w-16 h-16 rounded-full bg-white/90 backdrop-blur shadow-xl hover:scale-105 transition-transform"
        >
          <PlayArrowRoundedIcon className="text-primary-600" sx={{ fontSize: 40 }} />
        </button>
      </div>

      {/* Bottom: recording badge + scrub bar */}
      <div className="absolute inset-x-0 bottom-0 p-5 space-y-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/90 text-white text-xs font-semibold">
          <FiberManualRecordIcon sx={{ fontSize: 10 }} />
          Recorded · {meeting.durationLabel}
        </span>
        <div className="flex items-center gap-3 text-xs text-white/80">
          <span>0:00</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-white" />
          </div>
          <span>{meeting.durationLabel}</span>
        </div>
      </div>
    </div>
  );
}
