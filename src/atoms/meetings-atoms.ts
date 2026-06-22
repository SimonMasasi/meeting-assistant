import { atom } from "jotai";
import { Meeting } from "@/services/meetings";

/** In-session cache of meetings, hydrated from the database via `listMeetings()`.
 *  The list and detail pages share it so updates show immediately without a
 *  refetch; it starts empty and is filled on first load. */
export const meetingsAtom = atom<Meeting[]>([]);
