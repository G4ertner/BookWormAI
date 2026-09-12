CREATE TABLE recommendation_settings (
  user_id TEXT PRIMARY KEY NOT NULL,
  api_key TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX recommendation_settings_expiry ON recommendation_settings(expires_at);
