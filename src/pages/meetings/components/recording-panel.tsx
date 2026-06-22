import { useEffect, useRef, useState } from "react";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import MicNoneOutlinedIcon from "@mui/icons-material/MicNoneOutlined";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { MenuItem, Select } from "@mui/material";
import {
  checkMicrophonePermission,
  isRecording,
  listMicrophones,
  MicPermission,
  MicrophoneDevice,
  onRecordingLevel,
  requestMicrophonePermission,
  SavedRecording,
  startRecording,
  stopRecording,
} from "@/services/recording";
import {
  ensureTranscriptionModels,
  onTranscriptionProgress,
  onTranscriptionStatus,
  TranscriptionProgress,
  TranscriptionStatus,
  transcriptionModelsReady,
} from "@/services/transcription";
import { Meeting } from "@/services/meetings";
import {
  getTranscriptionSettings,
  MODEL_SIZE_OPTIONS,
} from "@/services/transcription-settings";

/** Short "~N MB" hint for a model size, from the shared options list. */
function modelSizeMb(size: string): string {
  const opt = MODEL_SIZE_OPTIONS.find((o) => o.key === size);
  const match = opt?.hint.match(/~\d+\s*MB/);
  return match ? match[0] : "~75 MB";
}

/** mm:ss for the live timer. */
function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Per-bar amplitude multipliers for the waveform, weighted toward the center so
 * the row reads as a wave rising from the middle rather than a flat block.
 */
const BAR_WEIGHTS = [0.35, 0.6, 0.85, 1, 0.85, 0.6, 0.35];

/** Wording for the transcription worker's current state. */
function workerLabel(status: TranscriptionStatus, recording: boolean): string {
  if (status.state === "loading") return "Loading speech models…";
  if (status.state === "done") return "Transcript ready";
  // "running"
  const behind = Math.ceil(status.backlogMs / 1000);
  if (!recording) {
    return behind > 1
      ? `Finishing transcription… ${behind}s left`
      : "Finishing transcription…";
  }
  return behind > 2 ? `Transcribing live · ${behind}s behind` : "Transcribing live";
}

