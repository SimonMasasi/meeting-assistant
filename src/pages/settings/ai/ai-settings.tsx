import { useCallback, useEffect, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import toast from "react-hot-toast";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
} from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { loadingAtom } from "@/atoms/shared-atoms";
import { appModeAtom } from "@/atoms/app-mode-atoms";
import {
  AI_DEFAULTS,
  AiSettings as AiSettingsModel,
  getAiSettings,
  listLocalModels,
  setAiSettings,
} from "@/services/ai";

/** A selectable model provider. `local` covers self-hosted / OpenAI-compatible
 *  endpoints (Ollama, LM Studio, local Whisper, …) and needs no API key. */
type ProviderOption = { key: string; label: string };

const OPENAI: ProviderOption = { key: "openai", label: "OpenAI" };
const ANTHROPIC: ProviderOption = { key: "anthropic", label: "Anthropic" };
const LOCAL: ProviderOption = { key: "local", label: "Local / self-hosted" };

/** Which providers are valid per role. Anthropic offers no STT, so it only
 *  appears for chat. */
const STT_PROVIDERS = [OPENAI, LOCAL];
const CHAT_PROVIDERS = [OPENAI, ANTHROPIC, LOCAL];

/** The roles, each mapped to its column prefix in `AiSettings` and the default
 *  values used to backfill blank fields / prefill on provider switch. */
type Role = {
  prefix: "stt" | "chat";
  title: string;
  description: string;
  providers: ProviderOption[];
  defaults: { model: string; base_url: string };
};

const ROLES: Role[] = [
  {
    prefix: "stt",
    title: "Speech-to-Text",
    description: "Transcribes meeting recordings into text.",
    providers: STT_PROVIDERS,
    defaults: { model: AI_DEFAULTS.stt_model, base_url: AI_DEFAULTS.stt_base_url },
  },
  {
    prefix: "chat",
    title: "Chat / Summarization",
    description: "Writes summaries, key points and action items.",
    providers: CHAT_PROVIDERS,
    defaults: { model: AI_DEFAULTS.chat_model, base_url: AI_DEFAULTS.chat_base_url },
  },
];

/** Current documented models per provider and role. `local` has no static list —
 *  its models are pulled live from the running server. Edit these as providers
 *  ship new models; the field is a free-text combobox so anything missing here
 *  can still be typed. */
const MODEL_OPTIONS: Record<
  string,
  Partial<Record<Role["prefix"], string[]>>
> = {
  openai: {
    stt: ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"],
    chat: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3", "o4-mini"],
  },
  anthropic: {
    chat: [
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ],
  },
};

/** Shared field styling matching the dynamic-form selects. */
const fieldSx = {
  width: "100%",
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    "&:hover fieldset": { borderColor: "#2663EB" },
    "&.Mui-focused fieldset": {
      borderColor: "#3b82f6",
      boxShadow: "0 0 0 3px rgba(59,130,246,0.12)",
    },
  },
  "& .MuiInputLabel-root.Mui-focused": { color: "#3b82f6" },
};

/** Per-provider default endpoint used when switching a role's provider. */
function defaultBaseUrl(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "local":
      return "http://localhost:11434/v1";
    case "openai":
    default:
      return "https://api.openai.com/v1";
  }
}

/** Backfill any blank field returned by the backend with `AI_DEFAULTS`, mirroring
 *  how the mail settings page backfills its defaults. */
function withDefaults(saved: AiSettingsModel): AiSettingsModel {
  const merged = { ...saved } as AiSettingsModel;
  (Object.keys(AI_DEFAULTS) as (keyof AiSettingsModel)[]).forEach((field) => {
    if (!merged[field]) merged[field] = AI_DEFAULTS[field];
  });
  return merged;
}

