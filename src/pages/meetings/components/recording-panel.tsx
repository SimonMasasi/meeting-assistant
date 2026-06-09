import { useEffect, useRef, useState } from "react";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  checkMicrophonePermission,
  isRecording,
  MicPermission,
  requestMicrophonePermission,
  SavedRecording,
  startRecording,
  stopRecording,
} from "@/services/recording";
import { MeetingDetail } from "../mock-data";

/** mm:ss for the live timer. */
function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Human-readable file size for the saved-recording chip. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function RecordingPanel({ meeting }: { meeting: MeetingDetail }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saved, setSaved] = useState<SavedRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<MicPermission | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // A recording lives in the Rust backend and outlives this component, so on
  // mount we re-sync with whatever is actually running, and read the current
  // mic authorization so the UI can reflect it without prompting.
  useEffect(() => {
    isRecording()
      .then(setRecording)
      .catch(() => {});
    checkMicrophonePermission()
      .then(setPermission)
      .catch(() => {});
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Drive the on-screen timer whenever a recording is active.
  useEffect(() => {
    if (!recording) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording]);

  const start = async () => {
    setError(null);
    setSaved(null);
    setBusy(true);
    try {
      // Make sure we have mic access before capturing — prompts on first use,
      // or opens System Settings if access was previously denied.
      const status = await requestMicrophonePermission();
      setPermission(status);
      if (status !== "granted") {
        setBusy(false);
        return;
      }
      await startRecording(meeting.id);
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  // Re-ask for access. On macOS a prior denial can't be re-prompted, so this
  // opens System Settings → Microphone; the status refreshes when they return.
  const requestAccess = async () => {
    setBusy(true);
    try {
      setPermission(await requestMicrophonePermission());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const blocked = permission === "denied" || permission === "restricted";

  const stop = async () => {
    setBusy(true);
    try {
      const result = await stopRecording();
      setSaved(result);
      setRecording(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700">
          <MicNoneOutlinedIcon sx={{ fontSize: 18 }} className="text-slate-500" />
          <h2 className="text-base font-bold">Live Recording</h2>
        </div>
        {recording ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-semibold">
            <FiberManualRecordIcon sx={{ fontSize: 10 }} className="animate-pulse" />
            REC {formatElapsed(elapsed)}
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-400">Idle</span>
        )}
      </div>

      <p className="mt-1.5 text-sm text-slate-500">
        Capture the room audio for this in-person meeting straight from your
        microphone.
      </p>

      {/* Waveform-ish affordance while recording */}
      <div className="mt-4 flex items-center justify-center h-16 rounded-xl bg-slate-50">
        {recording ? (
          <GraphicEqIcon
            sx={{ fontSize: 40 }}
            className="text-red-500 animate-pulse"
          />
        ) : (
          <GraphicEqIcon sx={{ fontSize: 40 }} className="text-slate-300" />
        )}
      </div>

      {blocked && !recording && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5 text-sm">
          <LockOutlinedIcon
            sx={{ fontSize: 18 }}
            className="mt-0.5 text-amber-600 flex-shrink-0"
          />
          <div>
            <p className="font-semibold text-amber-700">
              Microphone access is {permission === "restricted" ? "restricted" : "blocked"}
            </p>
            <p className="text-xs text-amber-600/90">
              {permission === "restricted"
                ? "Access is disabled by a device policy and can't be changed here."
                : "Enable it in System Settings → Privacy & Security → Microphone, then try again."}
            </p>
          </div>
        </div>
      )}

      {blocked && !recording ? (
        <button
          onClick={requestAccess}
          disabled={busy || permission === "restricted"}
          className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          <LockOutlinedIcon sx={{ fontSize: 18 }} />
          {busy ? "Opening…" : "Open microphone settings"}
        </button>
      ) : (
        <button
          onClick={recording ? stop : start}
          disabled={busy}
          className={`mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ${
            recording
              ? "bg-slate-700 hover:bg-slate-800"
              : "bg-red-500 hover:bg-red-600"
          }`}
        >
          {recording ? (
            <>
              <StopRoundedIcon sx={{ fontSize: 18 }} />
              {busy ? "Stopping…" : "Stop recording"}
            </>
          ) : (
            <>
              <FiberManualRecordIcon sx={{ fontSize: 14 }} />
              {busy ? "Starting…" : "Start recording"}
            </>
          )}
        </button>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {saved && (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm">
          <AudiotrackOutlinedIcon
            sx={{ fontSize: 18 }}
            className="text-emerald-600 flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="font-semibold text-emerald-700 truncate">
              {saved.fileName}
            </p>
            <p className="text-xs text-emerald-600/80">
              Saved · {formatSize(saved.size)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
