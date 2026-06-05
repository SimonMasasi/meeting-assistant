import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { MeetingDetail } from "../mock-data";

export function TranscriptPanel({ meeting }: { meeting: MeetingDetail }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-5 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">Transcript</h2>
        <button className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
          {meeting.language}
          <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
        </button>
      </div>

      {/* Success banner */}
      <div className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-secondary-500 to-success-400 shadow">
        <AutoAwesomeIcon sx={{ fontSize: 16 }} />
        Your transcript has been successfully created!
      </div>

      {/* Lines */}
      <div className="mt-4 space-y-5 overflow-y-auto pr-1 flex-1">
        {meeting.transcript.map((line) => (
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
