use chrono::{Days, NaiveDate};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;

use super::{clean, fmt_date, today};
use crate::commands::sales::{map_installment, Installment};
use crate::commands::vehicles;
use crate::domain::finance::InstallmentStatus;
use crate::domain::status::{Currency, DueScope, SaleStatus};
use crate::domain::text;
use crate::error::AppResult;
use crate::state::AppState;

const DEFAULT_UPCOMING_DAYS: u64 = 30;

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DueInstallment {
    #[serde(flatten)]
    pub installment: Installment,
    pub installments_count: i64,
    pub client_id: i64,
    pub client_name: String,
    pub client_document: String,
    pub client_phone: Option<String>,
    pub vehicle_label: String,
    pub currency: Currency,
}

#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct DueFilter {
    pub scope: DueScope,
    /// Para `upcoming`: cuántos días hacia adelante (30 por defecto).
    pub days: Option<i64>,
    /// Cliente (nombre, documento, teléfono) o vehículo (marca, modelo, patente).
    pub search: Option<String>,
}

/// Todas las cuotas impagas de ventas activas, ordenadas por vencimiento.
pub fn unpaid(conn: &Connection, today: NaiveDate) -> AppResult<Vec<DueInstallment>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT i.*, s.late_fee_bp, s.grace_days, s.currency, s.installments_count,
                c.id AS client_id, c.first_name || ' ' || c.last_name AS client_name,
                c.document_number AS client_document, c.phone AS client_phone, {}
         FROM installments i
         JOIN sales s ON s.id = i.sale_id
         JOIN clients c ON c.id = s.client_id
         JOIN vehicles v ON v.id = s.vehicle_id
         WHERE i.paid_at IS NULL AND s.status = ?1
         ORDER BY i.due_date, client_name",
        vehicles::LABEL_COLUMNS
    ))?;
    let rows = stmt.query_map([SaleStatus::Active], |r| {
        Ok(DueInstallment {
            installment: map_installment(r, today)?,
            installments_count: r.get("installments_count")?,
            client_id: r.get("client_id")?,
            client_name: r.get("client_name")?,
            client_document: r.get("client_document")?,
            client_phone: r.get("client_phone")?,
            vehicle_label: vehicles::label_from_row(r)?,
            currency: r.get("currency")?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn list(
    conn: &Connection,
    filter: &DueFilter,
    today: NaiveDate,
) -> AppResult<Vec<DueInstallment>> {
    let days = filter
        .days
        .map_or(DEFAULT_UPCOMING_DAYS, |d| d.max(0) as u64);
    let until = due_until(today, days);
    let search = clean(filter.search.clone()).unwrap_or_default();
    Ok(unpaid(conn, today)?
        .into_iter()
        .filter(|d| match filter.scope {
            DueScope::Overdue => is_overdue(d),
            DueScope::Upcoming => is_upcoming(d, &until),
            DueScope::Unpaid => true,
        })
        .filter(|d| matches_search(d, &search))
        .collect())
}

fn matches_search(d: &DueInstallment, search: &str) -> bool {
    text::matches_all(
        search,
        [
            d.client_name.as_str(),
            d.client_document.as_str(),
            d.client_phone.as_deref().unwrap_or_default(),
            d.vehicle_label.as_str(),
        ],
    )
}

pub fn is_overdue(d: &DueInstallment) -> bool {
    d.installment.status == InstallmentStatus::Overdue
}

/// Pendiente (no vencida) con vencimiento hasta `until` inclusive (fecha ISO).
pub fn is_upcoming(d: &DueInstallment, until: &str) -> bool {
    d.installment.status == InstallmentStatus::Pending && d.installment.due_date.as_str() <= until
}

/// Fecha ISO `days` días después de `today`.
pub fn due_until(today: NaiveDate, days: u64) -> String {
    fmt_date(today.checked_add_days(Days::new(days)).unwrap_or(today))
}

#[tauri::command(async)]
pub fn list_due_installments(
    state: State<'_, AppState>,
    filter: DueFilter,
) -> AppResult<Vec<DueInstallment>> {
    list(&*state.authed()?, &filter, today())
}
