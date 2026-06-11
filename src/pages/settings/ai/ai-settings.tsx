import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import toast from "react-hot-toast";
import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { loadingAtom } from "@/atoms/shared-atoms";
import {
  AI_DEFAULTS,
  AiSettings as AiSettingsModel,
  getAiSettings,
  setAiSettings,
} from "@/services/ai";

/** A selectable model provider. `local` covers self-hosted / OpenAI-compatible
 *  endpoints (Ollama, LM Studio, local Whisper, …) and needs no API key. */
type ProviderOption = { key: string; label: string };

const OPENAI: ProviderOption = { key: "openai", label: "OpenAI" };
const ANTHROPIC: ProviderOption = { key: "anthropic", label: "Anthropic" };
const LOCAL: ProviderOption = { key: "local", label: "Local / self-hosted" };

/** Which providers are valid per role. Anthropic offers no STT/TTS, so it only
 *  appears for chat. */
const STT_PROVIDERS = [OPENAI, LOCAL];
const TTS_PROVIDERS = [OPENAI, LOCAL];
const CHAT_PROVIDERS = [OPENAI, ANTHROPIC, LOCAL];

/** The three roles, each mapped to its column prefix in `AiSettings` and the
 *  default values used to backfill blank fields / prefill on provider switch. */
type Role = {
  prefix: "stt" | "tts" | "chat";
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
    prefix: "tts",
    title: "Text-to-Speech",
    description: "Generates spoken audio from text.",
    providers: TTS_PROVIDERS,
    defaults: { model: AI_DEFAULTS.tts_model, base_url: AI_DEFAULTS.tts_base_url },
  },
  {
    prefix: "chat",
    title: "Chat / Summarization",
    description: "Writes summaries, key points and action items.",
    providers: CHAT_PROVIDERS,
    defaults: { model: AI_DEFAULTS.chat_model, base_url: AI_DEFAULTS.chat_base_url },
  },
];

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

export function AiSettings() {
  const [settings, setSettings] = useState<AiSettingsModel | null>(null);
  const [_, setLoading] = useAtom(loadingAtom);

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

  return (
    <div className="p-2">
      <h2 className="text-lg font-semibold text-slate-700">AI Models</h2>
      <p className="text-sm text-slate-500 mt-1">
        Choose the provider and model used for transcription, speech and
        summarization. API keys are stored locally on this device.
      </p>

      {/* Summary card */}
      <div className="mt-4 flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
          <AutoAwesomeOutlinedIcon sx={{ color: "#3b82f6" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Configured providers
          </p>
          {settings ? (
            <p className="text-sm font-medium text-slate-700 truncate">
              STT: {settings.stt_provider} · TTS: {settings.tts_provider} · Chat:{" "}
              {settings.chat_provider}
            </p>
          ) : (
            <p className="text-sm font-medium text-slate-400">Loading…</p>
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
                className="mt-5 p-4 rounded-xl bg-white border border-slate-200"
              >
                <h3 className="text-sm font-semibold text-slate-700">
                  {role.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 mb-4">
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

                  <TextField
                    size="small"
                    label="Model"
                    sx={{ minWidth: 220 }}
                    placeholder={role.defaults.model}
                    value={settings[`${role.prefix}_model`] as string}
                    onChange={(e) =>
                      setField(role.prefix, "model", e.target.value)
                    }
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
        <p className="mt-5 text-sm text-slate-400">Loading…</p>
      )}
    </div>
  );
}
