import { OfflineUser } from "@/pages/user-management/offline-users/offlineUsersTypes";
import { atom } from "jotai";

export const offlineUsersAtom = atom<OfflineUser[]>([]);