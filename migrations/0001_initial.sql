-- Create spaces table
CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Create space snapshots table for persistence
CREATE TABLE space_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    snapshot_data TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Index for faster snapshot lookups
CREATE INDEX idx_space_snapshots_space_id ON space_snapshots(space_id);
CREATE INDEX idx_space_snapshots_created_at ON space_snapshots(created_at);
