// Shared presentational types and avatar helpers used by the transcript and
// summary views. (Meetings themselves are persisted — see `@/services/meetings`.)

export interface ActionItem {
  id: string;
  label: string;
  done: boolean;
}

export interface MeetingAttachment {
  id: string;
  fileName: string;
  path: string;
  size: number;
}

export interface TranscriptLine {
  id: string;
  speaker: string;
  initials: string;
  color: string;
  timestamp: string;
  text: string;
}

const AVATAR_COLORS = [
  "bg-gradient-to-br from-pink-400 to-rose-500",
  "bg-gradient-to-br from-blue-400 to-indigo-500",
  "bg-gradient-to-br from-emerald-400 to-teal-500",
  "bg-gradient-to-br from-amber-400 to-orange-500",
];

/** Initials helper for avatars. */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function colorFor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}
