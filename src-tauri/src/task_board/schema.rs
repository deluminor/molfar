use rusqlite::Connection;

pub(crate) fn ensure_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS task_board_cards (
           id TEXT PRIMARY KEY,
           number INTEGER NOT NULL UNIQUE,
           project_cwd TEXT NOT NULL,
           title TEXT NOT NULL,
           description TEXT NOT NULL,
           acceptance_criteria TEXT NOT NULL DEFAULT '',
           column_id TEXT NOT NULL,
           run_state TEXT NOT NULL DEFAULT 'idle',
           position REAL NOT NULL,
           base_ref TEXT,
           base_sha TEXT,
           branch TEXT,
           worktree_path TEXT,
           grill_round INTEGER NOT NULL DEFAULT 0,
           rework_cycle INTEGER NOT NULL DEFAULT 0,
           overrides_json TEXT NOT NULL DEFAULT '{}',
           last_error TEXT,
           delivery_json TEXT,
           archived INTEGER NOT NULL DEFAULT 0,
           queued_at INTEGER,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS task_board_cards_queue_idx
           ON task_board_cards (run_state, queued_at);
         CREATE TABLE IF NOT EXISTS task_board_stage_runs (
           id TEXT PRIMARY KEY,
           card_id TEXT NOT NULL REFERENCES task_board_cards(id) ON DELETE CASCADE,
           stage TEXT NOT NULL,
           attempt INTEGER NOT NULL,
           session_id TEXT,
           harness TEXT NOT NULL,
           model TEXT NOT NULL,
           settings_json TEXT NOT NULL,
           runtime_mode TEXT NOT NULL,
           template_version INTEGER NOT NULL,
           dispatch TEXT NOT NULL,
           status TEXT NOT NULL,
           error TEXT,
           head_before TEXT,
           porcelain_before TEXT,
           fingerprint_before TEXT,
           head_after TEXT,
           started_at INTEGER NOT NULL,
           completed_at INTEGER
         );
         CREATE INDEX IF NOT EXISTS task_board_stage_runs_card_idx
           ON task_board_stage_runs (card_id, started_at);
         CREATE TABLE IF NOT EXISTS task_board_artifacts (
           id TEXT PRIMARY KEY,
           card_id TEXT NOT NULL REFERENCES task_board_cards(id) ON DELETE CASCADE,
           kind TEXT NOT NULL,
           version INTEGER NOT NULL,
           source TEXT NOT NULL,
           stage_run_id TEXT,
           created_at INTEGER NOT NULL,
           UNIQUE (card_id, kind, version)
         );
         CREATE TABLE IF NOT EXISTS task_board_settings (
           id INTEGER PRIMARY KEY CHECK (id = 1),
           json TEXT NOT NULL
         );",
    )
}
