import { useSetAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import { appModeAtom } from "@/atoms/app-mode-atoms";

/**
 * Placeholder shown in cloud mode where a feature's request would go to the
 * cloud provider, which isn't implemented yet. This is the seam: replace this
 * with the real cloud call (via `src/services/*`) when the backend lands.
 */
export function CloudComingSoon({ feature }: { feature: string }) {
  const setAppMode = useSetAtom(appModeAtom);
  const navigate = useNavigate();

  const useLocal = () => {
    setAppMode("local");
    navigate("/main/dashboard", { replace: true });
  };

  return (
    <div className="flex flex-col items-center text-center gap-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
        <CloudOutlinedIcon />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {feature} is coming soon in Cloud mode
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Cloud processing isn't available yet. Switch to Local to use this now.
        </p>
      </div>
      <button
        type="button"
        onClick={useLocal}
        className="mt-1 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
      >
        Switch to Local
      </button>
    </div>
  );
}
