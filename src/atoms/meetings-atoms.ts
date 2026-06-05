import { atom } from "jotai";
import { MeetingDetail, meetingsSeed } from "@/pages/meetings/mock-data";

/** In-session store of meetings. Seeded with mock data; the Add dialog appends here. */
export const meetingsAtom = atom<MeetingDetail[]>(meetingsSeed);
