import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export const loadingAtom = atom(false)

export const tableLoadingAtom = atom(false)
export const showSideBar = atom(false)

export type ThemeMode = "light" | "dark";

// Persisted in localStorage so the choice survives reloads/restarts.
export const themeAtom = atomWithStorage<ThemeMode>("theme", "light");