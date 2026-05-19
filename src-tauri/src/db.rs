//! SQLite persistence: conversations → turns → runs.
//!
//! A *turn* is one user prompt. A *run* is one model's response to that turn —
//! a turn carries several runs when multiple models are raced on one prompt.

use crate::error::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

const SCHEMA_VERSION: i64 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Turn {
    pub id: String,
    pub conversation_id: String,
    pub prompt: String,
    pub created_at: i64,
}

/// One model's response to a turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub id: String,
    pub turn_id: String,
    pub model: String,
    pub content: String,
    pub reasoning: Option<String>,
    /// JSON-encoded `llm::Metrics`.
    pub metrics: Option<String>,
    /// JSON array of `{at_ms, data}` raw SSE frames (capped).
    pub raw: Option<String>,
    pub finish_reason: Option<String>,
    pub error: Option<String>,
    pub status: String, // "ok" | "error"
    pub created_at: i64,
}

/// A turn together with all its runs — the unit the UI renders.
#[derive(Debug, Clone, Serialize)]
pub struct TurnWithRuns {
    pub turn: Turn,
    pub runs: Vec<Run>,
}

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA synchronous = NORMAL;",
        )?;
        let db = Db { conn: Mutex::new(conn) };
        db.migrate()?;
        Ok(db)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.lock();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS settings (
                 key TEXT PRIMARY KEY, value TEXT NOT NULL
             );",
        )?;
        let version: i64 = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'schema_version'",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()?
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        if version < SCHEMA_VERSION {
            // The schema changed fundamentally; drop the old shape and rebuild.
            // Settings (API key, theme, …) are preserved.
            conn.execute_batch(
                "DROP TABLE IF EXISTS messages;
                 DROP TABLE IF EXISTS runs;
                 DROP TABLE IF EXISTS turns;
                 DROP TABLE IF EXISTS conversations;

                 CREATE TABLE conversations (
                     id         TEXT PRIMARY KEY,
                     title      TEXT NOT NULL,
                     created_at INTEGER NOT NULL,
                     updated_at INTEGER NOT NULL
                 );
                 CREATE TABLE turns (
                     id              TEXT PRIMARY KEY,
                     conversation_id TEXT NOT NULL
                                     REFERENCES conversations(id) ON DELETE CASCADE,
                     prompt          TEXT NOT NULL,
                     created_at      INTEGER NOT NULL
                 );
                 CREATE INDEX idx_turns_conv ON turns(conversation_id, created_at);
                 CREATE TABLE runs (
                     id            TEXT PRIMARY KEY,
                     turn_id       TEXT NOT NULL
                                   REFERENCES turns(id) ON DELETE CASCADE,
                     model         TEXT NOT NULL,
                     content       TEXT NOT NULL,
                     reasoning     TEXT,
                     metrics       TEXT,
                     raw           TEXT,
                     finish_reason TEXT,
                     error         TEXT,
                     status        TEXT NOT NULL,
                     created_at    INTEGER NOT NULL
                 );
                 CREATE INDEX idx_runs_turn ON runs(turn_id, created_at);",
            )?;
            conn.execute(
                "INSERT INTO settings(key, value) VALUES('schema_version', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![SCHEMA_VERSION.to_string()],
            )?;
        }
        Ok(())
    }

    // ---- settings ----

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.lock();
        Ok(conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |r| r.get(0),
            )
            .optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.lock().execute(
            "INSERT INTO settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    // ---- conversations ----

    pub fn list_conversations(&self) -> Result<Vec<Conversation>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, title, created_at, updated_at
             FROM conversations ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Conversation {
                id: r.get(0)?,
                title: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn create_conversation(&self, c: &Conversation) -> Result<()> {
        self.lock().execute(
            "INSERT INTO conversations(id, title, created_at, updated_at)
             VALUES(?1, ?2, ?3, ?4)",
            params![c.id, c.title, c.created_at, c.updated_at],
        )?;
        Ok(())
    }

    pub fn rename_conversation(&self, id: &str, title: &str) -> Result<()> {
        self.lock().execute(
            "UPDATE conversations SET title = ?2 WHERE id = ?1",
            params![id, title],
        )?;
        Ok(())
    }

    pub fn touch_conversation(&self, id: &str, updated_at: i64) -> Result<()> {
        self.lock().execute(
            "UPDATE conversations SET updated_at = ?2 WHERE id = ?1",
            params![id, updated_at],
        )?;
        Ok(())
    }

    pub fn delete_conversation(&self, id: &str) -> Result<()> {
        self.lock()
            .execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ---- turns ----

    pub fn create_turn(&self, t: &Turn) -> Result<()> {
        self.lock().execute(
            "INSERT INTO turns(id, conversation_id, prompt, created_at)
             VALUES(?1, ?2, ?3, ?4)",
            params![t.id, t.conversation_id, t.prompt, t.created_at],
        )?;
        Ok(())
    }

    pub fn get_turn(&self, id: &str) -> Result<Option<Turn>> {
        let conn = self.lock();
        Ok(conn
            .query_row(
                "SELECT id, conversation_id, prompt, created_at FROM turns WHERE id = ?1",
                params![id],
                |r| {
                    Ok(Turn {
                        id: r.get(0)?,
                        conversation_id: r.get(1)?,
                        prompt: r.get(2)?,
                        created_at: r.get(3)?,
                    })
                },
            )
            .optional()?)
    }

    pub fn list_turns(&self, conversation_id: &str) -> Result<Vec<Turn>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, prompt, created_at
             FROM turns WHERE conversation_id = ?1 ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![conversation_id], |r| {
            Ok(Turn {
                id: r.get(0)?,
                conversation_id: r.get(1)?,
                prompt: r.get(2)?,
                created_at: r.get(3)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    // ---- runs ----

    pub fn insert_run(&self, r: &Run) -> Result<()> {
        self.lock().execute(
            "INSERT INTO runs
               (id, turn_id, model, content, reasoning, metrics, raw,
                finish_reason, error, status, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                r.id,
                r.turn_id,
                r.model,
                r.content,
                r.reasoning,
                r.metrics,
                r.raw,
                r.finish_reason,
                r.error,
                r.status,
                r.created_at
            ],
        )?;
        Ok(())
    }

    pub fn list_runs(&self, turn_id: &str) -> Result<Vec<Run>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT id, turn_id, model, content, reasoning, metrics, raw,
                    finish_reason, error, status, created_at
             FROM runs WHERE turn_id = ?1 ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![turn_id], |r| {
            Ok(Run {
                id: r.get(0)?,
                turn_id: r.get(1)?,
                model: r.get(2)?,
                content: r.get(3)?,
                reasoning: r.get(4)?,
                metrics: r.get(5)?,
                raw: r.get(6)?,
                finish_reason: r.get(7)?,
                error: r.get(8)?,
                status: r.get(9)?,
                created_at: r.get(10)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    /// All turns of a conversation, each bundled with its runs.
    pub fn get_turns_with_runs(&self, conversation_id: &str) -> Result<Vec<TurnWithRuns>> {
        let turns = self.list_turns(conversation_id)?;
        let mut out = Vec::with_capacity(turns.len());
        for turn in turns {
            let runs = self.list_runs(&turn.id)?;
            out.push(TurnWithRuns { turn, runs });
        }
        Ok(out)
    }
}
