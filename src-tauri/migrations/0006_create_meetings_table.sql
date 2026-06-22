-- The parent record for a meeting. Until now meetings lived only in the
-- frontend's in-memory state, so they vanished on restart while their children
-- (recordings, transcripts, meeting_speakers, meeting_summaries, attachments)
-- persisted and orphaned. This table makes meetings durable; `id` is the same
-- frontend-generated string the child tables already reference via `meeting_id`.
CREATE TABLE meetings (
    id             TEXT PRIMARY KEY,                      -- e.g. "mtg-1718900000000"
    title          TEXT    NOT NULL,
    host           TEXT    NOT NULL DEFAULT '',
    date           TEXT    NOT NULL DEFAULT '',           -- display string, e.g. "Aug 24"
    time           TEXT    NOT NULL DEFAULT '',           -- display string, e.g. "9:30 AM"
    views          INTEGER NOT NULL DEFAULT 0,
    attendees      INTEGER NOT NULL DEFAULT 0,
    status         TEXT    NOT NULL DEFAULT 'Upcoming',   -- Completed|Ongoing|Upcoming|Cancelled
    source         TEXT    NOT NULL DEFAULT 'online',     -- online|in-person
    duration_label TEXT    NOT NULL DEFAULT '0 min',
    language       TEXT    NOT NULL DEFAULT 'ENG',
    tags           TEXT    NOT NULL DEFAULT '[]',         -- JSON array of strings
    objective      TEXT    NOT NULL DEFAULT '',
    created_at     INTEGER NOT NULL DEFAULT 0             -- unix epoch seconds, for ordering
);

-- Recover meetings that already have child rows from before this table existed,
-- so their recordings/transcripts/summaries become reachable again instead of
-- orphaned. (Demo seed meetings had no DB children, so they are not recreated.)
INSERT OR IGNORE INTO meetings (id, title, status, source, created_at)
SELECT meeting_id, 'Recovered meeting ' || meeting_id, 'Completed', 'online', 0
FROM (
    SELECT meeting_id FROM recordings
    UNION SELECT meeting_id FROM transcripts
    UNION SELECT meeting_id FROM meeting_speakers
    UNION SELECT meeting_id FROM meeting_summaries
    UNION SELECT meeting_id FROM attachments
);
