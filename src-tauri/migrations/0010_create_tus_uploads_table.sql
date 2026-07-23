-- Resumable (tus 1.0.0) upload bookkeeping.
--
-- A meeting recording can reach 2 GB, so uploads are chunked and must survive an
-- app restart. One row per in-flight upload, keyed by the local file path: it
-- remembers the absolute tus `Location` handed back by the create request so a
-- later run can HEAD it and continue from the server's offset instead of
-- restarting at zero.
--
-- The row is deleted when the upload finishes, is cancelled, or the server
-- reports the upload gone (404/410/403). `created_at` also lets stale rows be
-- swept: the backend expires uploads after 24 h.
CREATE TABLE IF NOT EXISTS tus_uploads (
  local_path   TEXT PRIMARY KEY,
  upload_url   TEXT NOT NULL,
  total_size   INTEGER NOT NULL,
  file_name    TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_hash    TEXT,
  -- The cloud user the upload belongs to. A row created under a different
  -- account is dead weight (the server answers 403), so it is dropped on sight.
  user_id      TEXT,
  created_at   INTEGER NOT NULL
);
