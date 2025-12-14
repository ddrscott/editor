-- Create spaces table for global queries
CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    reads INTEGER NOT NULL DEFAULT 0,
    writes INTEGER NOT NULL DEFAULT 0
);

-- Index for sorting by activity
CREATE INDEX IF NOT EXISTS idx_spaces_updated_at ON spaces(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_spaces_created_at ON spaces(created_at DESC);
