-- Cloud-mode live transcription writes lines locally as they're spoken, before the
-- authoritative backend batch transcript exists. These rows are provisional: they
-- display until the recording is batch-transcribed server-side, then are deleted.
-- Always 0 in local mode, where the local transcript IS authoritative.
ALTER TABLE transcripts ADD COLUMN provisional INTEGER NOT NULL DEFAULT 0;
