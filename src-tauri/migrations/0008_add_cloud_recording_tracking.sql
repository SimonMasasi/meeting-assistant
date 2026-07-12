-- Cloud-mode bookkeeping for recordings. In cloud mode a locally-captured WAV is
-- uploaded to the backend and registered as a MeetingRecording; these columns
-- remember the backend ids so re-transcribing reuses the same upload/recording
-- instead of creating duplicates. Null in local mode (and until first uploaded).
ALTER TABLE recordings ADD COLUMN cloud_file_id TEXT;
ALTER TABLE recordings ADD COLUMN cloud_recording_id TEXT;
