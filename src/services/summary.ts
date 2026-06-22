import { invoke } from "@tauri-apps/api/core";
import { ActionItem } from "@/pages/meetings/mock-data";

/**
 * A meeting's AI-generated summary, produced from its transcript by the
 * configured Chat provider (OpenAI, Anthropic, or a local OpenAI-compatible
 * server). Persisted in the `meeting_summaries` table and overwritten on
 * regeneration.
 */
export interface MeetingSummary {
  meetingId: string;
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
  /** "provider:model" that produced this summary. */
  model: string;
  /** Unix epoch seconds the summary was generated. */
  generatedAt: number;
}

/** The saved summary for a meeting, or `null` if it has never been generated. */
export const getMeetingSummary = (meetingId: string) =>
  invoke<MeetingSummary | null>("get_meeting_summary", { meetingId });

/**
 * Generate (or regenerate) the summary for a meeting using the configured Chat
 * provider, persist it, and return it. Rejects with a readable message when no
 * provider/model is configured or the meeting has no transcript yet.
 */
export const generateMeetingSummary = (meetingId: string) =>
  invoke<MeetingSummary>("generate_meeting_summary", { meetingId });
