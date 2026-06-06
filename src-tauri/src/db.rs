//! SQLite persistence backed by the `tauri-plugin-sql` plugin.
//!
//! The plugin owns the connection pool (created + migrated at startup via the
//! `preload` entry in `tauri.conf.json`). Commands reach that pool through the
//! plugin's [`DbInstances`] managed state and run `sqlx` queries against it
//! directly, since the plugin's own `execute`/`select` helpers are crate-private.

use sqlx::{Pool, Sqlite};
use tauri::Manager;
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};

use crate::error::{Error, Result};

/// Connection string for the app database. Resolved by the plugin to
/// `<app_config_dir>/meeting_assistant.db` and created on first connect.
pub const DB_URL: &str = "sqlite:meeting_assistant.db";

/// Schema migrations, registered with the plugin builder in `lib.rs`. The plugin
/// runs any not-yet-applied migration when the database is preloaded at startup.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_core_tables",
        sql: "
            CREATE TABLE settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE mail_settings (
                id           INTEGER PRIMARY KEY CHECK (id = 1),
                sender_name  TEXT    NOT NULL DEFAULT '',
                sender_email TEXT    NOT NULL DEFAULT '',
                smtp_host    TEXT    NOT NULL DEFAULT '',
                smtp_port    INTEGER NOT NULL DEFAULT 0,
                username     TEXT    NOT NULL DEFAULT '',
                password     TEXT    NOT NULL DEFAULT '',
                encryption   TEXT    NOT NULL DEFAULT 'none',
                reply_to     TEXT    NOT NULL DEFAULT ''
            );

            CREATE TABLE attachments (
                id         TEXT PRIMARY KEY,
                meeting_id TEXT    NOT NULL,
                file_name  TEXT    NOT NULL,
                path       TEXT    NOT NULL,
                size       INTEGER NOT NULL
            );
        ",
        kind: MigrationKind::Up,
    }]
}

/// Borrow the preloaded SQLite pool from the plugin's managed state. The returned
/// pool is cheaply cloned (it is an `Arc` internally), so callers can hold it
/// without keeping the state lock.
pub async fn pool(app: &tauri::AppHandle) -> Result<Pool<Sqlite>> {
    let instances = app.state::<DbInstances>();
    let guard = instances.0.read().await;
    let db = guard
        .get(DB_URL)
        .ok_or_else(|| Error::Message(format!("database {DB_URL} is not loaded")))?;
    // The crate-private `sqlite()` accessor is commented out in this version, but
    // the `DbPool` enum and its `Sqlite` variant are public, so match directly.
    match db {
        DbPool::Sqlite(pool) => Ok(pool.clone()),
        #[allow(unreachable_patterns)]
        _ => Err(Error::Message("expected a sqlite database".to_string())),
    }
}
