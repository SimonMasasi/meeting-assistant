import { invoke } from "@tauri-apps/api/core";

/**
 * A persisted meeting. These are the scalar fields stored in the `meetings`
 * table; the transcript, summary, key points and action items live in their own
 * tables and are fetched separately (see {@link ./transcription} and
 * {@link ./summary}).
 */
export interface Meeting {
  id: string;
  title: string;
  host: string;
  date: string;
  time: string;
  views: number;
  attendees: number;
  status: "Completed" | "Ongoing" | "Upcoming" | "Cancelled";
  source: "online" | "in-person";
  durationLabel: string;
  language: string;
  tags: string[];
  objective: string;
  /** Unix epoch seconds the meeting was created (drives newest-first ordering). */
  createdAt: number;
}

/** Every saved meeting, newest first. */
export const listMeetings = () => invoke<Meeting[]>("list_meetings");

/** A single meeting, or `null` if no meeting has that id. */
export const getMeeting = (meetingId: string) =>
  invoke<Meeting | null>("get_meeting", { meetingId });

/** Persist a new meeting and return the stored row. */
export const createMeeting = (meeting: Meeting) =>
  invoke<Meeting>("create_meeting", { meeting });

/** Update an existing meeting and return the stored row. */
export const updateMeeting = (meeting: Meeting) =>
  invoke<Meeting>("update_meeting", { meeting });

/** Delete a meeting and all of its recordings, transcripts and summaries. */
export const deleteMeeting = (meetingId: string) =>
  invoke<void>("delete_meeting", { meetingId });
