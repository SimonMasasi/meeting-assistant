export interface ActionItem {
  id: string;
  label: string;
  done: boolean;
}

export interface TranscriptLine {
  id: string;
  speaker: string;
  initials: string;
  color: string;
  timestamp: string;
  text: string;
}

export interface MeetingDetail {
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
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
  transcript: TranscriptLine[];
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

export const meetingsSeed: MeetingDetail[] = [
  {
    id: "mtg-2401",
    title: "Weekly Meeting with Gracia",
    host: "Jonathan Reed",
    date: "Aug 24",
    time: "9:30 AM",
    views: 2,
    attendees: 2,
    status: "Completed",
    source: "online",
    durationLabel: "32 min",
    language: "ENG",
    tags: ["Project", "Wireframe", "Concept"],
    objective:
      "To create a visually compelling and user-friendly design that reflects the brand identity and product values, while aligning with current trends and audience expectations.",
    summary:
      "The client and project manager reviewed the progress of the new landing page project. The team has completed the first draft and is currently refining the hero section.",
    keyPoints: [
      "Share CTA design variations with client for feedback",
      "Refine hero section visuals and adjust color palette",
      "Prepare a preview of the header animation",
    ],
    actionItems: [
      { id: "a1", label: "Refine hero section visuals", done: true },
      { id: "a2", label: "Adjust typography", done: true },
      { id: "a3", label: "Send CTA designs for review", done: false },
      { id: "a4", label: "Animate flow prototype", done: false },
    ],
    transcript: [
      {
        id: "t1",
        speaker: "Gracia",
        initials: "GR",
        color: AVATAR_COLORS[0],
        timestamp: "0:00",
        text: "Hi Jonathan, thanks for joining today's call. I just wanted to go over the progress on the new landing page project in detail, because we need to make sure everything aligns with the initial brief before we move forward with the next phase.",
      },
      {
        id: "t2",
        speaker: "Jonathan",
        initials: "JO",
        color: AVATAR_COLORS[1],
        timestamp: "0:08",
        text: "The design team has already completed the first draft of the landing page. At this stage, we're focusing on refining the hero section, adjusting the typography scale to improve readability, and making a few tweaks to the overall color palette so that it feels more consistent with the brand identity.",
      },
      {
        id: "t3",
        speaker: "Gracia",
        initials: "GR",
        color: AVATAR_COLORS[0],
        timestamp: "0:22",
        text: "That sounds good. Have you tested different variations yet, so that we can see which option drives the best visibility?",
      },
      {
        id: "t4",
        speaker: "Jonathan",
        initials: "JO",
        color: AVATAR_COLORS[1],
        timestamp: "0:31",
        text: "Not yet — that's next on the list. I'll prepare three CTA variations and share them with you for feedback by the end of the week.",
      },
    ],
  },
  {
    id: "mtg-2402",
    title: "Engineering Standup",
    host: "Bob Smith",
    date: "Jun 04",
    time: "10:00 AM",
    views: 5,
    attendees: 8,
    status: "Completed",
    source: "online",
    durationLabel: "18 min",
    language: "ENG",
    tags: ["Engineering", "Sprint"],
    objective:
      "Align the engineering team on yesterday's progress, today's plan, and surface any blockers ahead of the sprint review.",
    summary:
      "The team shared progress on the auth refactor and the new sync pipeline. Two blockers were raised around the CI runner and a flaky integration test.",
    keyPoints: [
      "Auth refactor is on track for Friday",
      "CI runner needs more memory — infra to investigate",
      "Flaky sync test to be quarantined",
    ],
    actionItems: [
      { id: "a1", label: "File infra ticket for CI runner", done: true },
      { id: "a2", label: "Quarantine flaky sync test", done: false },
      { id: "a3", label: "Review auth PR", done: false },
    ],
    transcript: [
      {
        id: "t1",
        speaker: "Bob",
        initials: "BO",
        color: AVATAR_COLORS[1],
        timestamp: "0:00",
        text: "Morning everyone, let's keep it quick. Who wants to start?",
      },
      {
        id: "t2",
        speaker: "Priya",
        initials: "PR",
        color: AVATAR_COLORS[2],
        timestamp: "0:05",
        text: "I'll go. Auth refactor is nearly done, just need a review on the PR. No blockers there.",
      },
    ],
  },
  {
    id: "mtg-2403",
    title: "Client Demo — Acme Corp",
    host: "Carol White",
    date: "Jun 04",
    time: "1:00 PM",
    views: 0,
    attendees: 5,
    status: "Ongoing",
    source: "in-person",
    durationLabel: "60 min",
    language: "ENG",
    tags: ["Client", "Demo", "Sales"],
    objective:
      "Demonstrate the latest release to Acme Corp stakeholders and gather feedback on the reporting module.",
    summary:
      "Live demo of the reporting dashboard and export features. Client is enthusiastic about the scheduled reports and asked about SSO.",
    keyPoints: [
      "Client wants SSO before rollout",
      "Scheduled reports were the highlight",
      "Follow up with pricing for the enterprise tier",
    ],
    actionItems: [
      { id: "a1", label: "Send SSO timeline", done: false },
      { id: "a2", label: "Share enterprise pricing", done: false },
    ],
    transcript: [
      {
        id: "t1",
        speaker: "Carol",
        initials: "CA",
        color: AVATAR_COLORS[3],
        timestamp: "0:00",
        text: "Thanks for having us. Today we'll walk through the new reporting module and the export options you asked about.",
      },
    ],
  },
];

export function getMeetingById(
  meetings: MeetingDetail[],
  id?: string
): MeetingDetail | undefined {
  return meetings.find((m) => m.id === id);
}
