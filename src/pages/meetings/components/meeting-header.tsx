import IosShareIcon from "@mui/icons-material/IosShare";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { Meeting } from "@/services/meetings";

export function MeetingHeader({ meeting }: { meeting: Meeting }) {

  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg bg-slate-900 aspect-[16/9]">
      {/* Cover backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.35),transparent_55%)]" />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">

        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-slate-700 text-xs font-semibold shadow hover:bg-slate-100 transition-colors">
          <IosShareIcon sx={{ fontSize: 14 }} />
          Share
        </button>
      </div>

      {/* Center play control */}
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          aria-label="Play recording"
          className="group flex items-center justify-center w-12 h-12 rounded-full bg-white/90 backdrop-blur shadow-xl hover:scale-105 transition-transform"
        >
          <PlayArrowRoundedIcon className="text-primary-600" sx={{ fontSize: 28 }} />
        </button>
      </div>

      {/* Bottom: recording badge + scrub bar */}
      <div className="absolute inset-x-0 bottom-0 p-4 space-y-2">
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
