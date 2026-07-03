-- claude-telepathy index schema. Lives in ~/.claude-telepathy/index.db (WAL).
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS sessions (
  session_id      TEXT PRIMARY KEY,
  transcript_path TEXT NOT NULL,
  cwd             TEXT,
  git_branch      TEXT,
  name            TEXT,             -- telepathy name (seeded from registry/branch, user-renamable)
  ai_title        TEXT,
  first_prompt    TEXT,
  last_prompt     TEXT,
  first_ts        TEXT,
  last_ts         TEXT,
  compactions     INTEGER DEFAULT 0,
  prompt_count    INTEGER DEFAULT 0,
  indexed_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions (cwd, last_ts DESC);

CREATE TABLE IF NOT EXISTS file_activity (
  session_id TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  ts         TEXT,
  PRIMARY KEY (session_id, file_path)
);
CREATE INDEX IF NOT EXISTS idx_activity_file ON file_activity (file_path);

-- Pre-compact working-state snapshots (the rescue wedge).
CREATE TABLE IF NOT EXISTS snapshots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  trigger    TEXT,
  created_at TEXT NOT NULL,
  payload    TEXT NOT NULL          -- JSON: task, decisions, files in flight, next steps
);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS compactions (
  session_id TEXT NOT NULL,
  ts         TEXT NOT NULL,
  trigger    TEXT,
  summary    TEXT
);

-- Full-text recall over digests and summaries.
CREATE VIRTUAL TABLE IF NOT EXISTS recall_fts USING fts5(
  session_id UNINDEXED,
  kind UNINDEXED,                    -- digest | compact_summary | snapshot
  content
);
