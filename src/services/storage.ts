import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/** The currently effective storage folder (configured, or the Downloads default). */
export const getStorageDir = () => invoke<string>("get_storage_dir");

/** Persist the user's chosen storage folder. */
export const setStorageDir = (path: string) =>
  invoke<void>("set_storage_dir", { path });

/** Native folder picker; returns the chosen path or null if cancelled. */
export async function pickStorageDir(
  defaultPath?: string
): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath,
  });
  return typeof selected === "string" ? selected : null;
}
