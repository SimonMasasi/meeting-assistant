import { invoke } from "@tauri-apps/api/core";

/** On-device transcription options: the Whisper model size and spoken language. */
export interface TranscriptionSettings {
  /** "tiny" | "base" | "small". */
  modelSize: string;
  /** Language code, e.g. "en", "es", "fr". */
  language: string;
}

/** Approximate download size and tradeoff per Whisper model size, for the UI. */
export const MODEL_SIZE_OPTIONS = [
  { key: "tiny", label: "Tiny", hint: "Fastest · ~75 MB · lowest accuracy" },
  { key: "base", label: "Base", hint: "Balanced · ~145 MB" },
  { key: "small", label: "Small", hint: "Most accurate · ~460 MB · slowest" },
];

/** A curated set of common Whisper languages. Multilingual models support many
 *  more; this just covers the frequent picks (the value is the ISO code). */
export const LANGUAGE_OPTIONS = [
  { key: "en", label: "English" },
  { key: "es", label: "Spanish" },
  { key: "fr", label: "French" },
  { key: "de", label: "German" },
  { key: "it", label: "Italian" },
  { key: "pt", label: "Portuguese" },
  { key: "nl", label: "Dutch" },
  { key: "ru", label: "Russian" },
  { key: "zh", label: "Chinese" },
  { key: "ja", label: "Japanese" },
  { key: "ko", label: "Korean" },
  { key: "ar", label: "Arabic" },
  { key: "hi", label: "Hindi" },
  { key: "sw", label: "Swahili" },
];

/** The saved transcription settings (defaults to tiny / English). */
export const getTranscriptionSettings = () =>
  invoke<TranscriptionSettings>("get_transcription_settings");

/** Persist the transcription settings (model size + language). */
export const setTranscriptionSettings = (settings: TranscriptionSettings) =>
  invoke<void>("set_transcription_settings", { settings });
