import { invoke } from "@tauri-apps/api/core";

/** Configuration for a single AI role (STT, TTS or chat). */
export interface AiProviderConfig {
  provider: string;
  api_key: string;
  model: string;
  base_url: string;
}

/** AI model provider settings for each role. */
export interface AiSettings {
  // Speech-to-text (transcription)
  stt_provider: string;
  stt_api_key: string;
  stt_model: string;
  stt_base_url: string;

  // Text-to-speech
  tts_provider: string;
  tts_api_key: string;
  tts_model: string;
  tts_base_url: string;

  // Chat / summarization (LLM)
  chat_provider: string;
  chat_api_key: string;
  chat_model: string;
  chat_base_url: string;
}

/**
 * Sensible defaults applied when a field is left blank. These mirror the
 * OpenAI-compatible API shape that most providers (OpenAI, Ollama, LM Studio,
 * etc.) expose, so a user only needs to override what differs for their setup.
 */
export const AI_DEFAULTS: AiSettings = {
  stt_provider: "openai",
  stt_api_key: "",
  stt_model: "whisper-1",
  stt_base_url: "https://api.openai.com/v1",

  tts_provider: "openai",
  tts_api_key: "",
  tts_model: "tts-1",
  tts_base_url: "https://api.openai.com/v1",

  chat_provider: "openai",
  chat_api_key: "",
  chat_model: "gpt-4o-mini",
  chat_base_url: "https://api.openai.com/v1",
};

/** The saved AI provider settings (blank defaults when never configured). */
export const getAiSettings = () => invoke<AiSettings>("get_ai_settings");

/** Persist the user's AI provider settings. */
export const setAiSettings = (settings: AiSettings) =>
  invoke<void>("set_ai_settings", { settings });

/**
 * List the models installed on a local / self-hosted server (Ollama, LM Studio,
 * …) reachable at `baseUrl`. Used to populate the model picker for the "local"
 * provider. Throws if the server is unreachable; callers fall back to free text.
 */
export const listLocalModels = (baseUrl: string) =>
  invoke<string[]>("list_local_models", { baseUrl });
