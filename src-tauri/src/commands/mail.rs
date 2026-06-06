//! Commands for reading and persisting outgoing mail settings.
//!
//! Stored as the single row (`id = 1`) of the `mail_settings` table.

use sqlx::Row;

use crate::db::pool;
use crate::error::Result;
use crate::settings::MailSettings;

/// Return the saved outgoing mail settings, or defaults when none are set.
#[tauri::command]
pub async fn get_mail_settings(app: tauri::AppHandle) -> Result<MailSettings> {
    let pool = pool(&app).await?;
    let row = sqlx::query(
        "SELECT sender_name, sender_email, smtp_host, smtp_port, username,
                password, encryption, reply_to
         FROM mail_settings WHERE id = 1",
    )
    .fetch_optional(&pool)
    .await?;

    Ok(match row {
        Some(r) => MailSettings {
            sender_name: r.get("sender_name"),
            sender_email: r.get("sender_email"),
            smtp_host: r.get("smtp_host"),
            smtp_port: r.get::<i64, _>("smtp_port") as u16,
            username: r.get("username"),
            password: r.get("password"),
            encryption: r.get("encryption"),
            reply_to: r.get("reply_to"),
        },
        None => MailSettings::default(),
    })
}

/// Persist the outgoing mail settings.
#[tauri::command]
pub async fn set_mail_settings(app: tauri::AppHandle, settings: MailSettings) -> Result<()> {
    let pool = pool(&app).await?;
    sqlx::query(
        "INSERT INTO mail_settings
             (id, sender_name, sender_email, smtp_host, smtp_port,
              username, password, encryption, reply_to)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(id) DO UPDATE SET
             sender_name  = excluded.sender_name,
             sender_email = excluded.sender_email,
             smtp_host    = excluded.smtp_host,
             smtp_port    = excluded.smtp_port,
             username     = excluded.username,
             password     = excluded.password,
             encryption   = excluded.encryption,
             reply_to     = excluded.reply_to",
    )
    .bind(settings.sender_name)
    .bind(settings.sender_email)
    .bind(settings.smtp_host)
    .bind(settings.smtp_port as i64)
    .bind(settings.username)
    .bind(settings.password)
    .bind(settings.encryption)
    .bind(settings.reply_to)
    .execute(&pool)
    .await?;
    Ok(())
}
