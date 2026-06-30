import { useAtom } from "jotai";
import { invoke } from "@tauri-apps/api/core";
import { Session, sessionAtom } from "@/atoms/app-mode-atoms";

/** The signed-in cloud user returned by the Rust auth commands. The JWT itself
 *  stays in Rust (the `cloud_session` table) and never reaches the webview. */
export interface CloudUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
}

/** Fields collected by the sign-up form. */
export interface SignUpInput {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Cloud auth, backed by the FastAPI backend via Rust commands. `signIn`/`signUp`
 * perform the real round trip and persist a session on success; `signOut` clears
 * it both in Rust (the stored JWT) and in the session atom. The route gates react
 * to the session atom, so the redirect plumbing is unchanged.
 *
 * Login is by **username** (the backend matches `User.username`). The session's
 * `email` is taken from the authenticated user for display.
 */
export function useSession() {
  const [session, setSession] = useAtom(sessionAtom);

  const signIn = async (username: string, password: string): Promise<Session> => {
    const user = await invoke<CloudUser>("cloud_sign_in", { username, password });
    // `token` is a non-sensitive marker so the gates see "signed in"; the real
    // JWT lives in Rust.
    const next: Session = { email: user.email || username, token: "cloud" };
    setSession(next);
    return next;
  };

  const signUp = async (input: SignUpInput): Promise<Session> => {
    await invoke("cloud_sign_up", {
      username: input.username,
      email: input.email,
      password: input.password,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
    });
    // Registration doesn't return tokens — sign in to obtain them.
    return signIn(input.username, input.password);
  };

  const signOut = async (): Promise<void> => {
    try {
      await invoke("cloud_sign_out");
    } catch {
      // Clear locally even if the backend call fails.
    }
    setSession(null);
  };

  return { session, signIn, signUp, signOut };
}
