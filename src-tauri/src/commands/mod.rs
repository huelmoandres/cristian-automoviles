pub mod auth;
pub mod backup;
pub mod clients;
pub mod collections;
pub mod dashboard;
pub mod payments;
pub mod plans;
pub mod sales;
pub mod search;
pub mod settings;
pub mod updates;
pub mod vehicles;

#[cfg(test)]
mod flow_tests;

use chrono::{Local, NaiveDate};

use crate::domain::finance::MAX_PERCENT_BP;
use crate::error::{AppError, AppResult};

pub const DATE_FMT: &str = "%Y-%m-%d";

pub fn today() -> NaiveDate {
    Local::now().date_naive()
}

pub fn parse_date(value: &str, field: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), DATE_FMT)
        .map_err(|_| AppError::validation(format!("{field}: fecha inválida")))
}

pub fn fmt_date(date: NaiveDate) -> String {
    date.format(DATE_FMT).to_string()
}

/// Convierte strings vacíos en `None` y recorta espacios.
pub fn clean(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub fn required(value: &str, field: &str) -> AppResult<String> {
    let v = value.trim();
    if v.is_empty() {
        return Err(AppError::validation(format!("{field} es obligatorio")));
    }
    Ok(v.to_string())
}

pub fn non_negative(value: i64, field: &str) -> AppResult<i64> {
    if value < 0 {
        return Err(AppError::validation(format!(
            "{field} no puede ser negativo"
        )));
    }
    Ok(value)
}

/// Valida un porcentaje en puntos básicos (0% a 1000%).
pub fn percent_bp(value: i64, field: &str) -> AppResult<i64> {
    if !(0..=MAX_PERCENT_BP).contains(&value) {
        return Err(AppError::validation(format!(
            "{field} debe estar entre 0% y {}%",
            MAX_PERCENT_BP / 100
        )));
    }
    Ok(value)
}

/// Ejecuta un `SELECT COUNT(*)` (u otro escalar entero) con parámetros.
pub fn scalar(
    conn: &rusqlite::Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> AppResult<i64> {
    Ok(conn.query_row(sql, params, |r| r.get(0))?)
}