/** Human-readable file size for the saved-recording chip. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function RecordingPanel({
  meeting,
  onRecordingsChanged,
}: {
  meeting: Meeting;
  onRecordingsChanged?: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saved, setSaved] = useState<SavedRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<MicPermission | null>(null);
  const [devices, setDevices] = useState<MicrophoneDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  // Optional system/loopback capture (remote participants), off by default.
  const [captureSystem, setCaptureSystem] = useState(false);
  const [systemDevice, setSystemDevice] = useState<string | null>(null);
  // Live mic amplitude (0..1) from the backend, driving the waveform bars.
  const [level, setLevel] = useState(0);
  // Live transcription + speaker detection: user opt-in, plus model-download state.
  const [transcribe, setTranscribe] = useState(false);
  const [modelsReady, setModelsReady] = useState<boolean | null>(null);
  const [modelSize, setModelSize] = useState("tiny");
  const [download, setDownload] = useState<TranscriptionProgress | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus | null>(null);
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
    // Populate the device picker, defaulting to the OS default mic (or the first
    // available one) for this session.
    listMicrophones()
      .then((list) => {
        setDevices(list);
        const fallback = list.find((d) => d.isDefault) ?? list[0];
        setSelectedDevice(fallback?.name ?? null);
      })
      .catch(() => {});
    // Whether the on-device speech models are already downloaded, so the toggle
    // knows if enabling will trigger a first-run download.
    transcriptionModelsReady()
      .then(setModelsReady)
      .catch(() => setModelsReady(false));
    // Know the chosen model size so the download hint shows the right size.
    getTranscriptionSettings()
      .then((s) => setModelSize(s.modelSize))
      .catch(() => {});
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Surface model-download progress while it runs.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = true;
    onTranscriptionProgress((p) => {
      setDownload(p.stage === "ready" || p.pct >= 100 ? null : p);
    }).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  // Track the worker's live/backlog status so the UI can show progress, including
  // the catch-up after recording stops. Clear it shortly after it reports "done".
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = true;
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    onTranscriptionStatus((s) => {
      setStatus(s);
      if (clearTimer) clearTimeout(clearTimer);
      if (s.state === "done") {
        clearTimer = setTimeout(() => setStatus(null), 4000);
      }
    }).then((fn) => {
      if (active) unlisten = fn;
      else fn();
    });
    return () => {
      active = false;
      if (unlisten) unlisten();
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, []);

  // Flip the toggle. Turning it on for the first time downloads the models
  // (which can take a minute), so we kick that off here rather than at start.
  const toggleTranscribe = async () => {
    const next = !transcribe;
    setTranscribe(next);
    if (next && !modelsReady) {
      setError(null);
      try {
        await ensureTranscriptionModels();
        setModelsReady(true);
      } catch (e) {
        setError(String(e));
        setTranscribe(false);
      } finally {
        setDownload(null);
      }
    }
  };

  // Drive the on-screen timer and the live waveform whenever a recording is
  // active. The waveform subscribes to backend level events and unsubscribes
  // (and resets to flat) as soon as recording stops or the component unmounts.
  useEffect(() => {
    if (!recording) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setLevel(0);
      return;
    }
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    let unlisten: (() => void) | null = null;
    let active = true;
    onRecordingLevel(setLevel).then((fn) => {
      // Guard against the effect cleaning up before the listener resolves.
      if (active) unlisten = fn;
      else fn();
    });

    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (unlisten) unlisten();
      setLevel(0);
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
      if (captureSystem && !systemDevice) {
        setError("Select a system audio device, or turn off system capture.");
        setBusy(false);
        return;
      }
      // Only request live transcription if the models are actually present;
      // otherwise the backend would just record without it.
      await startRecording(
        meeting.id,
        selectedDevice ?? undefined,
        transcribe && modelsReady === true,
        captureSystem ? systemDevice ?? undefined : undefined,
      );
      setElapsed(0);
      setRecording(true);
      // Let the saved-recordings list reflect the now-active recording.
      onRecordingsChanged?.();
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
      // Surface the freshly saved file in the saved-recordings list immediately.
      onRecordingsChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="intro-y bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-5 transition-shadow duration-300 hover:shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <MicNoneOutlinedIcon sx={{ fontSize: 18 }} className="text-slate-500 dark:text-slate-400" />
          <h2 className="text-base font-bold">Live Recording</h2>
        </div>
        {recording ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-xs font-semibold">
            <FiberManualRecordIcon sx={{ fontSize: 10 }} className="animate-pulse" />
            REC {formatElapsed(elapsed)}
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Idle</span>
        )}
      </div>

      <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
        Capture the room audio for this in-person meeting straight from your
        microphone.
      </p>

      {/* Live waveform — bars rise with the mic level and ease back on quiet. */}
      <div className="mt-4 flex items-center justify-center gap-1.5 h-16 rounded-xl bg-slate-50 dark:bg-slate-800">
        {BAR_WEIGHTS.map((weight, i) => {
          // Map the 0..1 level to a bar height, leaving a small idle baseline so
          // the bars stay visible (flat) when there's no sound.
          const height = recording
            ? 12 + Math.min(1, level * weight * 2.4) * 40
            : 6;
          return (
            <div
              key={i}
              className={`w-1.5 rounded-full transition-[height] duration-100 ease-out ${
                recording ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>

      {!blocked && devices.length > 0 && (
        <div className="mt-4">
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
            Microphone
          </label>
          <Select
            value={selectedDevice ?? ""}
            onChange={(e) => setSelectedDevice(e.target.value || null)}
            disabled={recording || busy}
            fullWidth
            size="small"
            sx={(theme) => ({
              borderRadius: "12px",
              fontSize: "0.875rem",
              backgroundColor: theme.palette.mode === "dark" ? "#0f172a" : "#f8fafc",
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.palette.mode === "dark" ? "#334155" : "#e2e8f0",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.palette.mode === "dark" ? "#475569" : "#cbd5e1",
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "#3b82f6",
              },
            })}
          >
            {devices.map((d) => (
              <MenuItem key={d.name} value={d.name} sx={{ fontSize: "0.875rem" }}>
                {d.name}
                {d.isDefault ? " (default)" : ""}
              </MenuItem>
            ))}
          </Select>
        </div>
      )}

      {/* System / loopback audio — capture remote participants on calls. */}
      {!blocked && devices.length > 0 && (
        <div className="mt-4">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={captureSystem}
              disabled={recording || busy}
              onChange={(e) => setCaptureSystem(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Capture system audio (remote participants)
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                For online calls, also record the audio coming from your speakers.
                Requires a loopback input device (e.g. install BlackHole on macOS
                and route output through a Multi-Output Device).
              </span>
            </span>
          </label>

          {captureSystem && (
            <div className="mt-2">
              <Select
                value={systemDevice ?? ""}
                onChange={(e) => setSystemDevice(e.target.value || null)}
                disabled={recording || busy}
                fullWidth
                size="small"
                displayEmpty
                renderValue={(v) =>
                  (v as string) || "Select system audio device…"
                }
                sx={(theme) => ({
                  borderRadius: "12px",
                  fontSize: "0.875rem",
                  backgroundColor:
                    theme.palette.mode === "dark" ? "#0f172a" : "#f8fafc",
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor:
                      theme.palette.mode === "dark" ? "#334155" : "#e2e8f0",
                  },
                })}
              >
                {devices.map((d) => (
                  <MenuItem key={d.name} value={d.name} sx={{ fontSize: "0.875rem" }}>
                    {d.name}
                  </MenuItem>
                ))}
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Live transcription + speaker detection — runs fully on-device. */}
      {!blocked && (
        <div className="mt-4">
          <button
            type="button"
            onClick={toggleTranscribe}
            disabled={recording || busy || download !== null}
            className="flex w-full items-start gap-3 text-left disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span
              className={`mt-0.5 flex h-5 w-9 flex-shrink-0 items-center rounded-full p-0.5 transition-colors ${
                transcribe ? "bg-primary-600" : "bg-slate-300 dark:bg-slate-600"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  transcribe ? "translate-x-4" : ""
                }`}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Live transcription &amp; speaker detection
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Transcribe and label who's speaking, in real time and fully
                on-device.
                {modelsReady === false && !transcribe
                  ? ` First use downloads the ${modelSize} model (${modelSizeMb(
                      modelSize,
                    )}) plus shared speech models.`
                  : ""}
              </span>
            </span>
          </button>

          {download && (
            <div className="mt-2 animate-fade-in">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Downloading {download.file}…</span>
                <span>{download.pct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-primary-600 transition-[width]"
                  style={{ width: `${download.pct}%` }}
                />
              </div>
            </div>
          )}

          {!download && status && (
            <div className="mt-2 animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                {status.state !== "done" && (
                  <AutorenewIcon
                    sx={{ fontSize: 14 }}
                    className="animate-spin text-primary-600"
                  />
                )}
                <span>{workerLabel(status, recording)}</span>
              </div>
              {/* Catch-up bar shown while the worker drains a post-stop backlog. */}
              {!recording &&
                status.state === "running" &&
                status.receivedMs > 0 && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-primary-600 transition-[width]"
                      style={{
                        width: `${Math.min(
                          100,
                          (status.processedMs / status.receivedMs) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {blocked && !recording && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5 text-sm animate-fade-in">
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
        <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 animate-fade-in">
          {error}
        </p>
      )}

      {saved && (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm animate-fade-in-up">
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
