CREATE TABLE recordings (
    id         TEXT PRIMARY KEY,
    meeting_id TEXT    NOT NULL,
    file_name  TEXT    NOT NULL,
    path       TEXT    NOT NULL,
    size       INTEGER NOT NULL
);
