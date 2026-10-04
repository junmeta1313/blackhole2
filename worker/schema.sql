-- Existing column name retained for compatibility; stores the actual IP address.
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash TEXT PRIMARY KEY,
  last_request INTEGER NOT NULL
);
