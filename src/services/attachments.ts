import { invoke } from "@tauri-apps/api/core";

export interface SavedAttachment {
  id: string;
  fileName: string;
  path: string;
  size: number;
}

/**
 * Persist a base64-encoded file to the Rust backend, stored under the app-data
 * directory and organized per meeting. `dataBinary` is the raw base64 (no
 * data-URI prefix) emitted by the DynamicFileUpload component.
 */
export function saveMeetingAttachment(
  meetingId: string,
  fileName: string,
  dataBinary: string
): Promise<SavedAttachment> {
  // Tauri maps snake_case command args to camelCase on the JS side.
  return invoke<SavedAttachment>("save_meeting_attachment", {
    meetingId,
    fileName,
    dataBinary,
  });
}
