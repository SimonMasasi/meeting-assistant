import { useAtom } from "jotai";
import { Session, sessionAtom } from "@/atoms/app-mode-atoms";

/**
 * Reactive session access for cloud mode. `signIn` is mock-accept for now (any
 * email creates a persisted session); the real cloud auth call swaps in here
 * later behind the same interface. `signOut` clears the session.
 */
export function useSession() {
  const [session, setSession] = useAtom(sessionAtom);

  const signIn = (email: string): Session => {
    const next: Session = { email, token: `mock-${Date.now()}` };
    setSession(next);
    return next;
  };

  const signOut = () => setSession(null);

  return { session, signIn, signOut };
}
