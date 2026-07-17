# Backend task: add `POST /inference/transcribe-utterance`

## Why

The desktop app is adding **live transcription in cloud mode** — a transcript that
appears phrase by phrase while a meeting is being recorded, instead of only after
the user stops and presses "Transcribe".

The desktop client already does the hard real-time parts on-device: it runs voice
activity detection to slice the audio into utterances and runs speaker embedding +
clustering to label who is speaking. The one thing it cannot do in cloud mode is
the speech-to-text itself, because cloud mode deliberately never downloads the
Whisper model (75–460 MB) — that's the whole point of being a thin client.

So we need one new endpoint: **give it a few seconds of audio, get back the words.**
Nothing else. The desktop side is already written and works against a stub; this
endpoint is the only thing blocking the feature.

## The endpoint

### `POST /inference/transcribe-utterance`

Transcribe a single short speech utterance and return its text. **Stateless**: no
meeting, no persistence, no DB writes — a pure function from audio to text.

This is deliberately **separate** from the existing `POST /inference/transcribe/{meeting_id}`,
which stays exactly as it is and remains the authoritative batch path that persists a
full diarized transcript. The new endpoint must **never** write to the transcript
store. (See "Why not reuse the batch endpoint" below.)

**Auth:** `Authorization: Bearer <access_token>` — same scheme and same 401-on-expiry
behavior as every other `/inference` route. The desktop client refreshes its token and
retries once on 401 automatically, so just fail with a normal 401 as usual.

### Request

```
POST /inference/transcribe-utterance?language=en
Authorization: Bearer <access_token>
Content-Type: multipart/form-data; boundary=...

file: <utterance.wav>
```

- `file` (required, the only multipart part): a WAV, **16 kHz, mono, 16-bit PCM**.
  Typically 0.5–30 s, roughly 16 KB–1 MB. The client guarantees this exact format.
- `language` (query param, optional, default `"en"`): ISO-639-1 hint, not a
  constraint. Mirrors the user's transcription-language setting in the desktop app.

Note `language` is a **query param**, not a form field — the client hand-assembles
the multipart body with a single file part, so extra form fields are awkward on its
side and trivial for FastAPI to take from the query string.

### Success — 200, standard envelope

```json
{
  "response": { "status": true, "message": "Transcribed" },
  "data": { "text": "so what we agreed on last week" }
}
```

- `data.text` (string, required): the transcript, trimmed.
- **Return `""` with `status: true` for non-speech.** Do **not** return a 4xx for
  silence. The on-device VAD has false positives, and the client silently drops
  empty lines — that's the desired behavior. An error for silence would look like
  an outage to the client's failure counter (see below) and could stop live
  transcription for the whole meeting.

### Failure

The usual envelope convention applies: `response.status == false` means failure
**even on HTTP 200**.

```json
{ "response": { "status": false, "message": "Audio exceeds the 60 s limit" }, "data": null }
```

### Optional `data` fields

The client ignores these today, but they're cheap to include and useful later:
`durationMs`, `language` (as detected), `confidence`.

## Non-functional requirements — these are the whole point

- **Latency is the hard constraint.** This is called on the critical path of a live
  UI, once per utterance, roughly **10–20 times per minute per active recording**.
  Target **p95 round-trip under 2 s** for a 5 s utterance. The client's timeout is
  **15 s**; past that it drops the line and warns the user. A batch-quality endpoint
  that takes 30 s per call is useless here even if it's perfectly accurate.
- **Idempotent and retry-safe.** The client retries once, immediately, on transport
  failure or timeout. Since nothing is stored, a duplicate request must be harmless.
- **Rate limits.** Must tolerate a sustained ~20 req/min per user for the length of
  a meeting — potentially hours. Prefer no limit at all. If you need one, make it
  generous and return `status: false` with a readable message rather than a bare 429.
- **Size guard.** Reject > 2 MB or > 60 s with `status: false` and a clear message.
- **Model choice is yours** (Whisper-family expected). Consistency with
  `/inference/transcribe/{meeting_id}`'s model is *desirable but not required* — the
  batch transcript supersedes these live lines anyway, so minor wording differences
  between the live and final text are expected and acceptable. Favor a fast model.

## How the client behaves (so the contract makes sense)

- One request at a time per recording, strictly serial — no concurrency per client.
- On failure it retries once, then drops that single line and keeps going.
- Only after **5 consecutive** failed utterances does it stop live transcription and
  tell the user to use the batch Transcribe button. The WAV is always still recorded
  locally and unaffected, so an outage here degrades gracefully — it never loses audio.
- Live lines are marked provisional client-side and are **deleted** once the recording
  is batch-transcribed through the existing `/inference/transcribe/{meeting_id}`.
  That's why this endpoint doesn't need to persist anything.

## Why not reuse the batch endpoint

`POST /inference/transcribe/{meeting_id}` takes a `fileId` for an already-uploaded
whole recording, persists a full diarized transcript, and is synchronous with a
180 s client timeout. Using it per utterance would mean uploading ~15 files a minute,
writing ~15 transcripts a minute into the meeting, and making retries destructive.
The two jobs are genuinely different: one is "archive this meeting properly", the
other is "what did they just say".

## Definition of done

- `POST /inference/transcribe-utterance` accepts a 16 kHz mono 16-bit PCM WAV plus an
  optional `language` query param, authenticated with the usual bearer token.
- Returns `{"response": {"status": true, ...}, "data": {"text": "..."}}`; returns
  `text: ""` (not an error) for silence.
- p95 under ~2 s for a 5 s utterance.
- Writes nothing to the transcript store; safe to call twice with the same audio.
- The existing `/inference/transcribe/{meeting_id}` is unchanged.
