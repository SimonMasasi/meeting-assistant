import { useSetAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { AppMode, appModeAtom } from "@/atoms/app-mode-atoms";

interface ModeCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  bullets: string[];
  cta: string;
  onSelect: () => void;
}

function ModeCard({ title, subtitle, icon, accent, bullets, cta, onSelect }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col text-left w-full rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-7 transition-all hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-primary-400/50"
    >
      <div
        className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white text-3xl shadow-md ${accent}`}
      >
        {icon}
      </div>
      <h2 className="mt-5 text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      <ul className="mt-4 space-y-2 flex-1">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
            <CheckCircleOutlineIcon sx={{ fontSize: 18 }} className="mt-0.5 text-success-500" />
            {b}
          </li>
        ))}
      </ul>
      <span
        className={`mt-6 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${accent} group-hover:opacity-90`}
      >
        {cta}
      </span>
    </button>
  );
}

export function ModeSelectMain() {
  const setMode = useSetAtom(appModeAtom);
  const navigate = useNavigate();

  const choose = (mode: AppMode) => {
    setMode(mode);
    // Cloud requires a session, so route through login; local goes straight in.
    navigate(mode === "cloud" ? "/login" : "/main/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
            Choose how you want to work
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            You can switch anytime from Settings → Mode.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <ModeCard
            title="Local"
            subtitle="Private, on-device. No account needed."
            icon={<ComputerOutlinedIcon fontSize="inherit" />}
            accent="bg-gradient-to-br from-emerald-400 to-teal-600"
            bullets={[
              "Recording & transcription run on your machine",
              "Nothing leaves your device",
              "Works fully offline",
            ]}
            cta="Use Local"
            onSelect={() => choose("local")}
          />
          <ModeCard
            title="Cloud"
            subtitle="Sign in to sync and process in the cloud."
            icon={<CloudOutlinedIcon fontSize="inherit" />}
            accent="bg-gradient-to-br from-blue-400 to-indigo-600"
            bullets={[
              "Sign in to your account",
              "Processing handled by the cloud provider",
              "Coming soon — sign-in works, features land next",
            ]}
            cta="Use Cloud"
            onSelect={() => choose("cloud")}
          />
        </div>
      </div>
    </div>
  );
}
