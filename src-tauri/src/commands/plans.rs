use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;

use super::{clean, non_negative, percent_bp, scalar};
use crate::domain::finance;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FinancingPlan {
    pub id: i64,
    pub name: String,
    pub installments: i64,
    /// Recargo sobre el saldo financiado, en puntos básicos (3000 = 30%).
    pub surcharge_bp: i64,
    pub active: bool,
}

#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlanInput {
    /// `null` = se nombra según la cantidad de cuotas ("12 cuotas").
    pub name: Option<String>,
    pub installments: i64,
    pub surcharge_bp: i64,
    pub active: bool,
}

fn map_row(row: &Row) -> rusqlite::Result<FinancingPlan> {
    Ok(FinancingPlan {
        id: row.get("id")?,
        name: row.get("name")?,
        installments: row.get("installments")?,
        surcharge_bp: row.get("surcharge_bp")?,
        active: row.get("active")?,
    })
}

pub fn find(conn: &Connection, id: i64) -> AppResult<FinancingPlan> {
    conn.query_row("SELECT * FROM financing_plans WHERE id = ?1", [id], map_row)
        .optional()?
        .ok_or(AppError::NotFound("Plan"))
}

pub fn list(conn: &Connection, include_inactive: bool) -> AppResult<Vec<FinancingPlan>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM financing_plans WHERE ?1 OR active = 1 ORDER BY installments, name",
    )?;
    let rows = stmt.query_map([include_inactive], map_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

const MAX_INSTALLMENTS: i64 = 240;

fn validate(input: &PlanInput) -> AppResult<String> {
    if !(1..=MAX_INSTALLMENTS).contains(&input.installments) {
        return Err(AppError::validation(format!(
            "La cantidad de cuotas debe estar entre 1 y {MAX_INSTALLMENTS}"
        )));
    }
    percent_bp(input.surcharge_bp, "El recargo")?;
    Ok(clean(input.name.clone()).unwrap_or_else(|| format!("{} cuotas", input.installments)))
}

pub fn create(conn: &Connection, input: PlanInput) -> AppResult<FinancingPlan> {
    let name = validate(&input)?;
    conn.execute(
        "INSERT INTO financing_plans (name, installments, surcharge_bp, active)
         VALUES (?1, ?2, ?3, ?4)",
        params![name, input.installments, input.surcharge_bp, input.active],
    )?;
    find(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: PlanInput) -> AppResult<FinancingPlan> {
    let name = validate(&input)?;
    let changed = conn.execute(
        "UPDATE financing_plans SET name = ?1, installments = ?2, surcharge_bp = ?3, active = ?4
         WHERE id = ?5",
        params![
            name,
            input.installments,
            input.surcharge_bp,
            input.active,
            id
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("Plan"));
    }
    find(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    if scalar(conn, "SELECT COUNT(*) FROM sales WHERE plan_id = ?1", [id])? > 0 {
        return Err(AppError::validation(
            "El plan está usado en ventas: desactivalo en lugar de eliminarlo",
        ));
    }
    if conn.execute("DELETE FROM financing_plans WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound("Plan"));
    }
    Ok(())
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlanSimulation {
    pub plan: FinancingPlan,
    pub surcharge_cents: i64,
    pub total_cents: i64,
    /// Importe de cada cuota (la última puede diferir por redondeo).
    pub installment_cents: i64,
}

/// Cuánto quedaría en cada plan activo financiando `financed_cents`.
pub fn simulate(conn: &Connection, financed_cents: i64) -> AppResult<Vec<PlanSimulation>> {
    let financed_cents = non_negative(financed_cents, "El monto")?;
    Ok(list(conn, false)?
        .into_iter()
        .map(|plan| {
            let total_cents = finance::total_with_surcharge(financed_cents, plan.surcharge_bp);
            let installment_cents = finance::installment_amount(total_cents, plan.installments);
            PlanSimulation {
                surcharge_cents: total_cents - financed_cents,
                total_cents,
                installment_cents,
                plan,
            }
        })
        .collect())
}

#[tauri::command(async)]
pub fn simulate_plans(
    state: State<'_, AppState>,
    financed_cents: i64,
) -> AppResult<Vec<PlanSimulation>> {
    simulate(&*state.authed()?, financed_cents)
}

#[tauri::command(async)]
pub fn list_plans(
    state: State<'_, AppState>,
    include_inactive: bool,
) -> AppResult<Vec<FinancingPlan>> {
    list(&*state.authed()?, include_inactive)
}

#[tauri::command(async)]
pub fn create_plan(state: State<'_, AppState>, input: PlanInput) -> AppResult<FinancingPlan> {
    create(&*state.authed()?, input)
}

#[tauri::command(async)]
pub fn update_plan(
    state: State<'_, AppState>,
    id: i64,
    input: PlanInput,
) -> AppResult<FinancingPlan> {
    update(&*state.authed()?, id, input)
}

#[tauri::command(async)]
pub fn delete_plan(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&*state.authed()?, id)
}
