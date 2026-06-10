CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE mail_settings (
    id           INTEGER PRIMARY KEY CHECK (id = 1),
    sender_name  TEXT    NOT NULL DEFAULT '',
    sender_email TEXT    NOT NULL DEFAULT '',
    smtp_host    TEXT    NOT NULL DEFAULT '',
    smtp_port    INTEGER NOT NULL DEFAULT 0,
    username     TEXT    NOT NULL DEFAULT '',
    password     TEXT    NOT NULL DEFAULT '',
    encryption   TEXT    NOT NULL DEFAULT 'none',
    reply_to     TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE attachments (
    id         TEXT PRIMARY KEY,
    meeting_id TEXT    NOT NULL,
    file_name  TEXT    NOT NULL,
    path       TEXT    NOT NULL,
    size       INTEGER NOT NULL
);