interface ModelAutocompleteProps {
  provider: string;
  prefix: Role["prefix"];
  baseUrl: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

/** Editable model picker: a dropdown of known models that still accepts free
 *  text. For the `local` provider the options are the models installed on the
 *  server at `baseUrl`, fetched on mount / base-URL change and via a refresh
 *  button; for OpenAI / Anthropic they come from the curated `MODEL_OPTIONS`. */
function ModelAutocomplete({
  provider,
  prefix,
  baseUrl,
  value,
  placeholder,
  onChange,
}: ModelAutocompleteProps) {
  const isLocal = provider === "local";
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLocal = useCallback(async () => {
    if (!isLocal || !baseUrl.trim()) {
      setLocalModels([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setLocalModels(await listLocalModels(baseUrl));
    } catch (err) {
      console.error("Failed to list local models", err);
      setLocalModels([]);
      setError("Couldn't reach the server — type the model name manually.");
    } finally {
      setLoading(false);
    }
  }, [isLocal, baseUrl]);

  // Re-fetch whenever the provider switches to local or its base URL changes.
  useEffect(() => {
    refreshLocal();
  }, [refreshLocal]);

  const options = isLocal ? localModels : MODEL_OPTIONS[provider]?.[prefix] ?? [];

  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5, minWidth: 240 }}>
      <Autocomplete
        freeSolo
        options={options}
        inputValue={value}
        onInputChange={(_, v) => onChange(v)}
        sx={{ flex: 1, minWidth: 220 }}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            label="Model"
            placeholder={placeholder}
            error={Boolean(error)}
            helperText={error ?? undefined}
            sx={fieldSx}
          />
        )}
      />
      {isLocal && (
        <Tooltip title="Refresh installed models">
          <span>
            <IconButton
              size="small"
              onClick={refreshLocal}
              disabled={loading}
              sx={{ mt: 0.5 }}
            >
              {loading ? (
                <CircularProgress size={16} />
              ) : (
                <RefreshOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  );
}

export function AiSettings() {
  const [settings, setSettings] = useState<AiSettingsModel | null>(null);
  const [_, setLoading] = useAtom(loadingAtom);
  const appMode = useAtomValue(appModeAtom);

  async function refresh() {
    try {
      const saved = await getAiSettings();
      setSettings(withDefaults(saved));
    } catch (err) {
      console.error("Failed to read AI settings", err);
      setSettings({ ...AI_DEFAULTS });
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  /** Update a single `<prefix>_<field>` value. */
  function setField(prefix: Role["prefix"], field: string, value: string) {
    setSettings((prev) =>
      prev ? { ...prev, [`${prefix}_${field}`]: value } : prev
    );
  }

  /** Switching provider also resets that role's base URL to the provider default
   *  (the previous one almost never applies to a different provider). */
  function changeProvider(prefix: Role["prefix"], provider: string) {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            [`${prefix}_provider`]: provider,
            [`${prefix}_base_url`]: defaultBaseUrl(provider),
          }
        : prev
    );
  }

  async function handleSubmit() {
    if (!settings) return;
    try {
      setLoading(true);
      await setAiSettings(settings);
      toast.success("AI settings saved");
    } catch (err) {
      console.error("Failed to save AI settings", err);
      toast.error("Could not save AI settings");
    } finally {
      setLoading(false);
    }
  }

  if (appMode === "cloud") {
    return (
      <div className="p-2">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">AI Models</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Transcription and summarization run on your cloud server in Cloud mode.
        </p>
        <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <AutoAwesomeOutlinedIcon sx={{ color: "#3b82f6" }} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Inference is handled by the server (configured by your administrator).
            Switch to Local mode to choose on-device providers and models.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2">
      <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200">AI Models</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        Choose the provider and model used for transcription, speech and
        summarization. API keys are stored locally on this device.
      </p>

      {/* Summary card */}
      <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
          <AutoAwesomeOutlinedIcon sx={{ color: "#3b82f6" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Configured providers
          </p>
          {settings ? (
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
              STT: {settings.stt_provider} · Chat: {settings.chat_provider}
            </p>
          ) : (
            <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Loading…</p>
          )}
        </div>
      </div>

      {settings ? (
        <>
          {ROLES.map((role) => {
            const provider = settings[`${role.prefix}_provider`] as string;
            const isLocal = provider === "local";
            return (
              <div
                key={role.prefix}
                className="mt-5 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {role.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">
                  {role.description}
                </p>

                <div className="flex flex-wrap gap-4">
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Provider</InputLabel>
                    <Select
                      label="Provider"
                      value={provider}
                      onChange={(e) =>
                        changeProvider(role.prefix, e.target.value)
                      }
                    >
                      {role.providers.map((p) => (
                        <MenuItem key={p.key} value={p.key}>
                          {p.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <ModelAutocomplete
                    provider={provider}
                    prefix={role.prefix}
                    baseUrl={settings[`${role.prefix}_base_url`] as string}
                    value={settings[`${role.prefix}_model`] as string}
                    placeholder={role.defaults.model}
                    onChange={(v) => setField(role.prefix, "model", v)}
                  />

                  {!isLocal && (
                    <TextField
                      size="small"
                      type="password"
                      label="API Key"
                      sx={{ minWidth: 240 }}
                      autoComplete="off"
                      value={settings[`${role.prefix}_api_key`] as string}
                      onChange={(e) =>
                        setField(role.prefix, "api_key", e.target.value)
                      }
                    />
                  )}

                  <TextField
                    size="small"
                    label="Base URL"
                    sx={{ minWidth: 280, flex: 1 }}
                    placeholder={role.defaults.base_url}
                    value={settings[`${role.prefix}_base_url`] as string}
                    onChange={(e) =>
                      setField(role.prefix, "base_url", e.target.value)
                    }
                  />
                </div>
              </div>
            );
          })}

          <div className="flex justify-end my-4 mx-4">
            <Button
              variant="contained"
              onClick={handleSubmit}
              sx={{
                background: "linear-gradient(135deg, #3b82f6 0%, #1255e7 100%)",
                borderRadius: "10px",
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.9rem",
                padding: "10px 32px",
                boxShadow: "0 4px 14px rgba(78, 103, 174, 0.35)",
                "&:hover": {
                  background:
                    "linear-gradient(135deg, #4e7ad6 0%, #2663EB 100%)",
                  boxShadow: "0 6px 20px rgba(87, 122, 196, 0.45)",
                },
              }}
            >
              Save
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-5 text-sm text-slate-400 dark:text-slate-500">Loading…</p>
      )}
    </div>
  );
}
