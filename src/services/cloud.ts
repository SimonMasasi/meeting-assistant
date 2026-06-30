import { invoke } from "@tauri-apps/api/core";
import type { AppMode } from "@/atoms/app-mode-atoms";

/**
 * Cloud configuration + connectivity commands. Auth lives in {@link ../hooks/auth}.
 * These mirror the app mode into Rust (so Rust commands can route local-vs-cloud)
 * and manage the backend base URL.
 */

/** Mirror the active app mode into the Rust side. */
export const setAppMode = (mode: AppMode) => invoke<void>("set_app_mode", { mode });

/** The configured cloud backend base URL (or the default when unset). */
export const getCloudBaseUrl = () => invoke<string>("get_cloud_base_url");

/** Persist the cloud backend base URL. */
export const setCloudBaseUrl = (url: string) => invoke<void>("set_cloud_base_url", { url });

/** Whether the configured backend is currently reachable. */
export const cloudHealth = () => invoke<boolean>("cloud_health");
