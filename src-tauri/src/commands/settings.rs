use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;

use super::{percent_bp, required};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MAX_GRACE_DAYS: i64 = 365;

/// Claves de la tabla `settings` (los valores iniciales están en la migración 001).
mod key {
    pub const LATE_FEE_BP: &str = "late_fee_bp";
    pub const GRACE_DAYS: &str = "grace_days";
    pub const BUSINESS_NAME: &str = "business_name";
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Settings {
    /// Recargo por mora en puntos básicos (2000 = 20%).
    pub late_fee_bp: i64,
    pub grace_days: i64,
    pub business_name: String,
}

pub fn load(conn: &Connection) -> AppResult<Settings> {
    let get = |k: &str| -> AppResult<String> {
        Ok(
            conn.query_row("SELECT value FROM settings WHERE key = ?1", [k], |r| {
                r.get(0)
            })?,
        )
    };
    let int = |k: &str| -> AppResult<i64> {
        get(k)?
            .parse()
            .map_err(|_| AppError::Internal(format!("configuración inválida: {k}")))
    };
    Ok(Settings {
        late_fee_bp: int(key::LATE_FEE_BP)?,
        grace_days: int(key::GRACE_DAYS)?,
        business_name: get(key::BUSINESS_NAME)?,
    })
}

pub fn save(conn: &Connection, input: &Settings) -> AppResult<Settings> {
    percent_bp(input.late_fee_bp, "El recargo por mora")?;
    if !(0..=MAX_GRACE_DAYS).contains(&input.grace_days) {
        return Err(AppError::validation(format!(
            "Los días de gracia deben estar entre 0 y {MAX_GRACE_DAYS}"
        )));
    }
    let name = required(&input.business_name, "El nombre del negocio")?;
    let mut stmt = conn.prepare("UPDATE settings SET value = ?2 WHERE key = ?1")?;
    stmt.execute(params![key::LATE_FEE_BP, input.late_fee_bp.to_string()])?;
    stmt.execute(params![key::GRACE_DAYS, input.grace_days.to_string()])?;
    stmt.execute(params![key::BUSINESS_NAME, name])?;
    load(conn)
}

/// Pública (sin sesión) para mostrar el nombre del negocio en el login.
#[tauri::command(async)]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    load(&*state.conn()?)
}

#[tauri::command(async)]
pub fn update_settings(state: State<'_, AppState>, input: Settings) -> AppResult<Settings> {
    save(&*state.authed()?, &input)
}
