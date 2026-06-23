import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAtomValue } from "jotai";
import { appModeAtom, sessionAtom } from "@/atoms/app-mode-atoms";

/**
 * Landing decision for "/". Reads mode + session (both synchronous from storage,
 * so no flash) and sends the user to the right place:
 *  - mode not chosen        → mode-select
 *  - local                  → app
 *  - cloud + signed in      → app
 *  - cloud + signed out     → login
 */
export function RootRedirect() {
  const mode = useAtomValue(appModeAtom);
  const session = useAtomValue(sessionAtom);

  if (mode === null) return <Navigate to="/mode-select" replace />;
  if (mode === "cloud" && !session) return <Navigate to="/login" replace />;
  return <Navigate to="/main/dashboard" replace />;
}

/**
 * Guards the main app shell. Local mode always passes; cloud mode requires a
 * session; an unset mode bounces back to the chooser.
 */
export function RequireAccess({ children }: { children: ReactNode }) {
  const mode = useAtomValue(appModeAtom);
  const session = useAtomValue(sessionAtom);

  if (mode === null) return <Navigate to="/mode-select" replace />;
  if (mode === "cloud" && !session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
