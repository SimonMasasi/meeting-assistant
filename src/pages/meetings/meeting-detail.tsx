import { useAtomValue } from "jotai";
import { useNavigate, useParams } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import { meetingsAtom } from "@/atoms/meetings-atoms";
import { getMeetingById } from "./mock-data";
import { MeetingHeader } from "./components/meeting-header";
import { NotesKeyPoints } from "./components/notes-key-points";
import { MeetingObjective } from "./components/meeting-objective";
import { TranscriptPanel } from "./components/transcript-panel";

export function MeetingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const meetings = useAtomValue(meetingsAtom);
  const meeting = getMeetingById(meetings, id);

  if (!meeting) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-white rounded-2xl shadow-lg p-10 flex flex-col items-center text-center gap-3">
          <SearchOffIcon sx={{ fontSize: 52 }} className="text-slate-300" />
          <h2 className="text-lg font-bold text-slate-700">Meeting not found</h2>
          <p className="text-sm text-slate-400">
            We couldn't find a meeting with id “{id}”.
          </p>
          <button
            onClick={() => navigate("/main/meetings")}
            className="mt-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            Back to meetings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button
        onClick={() => navigate("/main/meetings")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowBackIcon sx={{ fontSize: 18 }} />
        Back to meetings
      </button>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: recording + AI notes */}
        <div className="xl:col-span-2 space-y-6">
          <MeetingHeader meeting={meeting} />
          <NotesKeyPoints meeting={meeting} />
        </div>

        {/* Right: notes objective + transcript */}
        <div className="xl:col-span-1 space-y-6">
          <MeetingObjective meeting={meeting} />
          <TranscriptPanel meeting={meeting} />
        </div>
      </div>
    </div>
  );
}
