use std::collections::BTreeMap;

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use super::{fmt_date, scalar, today};
use crate::commands::collections::{self, DueInstallment};
use crate::domain::status::{Currency, SaleStatus, VehicleStatus};
use crate::error::AppResult;
use crate::state::AppState;

const ATTENTION_LIMIT: usize = 10;
const UPCOMING_DAYS: u64 = 7;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CurrencyTotal {
    pub currency: Currency,
    pub count: i64,
    pub amount_cents: i64,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Dashboard {
    pub overdue: Vec<CurrencyTotal>,
    pub upcoming_week: Vec<CurrencyTotal>,
    /// Cuotas + recargos cobrados en el mes en curso.
    pub collected_month: Vec<CurrencyTotal>,
    pub pending_late_fees: Vec<CurrencyTotal>,
    pub available_vehicles: i64,
    pub active_sales: i64,
    pub clients: i64,
    /// Cuotas vencidas y próximas a vencer, las más urgentes primero.
    pub attention: Vec<DueInstallment>,
}

fn totals(items: impl Iterator<Item = (Currency, i64)>) -> Vec<CurrencyTotal> {
    let mut map: BTreeMap<Currency, (i64, i64)> = BTreeMap::new();
    for (currency, amount) in items {
        let entry = map.entry(currency).or_default();
        entry.0 += 1;
        entry.1 += amount;
    }
    map.into_iter()
        .map(|(currency, (count, amount_cents))| CurrencyTotal {
            currency,
            count,
            amount_cents,
        })
        .collect()
}

pub fn build(conn: &Connection) -> AppResult<Dashboard> {
    let today = today();
    let until = collections::due_until(today, UPCOMING_DAYS);
    let unpaid = collections::unpaid(conn, today)?;
    let overdue: Vec<&DueInstallment> = unpaid
        .iter()
        .filter(|d| collections::is_overdue(d))
        .collect();
    let upcoming: Vec<&DueInstallment> = unpaid
        .iter()
        .filter(|d| collections::is_upcoming(d, &until))
        .collect();

    let mut stmt = conn.prepare(
        "SELECT s.currency, p.amount_cents + p.late_fee_cents
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE strftime('%Y-%m', p.paid_at) = strftime('%Y-%m', ?1)",
    )?;
    let collected: Vec<(Currency, i64)> = stmt
        .query_map([fmt_date(today)], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;

    Ok(Dashboard {
        overdue: totals(
            overdue
                .iter()
                .map(|d| (d.currency, d.installment.amount_cents)),
        ),
        upcoming_week: totals(
            upcoming
                .iter()
                .map(|d| (d.currency, d.installment.amount_cents)),
        ),
        collected_month: totals(collected.into_iter()),
        pending_late_fees: totals(
            overdue
                .iter()
                .map(|d| (d.currency, d.installment.pending_late_fee_cents)),
        ),
        available_vehicles: scalar(
            conn,
            "SELECT COUNT(*) FROM vehicles WHERE status = ?1",
            [VehicleStatus::Available],
        )?,
        active_sales: scalar(
            conn,
            "SELECT COUNT(*) FROM sales WHERE status = ?1",
            [SaleStatus::Active],
        )?,
        clients: scalar(conn, "SELECT COUNT(*) FROM clients", [])?,
        attention: overdue
            .iter()
            .chain(upcoming.iter())
            .take(ATTENTION_LIMIT)
            .map(|d| (*d).clone())
            .collect(),
    })
}

#[tauri::command(async)]
pub fn get_dashboard(state: State<'_, AppState>) -> AppResult<Dashboard> {
    build(&*state.authed()?)
}
