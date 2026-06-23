import { atomWithStorage } from "jotai/utils";
import { StorageService } from "@/utils/store-utils";

/** Which backend the app talks to. `null` = not chosen yet (first run). */
export type AppMode = "local" | "cloud";

/** Signed-in user session (cloud mode). `token` is a mock until the cloud auth
 *  backend exists; the storage/gate plumbing around it is real. */
export interface Session {
  email: string;
  token: string;
}

/** Chosen app mode, persisted in localStorage (not sensitive). `null` until the
 *  user picks Local or Cloud on the mode-select screen. `getOnInit` reads the
 *  stored value on the very first render so the route gates don't briefly see
 *  `null` and misredirect on reload. */
export const appModeAtom = atomWithStorage<AppMode | null>("appMode", null, undefined, {
  getOnInit: true,
});

/** Encrypted (secure-ls) storage adapter for `atomWithStorage`, so the session
 *  is persisted at rest via the existing {@link StorageService}. `secure-ls`
 *  returns "" for a missing key, which we map back to the initial value. */
const store = new StorageService();
const secureStorage = {
  getItem<T>(key: string, initialValue: T): T {
    const v = store.getItem(key);
    return v === "" || v === null || v === undefined ? initialValue : (v as T);
  },
  setItem<T>(key: string, value: T): void {
    store.setItem(key, value);
  },
  removeItem(key: string): void {
    store.removeItem(key);
  },
};

/** The signed-in session, persisted encrypted. `null` when signed out.
 *  `getOnInit` reads it synchronously on first render so the auth gate never
 *  flashes / misredirects a logged-in user on reload. */
export const sessionAtom = atomWithStorage<Session | null>(
  "session",
  null,
  secureStorage,
  { getOnInit: true },
);
