import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@mui/material";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import { AppMode, appModeAtom } from "@/atoms/app-mode-atoms";
import { useSession } from "@/hooks/auth";
import { isRecording } from "@/services/recording";
import { getCloudBaseUrl, setCloudBaseUrl, cloudHealth } from "@/services/cloud";

type Health = "checking" | "online" | "offline";

export function ModeSettings() {
  const [mode, setMode] = useAtom(appModeAtom);
  const { session, signOut } = useSession();
  const navigate = useNavigate();

  const [baseUrl, setBaseUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [health, setHealth] = useState<Health>("checking");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCloudBaseUrl()
      .then((url) => {
        setBaseUrl(url);
        setSavedUrl(url);
      })
      .catch(() => {});
    refreshHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHealth = () => {
    setHealth("checking");
    cloudHealth()
      .then((ok) => setHealth(ok ? "online" : "offline"))
      .catch(() => setHealth("offline"));
  };

  const switchTo = async (next: AppMode) => {
    if (next === mode) return;
    // Don't switch stores mid-capture — the recording belongs to the current mode.
    if (await isRecording().catch(() => false)) {
      toast.error("Stop the current recording before switching modes");
      return;
    }
    if (next === "cloud" && !session) {
      // Need a session first — send through the login screen.
      setMode("cloud");
      navigate("/login");
      return;
    }
    setMode(next);
    toast.success(next === "cloud" ? "Switched to Cloud mode" : "Switched to Local mode");
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const handleSaveUrl = async () => {
    setSaving(true);
    try {
      await setCloudBaseUrl(baseUrl.trim());
      setSavedUrl(baseUrl.trim());
      toast.success("Cloud server saved");
      refreshHealth();
    } catch {
      toast.error("Could not save cloud server");
    } finally {
      setSaving(false);
    }
  };

  const Option = ({
    value,
    title,
    desc,
    icon,
  }: {
    value: AppMode;
    title: string;
    desc: string;
    icon: React.ReactNode;
  }) => {
    const active = mode === value;
    return (
      <button
        type="button"
        onClick={() => switchTo(value)}
        className={`flex-1 text-left rounded-xl border p-4 transition-colors ${
          active
            ? "border-primary-500 bg-primary-50 dark:bg-slate-700"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300"
        }`}
      >
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          {icon}
          <span className="font-semibold">{title}</span>
          {active && (
            <span className="ml-auto text-xs font-semibold text-primary-600">Current</span>
          )}
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{desc}</p>
      </button>
    );
  };

  const healthMeta: Record<Health, { color: string; label: string }> = {
    checking: { color: "#f59e0b", label: "Checking…" },
    online: { color: "#10b981", label: "Connected" },
    offline: { color: "#ef4444", label: "Unreachable" },
  };

  return (
    <div className="p-2">
      <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Mode</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Choose where recording, transcription and summaries run. Local keeps
        everything on this device; Cloud signs in and processes on your server.
      </p>

      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <Option
          value="local"
          title="Local"
          desc="On-device, private, works offline."
          icon={<ComputerOutlinedIcon sx={{ color: "#10b981" }} />}
        />
        <Option
          value="cloud"
          title="Cloud"
          desc="Sign in and use your server for storage and inference."
          icon={<CloudOutlinedIcon sx={{ color: "#3b82f6" }} />}
        />
      </div>

      {/* Cloud connection: base URL + reachability. Always visible so it can be
          configured before switching to Cloud. */}
      <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Cloud server
          </p>
          <button
            type="button"
            onClick={refreshHealth}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700"
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: healthMeta[health].color }}
            />
            {healthMeta[health].label}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:8000"
            className="flex-1 min-w-0 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition"
          />
          <Button
            variant="contained"
            disabled={saving || baseUrl.trim() === savedUrl}
            onClick={handleSaveUrl}
            sx={{ borderRadius: "10px", textTransform: "none", whiteSpace: "nowrap" }}
          >
            Save
          </Button>
        </div>
      </div>

      {mode === "cloud" && (
        <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Signed in as
            </p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
              {session?.email ?? "Not signed in"}
            </p>
          </div>
          <Button
            variant="outlined"
            color="error"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
            sx={{ borderRadius: "10px", textTransform: "none", whiteSpace: "nowrap" }}
          >
            Log out
          </Button>
        </div>
      )}
    </div>
  );
}
