//! "Continue with Google" — desktop OAuth 2.0 Authorization Code flow with PKCE.
//!
//! Google's recommended flow for a native/desktop app (client type "Desktop app",
//! no confidential secret):
//!
//! 1. Bind a loopback listener on `127.0.0.1:<ephemeral>` — that becomes the
//!    `redirect_uri`.
//! 2. Generate a PKCE `code_verifier` + `code_challenge` and a random `state`.
//! 3. Open the system browser to Google's consent screen.
//! 4. Catch the redirect (`GET /?code=…&state=…`) on the loopback listener.
//! 5. Exchange the code (+ verifier) at Google's token endpoint → `id_token`.
//! 6. Hand the `id_token` to **our** backend (`POST /auth/google`), which verifies
//!    it and returns the same [`LoginData`](crate::cloud::dto::LoginData) envelope
//!    as `/auth/login`, so the existing session plumbing is reused unchanged.
//!
//! The JWTs still never reach the webview — only a [`CloudUser`] crosses back.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::thread::sleep;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::cloud::auth::CloudUser;
use crate::cloud::dto::LoginData;
use crate::cloud::{self, client, google_client_id, google_client_secret};
use crate::error::{Error, Result};

/// How long to wait for the user to complete the Google consent screen before
/// giving up on the loopback redirect.
const CONSENT_TIMEOUT: Duration = Duration::from_secs(300);

/// Sign in with Google. Runs the full desktop PKCE flow, exchanges the code with
/// our backend, persists the session, and returns the signed-in user.
#[tauri::command]
pub async fn cloud_sign_in_google(app: tauri::AppHandle) -> Result<CloudUser> {
    let client_id = google_client_id(&app).await?;
    if client_id.is_empty() {
        return Err(Error::Message(
            "Google sign-in isn't configured (missing Google client ID).".into(),
        ));
    }
    // Google requires the client secret in the code exchange even for desktop
    // clients. May be empty for a truly public client (then it's omitted).
    let client_secret = google_client_secret(&app).await?;

    // PKCE + anti-CSRF state.
    let verifier = random_b64url(32)?;
    let challenge = pkce_challenge(&verifier);
    let state = random_b64url(16)?;

    // Loopback redirect target — Google accepts any port on 127.0.0.1 for a
    // Desktop client.
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| Error::Message(format!("Could not open a local redirect port: {e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| Error::Message(format!("Could not read the local redirect port: {e}")))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth\
         ?response_type=code\
         &client_id={client_id}\
         &redirect_uri={redirect}\
         &scope={scope}\
         &code_challenge={challenge}\
         &code_challenge_method=S256\
         &state={state}\
         &access_type=offline\
         &prompt=select_account",
        redirect = percent_encode(&redirect_uri),
        scope = percent_encode("openid email profile"),
    );

    // Open the consent screen in the user's default browser.
    let to_open = auth_url.clone();
    tauri::async_runtime::spawn_blocking(move || open::that(to_open))
        .await
        .map_err(|e| Error::Message(format!("browser task failed: {e}")))?
        .map_err(|e| Error::Message(format!("Could not open the browser: {e}")))?;

    // Catch the redirect (blocking accept + parse) off the async workers.
    let expected_state = state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || {
        wait_for_code(&listener, &expected_state)
    })
    .await
    .map_err(|e| Error::Message(format!("redirect task failed: {e}")))??;

    // Exchange the authorization code for tokens at Google (blocking ureq).
    let id_token = tauri::async_runtime::spawn_blocking({
        let (client_id, client_secret, verifier, redirect_uri) =
            (client_id, client_secret, verifier, redirect_uri);
        move || exchange_code(&client_id, &client_secret, &code, &verifier, &redirect_uri)
    })
    .await
    .map_err(|e| Error::Message(format!("token exchange task failed: {e}")))??;

    // Verify with our backend and mint our own session.
    let data = client::public_request(
        &app,
        "POST",
        "/auth/google",
        Some(json!({ "idToken": id_token })),
    )
    .await?;
    let login: LoginData = serde_json::from_value(data)
        .map_err(|e| Error::Message(format!("Unexpected Google login response: {e}")))?;
    cloud::save_session(&app, &login).await?;
    Ok(login.user.unwrap_or_default().into())
}

/// Generate `nbytes` of randomness and encode it as base64url (no padding).
fn random_b64url(nbytes: usize) -> Result<String> {
    let mut buf = vec![0u8; nbytes];
    getrandom::getrandom(&mut buf)
        .map_err(|e| Error::Message(format!("Could not generate secure randomness: {e}")))?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// The PKCE `code_challenge`: base64url(SHA-256(code_verifier)), no padding.
fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hasher.finalize())
}

