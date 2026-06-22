-- One AI-generated summary per meeting, produced by the configured Chat provider
-- from the meeting's transcript. Regenerating overwrites the row.
CREATE TABLE meeting_summaries (
    meeting_id   TEXT PRIMARY KEY,
    summary      TEXT    NOT NULL,
    key_points   TEXT    NOT NULL,  -- JSON array of strings
    action_items TEXT    NOT NULL,  -- JSON array of { id, label, done }
    model        TEXT    NOT NULL,  -- "provider:model" used, for display/debug
    generated_at INTEGER NOT NULL   -- unix epoch seconds
);
