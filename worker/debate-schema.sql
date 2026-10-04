CREATE TABLE IF NOT EXISTS debates (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  topic TEXT NOT NULL,
  openai_position TEXT NOT NULL,
  gemini_position TEXT NOT NULL,
  -- Storage keeps legacy 9–12-turn records; the API limits new starts to 4–8.
  total_turns INTEGER NOT NULL CHECK(total_turns BETWEEN 4 AND 12),
  turns_json TEXT NOT NULL DEFAULT '[]',
  summary_json TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  turn_count INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS debates_public ON debates(status, created_at DESC);
CREATE TABLE IF NOT EXISTS debate_limits (
  ip TEXT PRIMARY KEY,
  last_attempt INTEGER NOT NULL
);
