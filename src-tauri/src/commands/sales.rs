use chrono::NaiveDate;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;

use super::{clean, fmt_date, parse_date, percent_bp, scalar, today, DATE_FMT};
use crate::commands::payments::{self, Payment};
use crate::commands::settings;
use crate::commands::{clients, plans, vehicles};
use crate::domain::finance::{self, InstallmentStatus, ScheduleItem};
use crate::domain::status::{Currency, SaleStatus, VehicleStatus};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SaleInput {
    pub client_id: i64,
    pub vehicle_id: i64,
    pub sale_date: String,
    pub currency: Currency,
    pub price_cents: i64,
    pub down_payment_cents: i64,
    /// `null` = venta de contado.
    pub plan_id: Option<i64>,
    pub first_due_date: Option<String>,
    /// `null` = usar el recargo por mora de la configuración.
    pub late_fee_bp: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ScheduleRow {
    pub number: i64,
    pub due_date: String,
    pub amount_cents: i64,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SalePreview {
    pub down_payment_cents: i64,
    pub financed_cents: i64,
    pub surcharge_bp: i64,
    pub surcharge_cents: i64,
    pub total_financed_cents: i64,
    /// Entrega + total financiado.
    pub total_cents: i64,
    pub late_fee_bp: i64,
    pub grace_days: i64,
    pub schedule: Vec<ScheduleRow>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Installment {
    pub id: i64,
    pub sale_id: i64,
    pub number: i64,
    pub due_date: String,
    pub amount_cents: i64,
    pub paid_at: Option<String>,
    /// Recargo efectivamente cobrado.
    pub late_fee_cents: i64,
    pub paid_amount_cents: i64,
    pub status: InstallmentStatus,
    pub days_late: i64,
    /// Recargo que correspondería si se pagara hoy (solo cuotas vencidas impagas).
    pub pending_late_fee_cents: i64,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Sale {
    pub id: i64,
    pub client_id: i64,
    pub client_name: String,
    pub client_document: String,
    pub vehicle_id: i64,
    pub vehicle_label: String,
    pub sale_date: String,
    pub currency: Currency,
    pub price_cents: i64,
    pub down_payment_cents: i64,
    pub financed_cents: i64,
    pub plan_id: Option<i64>,
    pub plan_name: Option<String>,
    pub installments_count: i64,
    pub surcharge_bp: i64,
    pub late_fee_bp: i64,
    pub grace_days: i64,
    pub total_financed_cents: i64,
    pub first_due_date: Option<String>,
    pub status: SaleStatus,
    pub notes: Option<String>,
    pub created_at: String,
    // Totales calculados a partir de las cuotas
    pub paid_installments: i64,
    pub overdue_installments: i64,
    /// Entrega + cuotas pagadas (sin recargos).
    pub paid_cents: i64,
    pub late_fees_paid_cents: i64,
    /// Suma de cuotas impagas.
    pub balance_cents: i64,
    pub overdue_cents: i64,
    pub pending_late_fees_cents: i64,
    pub next_due_date: Option<String>,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SaleDetail {
    pub sale: Sale,
    pub installments: Vec<Installment>,
    pub payments: Vec<Payment>,
}

#[derive(Debug, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SaleFilter {
    pub client_id: Option<i64>,
    pub status: Option<SaleStatus>,
    pub search: Option<String>,
}

/// Datos de la venta ya validados y calculados.
struct Computed {
    sale_date: NaiveDate,
    currency: Currency,
    price_cents: i64,
    down_payment_cents: i64,
    financed_cents: i64,
    plan: Option<plans::FinancingPlan>,
    surcharge_bp: i64,
    total_financed_cents: i64,
    first_due_date: Option<NaiveDate>,
    schedule: Vec<ScheduleItem>,
    late_fee_bp: i64,
    grace_days: i64,
}

fn compute(conn: &Connection, input: &SaleInput) -> AppResult<Computed> {
    clients::find(conn, input.client_id)?;
    let vehicle = vehicles::find(conn, input.vehicle_id)?;
    if vehicle.status == VehicleStatus::Sold {
        return Err(AppError::validation("El vehículo ya está vendido"));
    }
    let config = settings::load(conn)?;
    let currency = input.currency;
    let sale_date = parse_date(&input.sale_date, "Fecha de venta")?;
    if input.price_cents <= 0 {
        return Err(AppError::validation("El precio debe ser mayor a cero"));
    }
    let late_fee_bp = percent_bp(
        input.late_fee_bp.unwrap_or(config.late_fee_bp),
        "El recargo por mora",
    )?;

    let Some(plan_id) = input.plan_id else {
        // Contado: se paga todo en el acto.
        return Ok(Computed {
            sale_date,
            currency,
            price_cents: input.price_cents,
            down_payment_cents: input.price_cents,
            financed_cents: 0,
            plan: None,
            surcharge_bp: 0,
            total_financed_cents: 0,
            first_due_date: None,
            schedule: Vec::new(),
            late_fee_bp,
            grace_days: config.grace_days,
        });
    };

    let plan = plans::find(conn, plan_id)?;
    if !plan.active {
        return Err(AppError::validation(
            "El plan de financiación está inactivo",
        ));
    }
    if !(0..input.price_cents).contains(&input.down_payment_cents) {
        return Err(AppError::validation(
            "La entrega debe ser menor al precio (para pago total elegí contado)",
        ));
    }
    let first_due = parse_date(
        input.first_due_date.as_deref().unwrap_or_default(),
        "Vencimiento de la primera cuota",
    )?;
    let financed_cents = input.price_cents - input.down_payment_cents;
    let total_financed_cents = finance::total_with_surcharge(financed_cents, plan.surcharge_bp);
    let schedule =
        finance::build_schedule(total_financed_cents, plan.installments as u32, first_due);
    Ok(Computed {
        sale_date,
        currency,
        price_cents: input.price_cents,
        down_payment_cents: input.down_payment_cents,
        financed_cents,
        surcharge_bp: plan.surcharge_bp,
        plan: Some(plan),
        total_financed_cents,
        first_due_date: Some(first_due),
        schedule,
        late_fee_bp,
        grace_days: config.grace_days,
    })
}

pub fn preview(conn: &Connection, input: &SaleInput) -> AppResult<SalePreview> {
    let c = compute(conn, input)?;
    Ok(SalePreview {
        down_payment_cents: c.down_payment_cents,
        financed_cents: c.financed_cents,
        surcharge_bp: c.surcharge_bp,
        surcharge_cents: c.total_financed_cents - c.financed_cents,
        total_financed_cents: c.total_financed_cents,
        total_cents: c.down_payment_cents + c.total_financed_cents,
        late_fee_bp: c.late_fee_bp,
        grace_days: c.grace_days,
        schedule: c
            .schedule
            .iter()
            .map(|s| ScheduleRow {
                number: s.number,
                due_date: fmt_date(s.due_date),
                amount_cents: s.amount_cents,
            })
            .collect(),
    })
}

pub fn create(conn: &mut Connection, input: SaleInput) -> AppResult<SaleDetail> {
    let c = compute(conn, &input)?;
    let status = if c.schedule.is_empty() {
        SaleStatus::Paid
    } else {
        SaleStatus::Active
    };
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO sales (client_id, vehicle_id, sale_date, currency, price_cents,
            down_payment_cents, financed_cents, plan_id, plan_name, installments_count,
            surcharge_bp, late_fee_bp, grace_days, total_financed_cents, first_due_date, status,
            notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            input.client_id,
            input.vehicle_id,
            fmt_date(c.sale_date),
            c.currency,
            c.price_cents,
            c.down_payment_cents,
            c.financed_cents,
            c.plan.as_ref().map(|p| p.id),
            c.plan.as_ref().map(|p| p.name.clone()),
            c.schedule.len() as i64,
            c.surcharge_bp,
            c.late_fee_bp,
            c.grace_days,
            c.total_financed_cents,
            c.first_due_date.map(fmt_date),
            status,
            clean(input.notes),
        ],
    )?;
    let sale_id = tx.last_insert_rowid();
    {
        let mut stmt = tx.prepare(
            "INSERT INTO installments (sale_id, number, due_date, amount_cents)
             VALUES (?1, ?2, ?3, ?4)",
        )?;
        for item in &c.schedule {
            stmt.execute(params![
                sale_id,
                item.number,
                fmt_date(item.due_date),
                item.amount_cents
            ])?;
        }
    }
    vehicles::set_status(&tx, input.vehicle_id, VehicleStatus::Sold)?;
    tx.commit()?;
    detail(conn, sale_id)
}

pub fn set_status(conn: &Connection, id: i64, status: SaleStatus) -> AppResult<()> {
    conn.execute(
        "UPDATE sales SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}

/// Anula una venta sin pagos de cuotas y libera el vehículo.
pub fn cancel(conn: &mut Connection, id: i64) -> AppResult<SaleDetail> {
    let (status, vehicle_id): (SaleStatus, i64) = conn
        .query_row(
            "SELECT status, vehicle_id FROM sales WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?
        .ok_or(AppError::NotFound("Venta"))?;
    if status == SaleStatus::Cancelled {
        return Err(AppError::validation("La venta ya está anulada"));
    }
    if scalar(
        conn,
        "SELECT COUNT(*) FROM payments WHERE sale_id = ?1",
        [id],
    )? > 0
    {
        return Err(AppError::validation(
            "La venta tiene cuotas cobradas: anulá esos pagos antes de anular la venta",
        ));
    }
    let tx = conn.transaction()?;
    set_status(&tx, id, SaleStatus::Cancelled)?;
    vehicles::set_status(&tx, vehicle_id, VehicleStatus::Available)?;
    tx.commit()?;
    detail(conn, id)
}

/// Construye la vista de una cuota a partir de una fila con columnas de `installments`
/// más `late_fee_bp` y `grace_days` de la venta.
pub fn map_installment(row: &Row, today: NaiveDate) -> rusqlite::Result<Installment> {
    let due_str: String = row.get("due_date")?;
    let paid_str: Option<String> = row.get("paid_at")?;
    let amount_cents: i64 = row.get("amount_cents")?;
    let late_fee_bp: i64 = row.get("late_fee_bp")?;
    let grace_days: i64 = row.get("grace_days")?;
    let bad_date = |e: chrono::ParseError| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    };
    let due = NaiveDate::parse_from_str(&due_str, DATE_FMT).map_err(bad_date)?;
    let paid = paid_str
        .as_deref()
        .map(|p| NaiveDate::parse_from_str(p, DATE_FMT))
        .transpose()
        .map_err(bad_date)?;
    let status = finance::installment_status(due, paid, today, grace_days);
    let pending_late_fee_cents = if status == InstallmentStatus::Overdue {
        finance::late_fee(amount_cents, late_fee_bp, due, today, grace_days)
    } else {
        0
    };
    Ok(Installment {
        id: row.get("id")?,
        sale_id: row.get("sale_id")?,
        number: row.get("number")?,
        due_date: due_str,
        amount_cents,
        paid_at: paid_str,
        late_fee_cents: row.get("late_fee_cents")?,
        paid_amount_cents: row.get("paid_amount_cents")?,
        status,
        days_late: finance::days_late(due, paid.unwrap_or(today)),
        pending_late_fee_cents,
    })
}

fn installments_for(
    conn: &Connection,
    sale_id: i64,
    today: NaiveDate,
) -> AppResult<Vec<Installment>> {
    let mut stmt = conn.prepare(
        "SELECT i.*, s.late_fee_bp, s.grace_days
         FROM installments i JOIN sales s ON s.id = i.sale_id
         WHERE i.sale_id = ?1 ORDER BY i.number",
    )?;
    let rows = stmt.query_map([sale_id], |r| map_installment(r, today))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn load(conn: &Connection, id: i64, today: NaiveDate) -> AppResult<(Sale, Vec<Installment>)> {
    let installments = installments_for(conn, id, today)?;
    let (paid, unpaid): (Vec<&Installment>, Vec<&Installment>) =
        installments.iter().partition(|i| i.paid_at.is_some());
    let overdue: Vec<&Installment> = unpaid
        .iter()
        .copied()
        .filter(|i| i.status == InstallmentStatus::Overdue)
        .collect();

    let sale = conn
        .query_row(
            &format!(
                "SELECT s.*, c.first_name || ' ' || c.last_name AS client_name,
                    c.document_number AS client_document, {}
                 FROM sales s
                 JOIN clients c ON c.id = s.client_id
                 JOIN vehicles v ON v.id = s.vehicle_id
                 WHERE s.id = ?1",
                vehicles::LABEL_COLUMNS
            ),
            [id],
            |r| {
                let down: i64 = r.get("down_payment_cents")?;
                Ok(Sale {
                    id: r.get("id")?,
                    client_id: r.get("client_id")?,
                    client_name: r.get("client_name")?,
                    client_document: r.get("client_document")?,
                    vehicle_id: r.get("vehicle_id")?,
                    vehicle_label: vehicles::label_from_row(r)?,
                    sale_date: r.get("sale_date")?,
                    currency: r.get("currency")?,
                    price_cents: r.get("price_cents")?,
                    down_payment_cents: down,
                    financed_cents: r.get("financed_cents")?,
                    plan_id: r.get("plan_id")?,
                    plan_name: r.get("plan_name")?,
                    installments_count: r.get("installments_count")?,
                    surcharge_bp: r.get("surcharge_bp")?,
                    late_fee_bp: r.get("late_fee_bp")?,
                    grace_days: r.get("grace_days")?,
                    total_financed_cents: r.get("total_financed_cents")?,
                    first_due_date: r.get("first_due_date")?,
                    status: r.get("status")?,
                    notes: r.get("notes")?,
                    created_at: r.get("created_at")?,
                    paid_installments: paid.len() as i64,
                    overdue_installments: overdue.len() as i64,
                    paid_cents: down + paid.iter().map(|i| i.paid_amount_cents).sum::<i64>(),
                    late_fees_paid_cents: paid.iter().map(|i| i.late_fee_cents).sum(),
                    balance_cents: unpaid.iter().map(|i| i.amount_cents).sum(),
                    overdue_cents: overdue.iter().map(|i| i.amount_cents).sum(),
                    pending_late_fees_cents: overdue.iter().map(|i| i.pending_late_fee_cents).sum(),
                    next_due_date: unpaid.first().map(|i| i.due_date.clone()),
                })
            },
        )
        .optional()?
        .ok_or(AppError::NotFound("Venta"))?;
    Ok((sale, installments))
}

pub fn detail(conn: &Connection, id: i64) -> AppResult<SaleDetail> {
    let (sale, installments) = load(conn, id, today())?;
    let payments = payments::list_for_sale(conn, id)?;
    Ok(SaleDetail {
        sale,
        installments,
        payments,
    })
}

pub fn list_ids(conn: &Connection, filter: &SaleFilter) -> AppResult<Vec<i64>> {
    let search = clean(filter.search.clone());
    let mut stmt = conn.prepare(
        "SELECT s.id FROM sales s
         JOIN clients c ON c.id = s.client_id
         JOIN vehicles v ON v.id = s.vehicle_id
         WHERE (?1 IS NULL OR s.client_id = ?1)
           AND (?2 IS NULL OR s.status = ?2)
           AND (?3 IS NULL OR matches_search(?3, c.first_name, c.last_name,
                c.document_number, v.brand, v.model, v.version, v.plate, v.year))
         ORDER BY s.sale_date DESC, s.id DESC",
    )?;
    let rows = stmt.query_map(params![filter.client_id, filter.status, search], |r| {
        r.get(0)
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn list(conn: &Connection, filter: &SaleFilter) -> AppResult<Vec<Sale>> {
    list_limited(conn, filter, usize::MAX)
}

/// Como [`list`], pero calcula solo las primeras `limit` ventas.
pub fn list_limited(conn: &Connection, filter: &SaleFilter, limit: usize) -> AppResult<Vec<Sale>> {
    let today = today();
    list_ids(conn, filter)?
        .into_iter()
        .take(limit)
        .map(|id| load(conn, id, today).map(|(sale, _)| sale))
        .collect()
}

#[tauri::command(async)]
pub fn preview_sale(state: State<'_, AppState>, input: SaleInput) -> AppResult<SalePreview> {
    preview(&*state.authed()?, &input)
}

#[tauri::command(async)]
pub fn create_sale(state: State<'_, AppState>, input: SaleInput) -> AppResult<SaleDetail> {
    create(&mut *state.authed()?, input)
}

#[tauri::command(async)]
pub fn list_sales(state: State<'_, AppState>, filter: SaleFilter) -> AppResult<Vec<Sale>> {
    list(&*state.authed()?, &filter)
}

#[tauri::command(async)]
pub fn get_sale(state: State<'_, AppState>, id: i64) -> AppResult<SaleDetail> {
    detail(&*state.authed()?, id)
}

#[tauri::command(async)]
pub fn cancel_sale(state: State<'_, AppState>, id: i64) -> AppResult<SaleDetail> {
    cancel(&mut *state.authed()?, id)
}
