import { invoke } from "@tauri-apps/api/core";

export interface NameValue {
  name: string;
  value: number;
}

export interface SpeakerTalkTime {
  speaker: string;
  seconds: number;
}

export interface TimeSeries {
  categories: string[];
  data: number[];
}

/** Aggregated, locally-derived dashboard statistics. */
export interface DashboardStats {
  totalMeetings: number;
  recordedSessions: number;
  totalRecordedSecs: number;
  avgRecordingSecs: number;
  summarizedMeetings: number;
  openActionItems: number;
  doneActionItems: number;
  talkTime: SpeakerTalkTime[];
  typeBreakdown: NameValue[];
  /** Meeting counts indexed Mon..Sun (length 7). */
  meetingsByWeekday: number[];
  /** Meeting counts per month (YYYY-MM), oldest first. */
  meetingsOverTime: TimeSeries;
}

/** Fetch the dashboard statistics computed from the local database. */
export const getDashboardStats = () =>
  invoke<DashboardStats>("get_dashboard_stats");
