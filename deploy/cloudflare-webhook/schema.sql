CREATE TABLE IF NOT EXISTS webhook_inbox (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  body TEXT NOT NULL
);
