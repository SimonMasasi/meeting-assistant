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
///
/// The SQL for each migration lives in `src-tauri/migrations/` as a `<version>_<description>.sql`
/// file and is embedded here at compile time via `include_str!`.
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_core_tables",
            sql: include_str!("../migrations/0001_create_core_tables.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_recordings_table",
            sql: include_str!("../migrations/0002_create_recordings_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_ai_settings_table",
            sql: include_str!("../migrations/0003_create_ai_settings_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_transcripts_table",
            sql: include_str!("../migrations/0004_create_transcripts_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "create_meeting_summaries_table",
            sql: include_str!("../migrations/0005_create_meeting_summaries_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_meetings_table",
            sql: include_str!("../migrations/0006_create_meetings_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_cloud_session_table",
            sql: include_str!("../migrations/0007_create_cloud_session_table.sql"),
            kind: MigrationKind::Up,
        },
    ]
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
