# Backend change request: `POST /auth/google` (Google sign-in)

**Hand this to whoever owns the FastAPI backend.** The desktop app now has a
working **"Continue with Google"** button. The app runs the entire Google OAuth
flow itself (browser + PKCE loopback) and obtains a Google **`id_token`**. The one
missing piece is a backend endpoint that **verifies that token and returns our own
session**, exactly like `/auth/login` does today.

Until this endpoint exists, clicking "Continue with Google" completes the Google
consent screen successfully and then shows an error toast at the final step
(the app POSTs to `/auth/google` and gets a 404). Everything up to that point is
already working on the app side.

---

## What the desktop app sends

```
POST /auth/google
Content-Type: application/json

{ "idToken": "<Google OpenID Connect id_token — a JWT>" }
```

- No `Authorization` header (this is a public endpoint, same as `/auth/login` and
  `/auth/register`).
- The `idToken` is a Google-signed JWT obtained via the OAuth 2.0 Authorization
  Code + PKCE flow with `scope=openid email profile`.

## What the desktop app expects back

The **same response envelope and `data` shape as `POST /auth/login`** — the Rust
client deserializes it with the existing `LoginData` struct, so the field names
must match exactly (camelCase):

```jsonc
{
  "response": { "status": true, "message": "Signed in with Google" },
  "data": {
    "accessToken": "<our JWT>",
    "refreshToken": "<our refresh JWT>",
    "expiresIn": 3600,                 // access-token lifetime in seconds
    "user": {
      "id": "…",
      "username": "…",
      "email": "…",
      "fullName": "…"
    }
  }
}
```

On failure, return the standard error envelope (`response.status = false` with a
user-facing `message`, or a 4xx with `{ "detail": "…" }`) — the app surfaces
`message`/`detail` directly in a toast.

---

## What the endpoint must do

1. **Verify the `id_token`** with Google's library — do **not** trust it blind:

   ```python
   from google.oauth2 import id_token as google_id_token
   from google.auth.transport import requests as google_requests

   claims = google_id_token.verify_oauth2_token(
       payload.id_token,
       google_requests.Request(),
       audience=settings.GOOGLE_CLIENT_ID,   # MUST equal the app's client ID
   )
   # verify_oauth2_token already checks: signature, `exp`, and `iss` is
   # accounts.google.com / https://accounts.google.com, and `aud` == audience.
   if not claims.get("email_verified"):
       raise HTTPException(400, "Google email is not verified")
   ```

   Reject anything that fails verification.

2. **Identify / create the user.** Key on the Google subject id (`claims["sub"]`);
   fall back to `claims["email"]`. Useful claims: `sub`, `email`, `email_verified`,
   `name`, `given_name`, `family_name`, `picture`.
   - New user → create an account (derive a `username`, e.g. from the email local
     part with de-duplication; there is no password).
   - **Account linking (please decide the policy):** if a user with the same
     `email` already exists from password sign-up, either link the Google identity
     to that account or reject with a clear message. Recommended: link it and store
     the Google `sub` so future logins match by `sub`.
   - Consider a `google_sub` (and/or `auth_provider`) column so Google accounts are
     distinguishable and re-loginable.

3. **Issue our own tokens** — reuse the exact same access/refresh token generation
   as `/auth/login`, and return them in the envelope shown above. The Google
   `id_token` is not stored or reused after this point.

---

## Config

- **`GOOGLE_CLIENT_ID`** — the OAuth **"Desktop app"** client ID from Google Cloud
  Console → APIs & Services → Credentials. This is **the same client ID the desktop
  app uses**, and it must be the value passed as `audience` in step 1. It is public
  (safe to ship), but keep it in backend config for the audience check.
- If you later add a web client too, accept a **list** of allowed audiences.

The desktop app reads its client ID from (in order): a stored setting →
the `GOOGLE_CLIENT_ID` environment variable (loaded from the project `.env` at
startup) → empty. The app also needs `GOOGLE_CLIENT_SECRET` (Google requires the
secret in the code exchange even for "Desktop app" clients). Coordinate so both
sides use the **same** client ID.

---

## Testing together

1. Create a Google Cloud OAuth **Desktop app** client; note the client ID.
2. Set `GOOGLE_CLIENT_ID` on the backend and for the desktop build (or via the
   app's stored setting / `set_google_client_id` command).
3. Implement `POST /auth/google` per the above.
4. In the app, click **Continue with Google** → approve in the browser → the app
   should land on the dashboard signed in, with the session persisted exactly like
   an email login.

### Reference: the existing contract this mirrors

- `POST /auth/login` — returns the `LoginData` `data` shape reused here.
- Rust side that consumes it: `src-tauri/src/cloud/google.rs`
  (`cloud_sign_in_google`), `src-tauri/src/cloud/dto.rs` (`LoginData`,
  `BackendUser`), `src-tauri/src/cloud/mod.rs` (`save_session`).
