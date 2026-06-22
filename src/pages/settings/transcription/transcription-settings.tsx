import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import toast from "react-hot-toast";
import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined";
import { loadingAtom } from "@/atoms/shared-atoms";
import {
  LANGUAGE_OPTIONS,
  MODEL_SIZE_OPTIONS,
  TranscriptionSettings as Model,
  getTranscriptionSettings,
  setTranscriptionSettings,
} from "@/services/transcription-settings";

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    "&:hover fieldset": { borderColor: "#2663EB" },
    "&.Mui-focused fieldset": { borderColor: "#3b82f6" },
  },
};

export function TranscriptionSettings() {
  const [settings, setSettings] = useState<Model | null>(null);
  const [_, setLoading] = useAtom(loadingAtom);

  useEffect(() => {
    getTranscriptionSettings()
      .then(setSettings)
      .catch((err) => {
        console.error("Failed to read transcription settings", err);
        setSettings({ modelSize: "tiny", language: "en" });
      });
  }, []);

  async function handleSubmit() {
    if (!settings) return;
    try {
      setLoading(true);
      await setTranscriptionSettings(settings);
      toast.success("Transcription settings saved");
    } catch (err) {
      console.error("Failed to save transcription settings", err);
      toast.error("Could not save transcription settings");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-2">
      <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
        Transcription
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        On-device speech-to-text settings. A larger model is more accurate but
        slower and bigger to download. Changing the size downloads the new model
        the next time you enable live transcription.
      </p>

      <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
          <GraphicEqOutlinedIcon sx={{ color: "#3b82f6" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Current
          </p>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
            {settings
              ? `Model: ${settings.modelSize} · Language: ${settings.language}`
              : "Loading…"}
          </p>
        </div>
      </div>

      {settings && (
        <>
          <div className="mt-5 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-wrap gap-4">
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Model size</InputLabel>
              <Select
                label="Model size"
                value={settings.modelSize}
                sx={fieldSx}
                onChange={(e) =>
                  setSettings({ ...settings, modelSize: e.target.value })
                }
              >
                {MODEL_SIZE_OPTIONS.map((o) => (
                  <MenuItem key={o.key} value={o.key}>
                    {o.label} — {o.hint}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Language</InputLabel>
              <Select
                label="Language"
                value={settings.language}
                sx={fieldSx}
                onChange={(e) =>
                  setSettings({ ...settings, language: e.target.value })
                }
              >
                {LANGUAGE_OPTIONS.map((o) => (
                  <MenuItem key={o.key} value={o.key}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>

          <div className="flex justify-end my-4 mx-4">
            <Button
              variant="contained"
              onClick={handleSubmit}
              sx={{
                background: "linear-gradient(135deg, #3b82f6 0%, #1255e7 100%)",
                borderRadius: "10px",
                textTransform: "none",
                fontWeight: 600,
                padding: "10px 32px",
                "&:hover": {
                  background: "linear-gradient(135deg, #4e7ad6 0%, #2663EB 100%)",
                },
              }}
            >
              Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