/// Block until Google redirects back with `?code=…&state=…`, validate `state`,
/// and return the authorization code. Times out after [`CONSENT_TIMEOUT`].
fn wait_for_code(listener: &TcpListener, expected_state: &str) -> Result<String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| Error::Message(format!("redirect listener error: {e}")))?;
    let deadline = Instant::now() + CONSENT_TIMEOUT;

    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                // Read just the request line: `GET /?code=…&state=… HTTP/1.1`.
                let mut reader = BufReader::new(&stream);
                let mut request_line = String::new();
                reader
                    .read_line(&mut request_line)
                    .map_err(|e| Error::Message(format!("could not read redirect: {e}")))?;

                let query = request_line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|target| target.split_once('?').map(|(_, q)| q.to_string()))
                    .unwrap_or_default();

                if let Some(err) = query_param(&query, "error") {
                    write_response(&mut stream, false);
                    return Err(Error::Message(format!("Google sign-in was cancelled ({err}).")));
                }

                let state = query_param(&query, "state").unwrap_or_default();
                if state != expected_state {
                    write_response(&mut stream, false);
                    return Err(Error::Message(
                        "Google sign-in failed a security check (state mismatch).".into(),
                    ));
                }

                let code = match query_param(&query, "code") {
                    Some(c) if !c.is_empty() => c,
                    _ => {
                        write_response(&mut stream, false);
                        return Err(Error::Message(
                            "Google redirect was missing the authorization code.".into(),
                        ));
                    }
                };

                write_response(&mut stream, true);
                return Ok(code);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(Error::Message("Google sign-in timed out.".into()));
                }
                sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(Error::Message(format!("redirect listener error: {e}"))),
        }
    }
}

/// Write a minimal "you can close this tab" page back to the browser.
fn write_response(stream: &mut std::net::TcpStream, ok: bool) {
    let (title, note) = if ok {
        ("Signed in", "You're signed in. You can close this tab and return to Meeting Assistant.")
    } else {
        ("Sign-in failed", "Something went wrong. You can close this tab and try again.")
    };
    let html = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{title}</title></head>\
         <body style=\"font-family:system-ui;text-align:center;padding-top:4rem;color:#334155\">\
         <h2>{title}</h2><p>{note}</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// Exchange the authorization code for tokens at Google's token endpoint and
/// return the `id_token`. Blocking `ureq` call — run inside `spawn_blocking`.
fn exchange_code(
    client_id: &str,
    client_secret: &str,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<String> {
    let mut form = vec![
        ("code", code),
        ("client_id", client_id),
        ("code_verifier", verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ];
    // Google requires client_secret for desktop clients; only omit it when the
    // client is genuinely public (no secret configured).
    if !client_secret.is_empty() {
        form.push(("client_secret", client_secret));
    }

    let resp = ureq::post("https://oauth2.googleapis.com/token")
        .timeout(Duration::from_secs(30))
        .send_form(&form);

    let body: Value = match resp {
        Ok(r) => {
            let text = r
                .into_string()
                .map_err(|e| Error::Message(format!("Could not read Google's token response: {e}")))?;
            serde_json::from_str(&text)
                .map_err(|e| Error::Message(format!("Malformed Google token response: {e}")))?
        }
        Err(ureq::Error::Status(_, r)) => {
            let detail = r
                .into_string()
                .ok()
                .and_then(|t| serde_json::from_str::<Value>(&t).ok())
                .and_then(|v| {
                    v.get("error_description")
                        .or_else(|| v.get("error"))
                        .and_then(Value::as_str)
                        .map(String::from)
                })
                .unwrap_or_else(|| "token exchange failed".into());
            return Err(Error::Message(format!("Google rejected the sign-in: {detail}")));
        }
        Err(e) => return Err(Error::Message(format!("Could not reach Google: {e}"))),
    };

    body.get("id_token")
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| Error::Message("Google's token response had no id_token.".into()))
}

/// Find a query parameter and URL-decode its value.
fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| url_decode(v))
    })
}

/// Minimal `application/x-www-form-urlencoded` decoder (`%XX` + `+`).
fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hi = (bytes[i + 1] as char).to_digit(16);
                let lo = (bytes[i + 2] as char).to_digit(16);
                if let (Some(hi), Some(lo)) = (hi, lo) {
                    out.push((hi * 16 + lo) as u8);
                    i += 3;
                    continue;
                }
                out.push(b'%');
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Percent-encode a string for use in a query value (encode everything that
/// isn't an unreserved character).
fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
