import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useNavigate, useParams } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import { meetingsAtom } from "@/atoms/meetings-atoms";
import { Meeting, getMeeting } from "@/services/meetings";
import { NotesKeyPoints } from "./components/notes-key-points";
import { MeetingObjective } from "./components/meeting-objective";
import { TranscriptPanel } from "./components/transcript-panel";
import { RecordingPanel } from "./components/recording-panel";
import { RecordingsList } from "./components/recordings-list";
import { UploadPanel } from "./components/upload-panel";

export function MeetingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cached = useAtomValue(meetingsAtom);

  // Prefer the in-session cache (instant), but fetch on a cache miss so deep
  // links and fresh loads still resolve. `loading` avoids flashing "not found".
  const [meeting, setMeeting] = useState<Meeting | null>(
    () => cached.find((m) => m.id === id) ?? null,
  );
  const [loading, setLoading] = useState(!meeting);

  useEffect(() => {
    const hit = cached.find((m) => m.id === id);
    if (hit) {
      setMeeting(hit);
      setLoading(false);
      return;
    }
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getMeeting(id)
      .then((m) => setMeeting(m))
      .catch((err) => {
        console.error("Failed to load meeting", err);
        setMeeting(null);
      })
      .finally(() => setLoading(false));
  }, [id, cached]);

  // Bumped whenever the recorder starts/stops so the saved-recordings list
  // (a sibling of the recorder) re-fetches and shows the new file right away.
  const [recordingsVersion, setRecordingsVersion] = useState(0);
  // Bumped when a saved recording is (re)transcribed so the transcript panel
  // reloads from the DB (dropping replaced lines before fresh ones stream in).
  const [transcriptVersion, setTranscriptVersion] = useState(0);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-10 flex flex-col items-center text-center gap-3">
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading meeting…</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-10 flex flex-col items-center text-center gap-3 animate-scale-in">
          <SearchOffIcon sx={{ fontSize: 52 }} className="text-slate-300 dark:text-slate-600" />
          <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">Meeting not found</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500">
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
        className="intro-y inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowBackIcon sx={{ fontSize: 18 }} />
        Back to meetings
      </button>

      {/* Page heading: meeting name + date details */}
      <div className="intro-y">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 dark:text-slate-100">
          {meeting.title}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <CalendarTodayOutlinedIcon sx={{ fontSize: 15 }} />
            {meeting.date}, {meeting.time}
          </span>
          <span className="inline-flex items-center gap-1.5">
            {meeting.source === "online" ? (
              <VideocamOutlinedIcon sx={{ fontSize: 16 }} />
            ) : (
              <GroupsOutlinedIcon sx={{ fontSize: 16 }} />
            )}
            {meeting.source === "online" ? "Online" : "In-person"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left (primary focus): live transcript + AI notes/summary */}
        <div className="xl:col-span-2 space-y-6">
          <TranscriptPanel meeting={meeting} refreshSignal={transcriptVersion} />
          <NotesKeyPoints meetingId={meeting.id} />
          <RecordingsList
            meeting={meeting}
            refreshSignal={recordingsVersion}
            onTranscriptChanged={() => setTranscriptVersion((v) => v + 1)}
          />
        </div>

        {/* Right (secondary): recording controls, objective + small playback */}
        <div className="xl:col-span-1 space-y-6">
          <RecordingPanel
            meeting={meeting}
            onRecordingsChanged={() => setRecordingsVersion((v) => v + 1)}
          />
          <UploadPanel
            meeting={meeting}
            onTranscriptChanged={() => setTranscriptVersion((v) => v + 1)}
          />
          <MeetingObjective meeting={meeting} />
        </div>
      </div>
    </div>
  );
}
