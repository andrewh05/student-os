CREATE TABLE IF NOT EXISTS public.backup_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT,
  folder_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  retention_days INTEGER NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 365),
  connected_at TIMESTAMPTZ,
  last_backup_at TIMESTAMPTZ,
  last_backup_name TEXT,
  last_error TEXT
);
