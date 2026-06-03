import { OfflineUser } from "@/pages/user-management/offline-users/offline-users-types";
import { atom } from "jotai";

export const offlineUsersAtom = atom<OfflineUser[]>([]);