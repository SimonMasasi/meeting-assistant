import { useAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@mui/material";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import { AppMode, appModeAtom } from "@/atoms/app-mode-atoms";
import { useSession } from "@/hooks/auth";

export function ModeSettings() {
  const [mode, setMode] = useAtom(appModeAtom);
  const { session, signOut } = useSession();
  const navigate = useNavigate();

  const switchTo = (next: AppMode) => {
    if (next === mode) return;
    if (next === "cloud" && !session) {
      // Need a session first — send through the login screen.
      setMode("cloud");
      navigate("/login");
      return;
    }
    setMode(next);
    toast.success(next === "cloud" ? "Switched to Cloud mode" : "Switched to Local mode");
  };

  const handleLogout = () => {
    signOut();
    navigate("/login", { replace: true });
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

  return (
    <div className="p-2">
      <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Mode</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Choose where recording, transcription and summaries run. Local keeps
        everything on this device; Cloud signs in and processes in the cloud
        (coming soon).
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
          desc="Sign in and sync. Features coming soon."
          icon={<CloudOutlinedIcon sx={{ color: "#3b82f6" }} />}
        />
      </div>

      {mode === "cloud" && (
        <div className="mt-5 flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
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
