use argon2::{
    password_hash::{phc::PasswordHash, PasswordHasher, PasswordVerifier},
    Argon2,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::state::{AppState, Session};

const MIN_PASSWORD_LEN: usize = 6;

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AuthStatus {
    pub has_user: bool,
    pub username: Option<String>,
}

fn hash_password(password: &str) -> AppResult<String> {
    Argon2::default()
        .hash_password(password.as_bytes())
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(format!("hash: {e}")))
}

fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

fn validate_password(password: &str) -> AppResult<()> {
    if password.chars().count() < MIN_PASSWORD_LEN {
        return Err(AppError::validation(format!(
            "La contraseña debe tener al menos {MIN_PASSWORD_LEN} caracteres"
        )));
    }
    Ok(())
}

fn user_count(conn: &Connection) -> AppResult<i64> {
    Ok(conn.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))?)
}

#[tauri::command(async)]
pub fn auth_status(state: State<'_, AppState>) -> AppResult<AuthStatus> {
    let conn = state.conn()?;
    let has_user = user_count(&conn)? > 0;
    let username = state.session()?.as_ref().map(|s| s.username.clone());
    Ok(AuthStatus { has_user, username })
}

/// Crea el único usuario del sistema (solo si todavía no existe ninguno).
#[tauri::command(async)]
pub fn setup_user(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> AppResult<AuthStatus> {
    let username = crate::commands::required(&username, "El usuario")?;
    validate_password(&password)?;
    let conn = state.conn()?;
    if user_count(&conn)? > 0 {
        return Err(AppError::validation("El usuario ya fue creado"));
    }
    conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?1, ?2)",
        params![username, hash_password(&password)?],
    )?;
    let user_id = conn.last_insert_rowid();
    *state.session()? = Some(Session {
        user_id,
        username: username.clone(),
    });
    Ok(AuthStatus {
        has_user: true,
        username: Some(username),
    })
}

#[tauri::command(async)]
pub fn login(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> AppResult<AuthStatus> {
    let conn = state.conn()?;
    let row: Option<(i64, String, String)> = conn
        .query_row(
            "SELECT id, username, password_hash FROM users WHERE username = ?1",
            [username.trim()],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    match row {
        Some((user_id, username, hash)) if verify_password(&password, &hash) => {
            *state.session()? = Some(Session {
                user_id,
                username: username.clone(),
            });
            Ok(AuthStatus {
                has_user: true,
                username: Some(username),
            })
        }
        _ => Err(AppError::validation("Usuario o contraseña incorrectos")),
    }
}

#[tauri::command(async)]
pub fn logout(state: State<'_, AppState>) -> AppResult<()> {
    *state.session()? = None;
    Ok(())
}

#[tauri::command(async)]
pub fn change_password(
    state: State<'_, AppState>,
    current: String,
    new_password: String,
) -> AppResult<()> {
    let conn = state.conn()?;
    let user_id = state
        .session()?
        .as_ref()
        .map(|s| s.user_id)
        .ok_or(AppError::Unauthorized)?;
    validate_password(&new_password)?;
    let hash: String = conn.query_row(
        "SELECT password_hash FROM users WHERE id = ?1",
        [user_id],
        |r| r.get(0),
    )?;
    if !verify_password(&current, &hash) {
        return Err(AppError::validation("La contraseña actual es incorrecta"));
    }
    conn.execute(
        "UPDATE users SET password_hash = ?1 WHERE id = ?2",
        params![hash_password(&new_password)?, user_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_roundtrip() {
        let hash = hash_password("secreto123").unwrap();
        assert!(verify_password("secreto123", &hash));
        assert!(!verify_password("otra", &hash));
        assert!(!verify_password("secreto123", "no-es-un-hash"));
    }
}
