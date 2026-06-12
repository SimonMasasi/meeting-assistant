-- Speaker-labeled transcript lines produced by the on-device live-transcription
-- pipeline (Silero VAD → speaker embedding → Whisper). One row per utterance.
CREATE TABLE transcripts (
    id            TEXT PRIMARY KEY,        -- "{meeting_id}-{seq}"
    meeting_id    TEXT    NOT NULL,
    recording_id  TEXT,                    -- recordings.id this line came from, if known
    seq           INTEGER NOT NULL,        -- ordering within the meeting
    speaker_label TEXT    NOT NULL,        -- raw cluster label, e.g. "Speaker 1"
    speaker_name  TEXT,                    -- user-assigned name; NULL until renamed
    start_ms      INTEGER NOT NULL,
    end_ms        INTEGER NOT NULL,
    text          TEXT    NOT NULL
);

CREATE INDEX idx_transcripts_meeting ON transcripts (meeting_id, seq);

-- Stable per-meeting speaker rename map, so naming a speaker applies to every
-- line of that cluster label (current and future).
CREATE TABLE meeting_speakers (
    meeting_id    TEXT NOT NULL,
    speaker_label TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    PRIMARY KEY (meeting_id, speaker_label)
);
