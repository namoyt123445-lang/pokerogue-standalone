CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS saves (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS save_backups (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,revision)
);
CREATE TABLE IF NOT EXISTS daycare_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daycare_requests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  receipt TEXT NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
CREATE TABLE IF NOT EXISTS daycare_battles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  PRIMARY KEY(user_id,event_id)
);
CREATE TABLE IF NOT EXISTS daycare_grants (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  egg_id TEXT NOT NULL,
  record TEXT NOT NULL,
  PRIMARY KEY(user_id,egg_id)
);
CREATE TABLE IF NOT EXISTS transaction_guards (
  id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK(ok=1)
);
