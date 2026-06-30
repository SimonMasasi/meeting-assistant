-- Cloud session for cloud mode. Single row (id = 1), upserted on sign-in and
-- cleared on sign-out.
--
-- The JWTs live here (Rust side) rather than in the webview, so the JavaScript
-- layer never holds the access/refresh token. Stored as plaintext at rest,
-- consistent with how `ai_settings` already keeps provider API keys; this can be
-- upgraded to the OS keychain later without changing callers.
CREATE TABLE IF NOT EXISTS cloud_session (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    access_token  TEXT    NOT NULL DEFAULT '',
    refresh_token TEXT    NOT NULL DEFAULT '',
    -- Unix epoch seconds at which the access token expires (best-effort; the
    -- client also refreshes reactively on a 401).
    expires_at    INTEGER NOT NULL DEFAULT 0,
    user_id       TEXT    NOT NULL DEFAULT '',
    username      TEXT    NOT NULL DEFAULT '',
    email         TEXT    NOT NULL DEFAULT ''
);
