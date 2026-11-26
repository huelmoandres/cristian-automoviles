use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;

use super::{clean, fmt_date, non_negative, parse_date, scalar};
use crate::commands::sales::{self, SaleDetail};
use crate::domain::finance;
use crate::domain::status::{Currency, PaymentMethod, SaleStatus};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Payment {
    pub id: i64,
    pub sale_id: i64,
    pub installment_id: i64,
    pub installment_number: i64,
    pub paid_at: String,
    pub amount_cents: i64,
    pub late_fee_cents: i64,
    pub method: PaymentMethod,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PaymentPreview {
    pub installment_id: i64,
    pub sale_id: i64,
    pub number: i64,
    pub due_date: String,
    pub amount_cents: i64,
    pub currency: Currency,
    pub is_late: bool,
    pub days_late: i64,
    pub late_fee_bp: i64,
    pub grace_days: i64,
    pub suggested_late_fee_cents: i64,
}

#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PaymentInput {
    pub installment_id: i64,
    pub paid_at: String,
    /// Recargo a cobrar: por defecto el sugerido, editable para condonar o ajustar.
    pub late_fee_cents: i64,
    pub method: PaymentMethod,
    pub notes: Option<String>,
}

fn map_row(row: &Row) -> rusqlite::Result<Payment> {
    Ok(Payment {
        id: row.get("id")?,
        sale_id: row.get("sale_id")?,
        installment_id: row.get("installment_id")?,
        installment_number: row.get("installment_number")?,
        paid_at: row.get("paid_at")?,
        amount_cents: row.get("amount_cents")?,
        late_fee_cents: row.get("late_fee_cents")?,
        method: row.get("method")?,
        notes: row.get("notes")?,
        created_at: row.get("created_at")?,
    })
}

pub fn list_for_sale(conn: &Connection, sale_id: i64) -> AppResult<Vec<Payment>> {
    let mut stmt = conn.prepare(
        "SELECT p.*, i.number AS installment_number
         FROM payments p JOIN installments i ON i.id = p.installment_id
         WHERE p.sale_id = ?1 ORDER BY p.paid_at DESC, p.id DESC",
    )?;
    let rows = stmt.query_map([sale_id], map_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

struct InstallmentInfo {
    sale_id: i64,
    number: i64,
    due_date: String,
    amount_cents: i64,
    paid: bool,
    sale_status: SaleStatus,
    currency: Currency,
    late_fee_bp: i64,
    grace_days: i64,
}

fn installment_info(conn: &Connection, installment_id: i64) -> AppResult<InstallmentInfo> {
    conn.query_row(
        "SELECT i.sale_id, i.number, i.due_date, i.amount_cents, i.paid_at IS NOT NULL,
                s.status, s.currency, s.late_fee_bp, s.grace_days
         FROM installments i JOIN sales s ON s.id = i.sale_id
         WHERE i.id = ?1",
        [installment_id],
        |r| {
            Ok(InstallmentInfo {
                sale_id: r.get(0)?,
                number: r.get(1)?,
                due_date: r.get(2)?,
                amount_cents: r.get(3)?,
                paid: r.get(4)?,
                sale_status: r.get(5)?,
                currency: r.get(6)?,
                late_fee_bp: r.get(7)?,
                grace_days: r.get(8)?,
            })
        },
    )
    .optional()?
    .ok_or(AppError::NotFound("Cuota"))
}

pub fn preview(conn: &Connection, installment_id: i64, paid_at: &str) -> AppResult<PaymentPreview> {
    let info = installment_info(conn, installment_id)?;
    let pay_date = parse_date(paid_at, "Fecha de pago")?;
    let due = parse_date(&info.due_date, "Vencimiento")?;
    Ok(PaymentPreview {
        installment_id,
        sale_id: info.sale_id,
        number: info.number,
        amount_cents: info.amount_cents,
        currency: info.currency,
        is_late: finance::is_late(due, pay_date, info.grace_days),
        days_late: finance::days_late(due, pay_date),
        late_fee_bp: info.late_fee_bp,
        grace_days: info.grace_days,
        suggested_late_fee_cents: finance::late_fee(
            info.amount_cents,
            info.late_fee_bp,
            due,
            pay_date,
            info.grace_days,
        ),
        due_date: info.due_date,
    })
}

/// Registra el pago completo de una cuota. Si era la última impaga, la venta queda saldada.
pub fn register(conn: &mut Connection, input: PaymentInput) -> AppResult<SaleDetail> {
    let info = installment_info(conn, input.installment_id)?;
    if info.sale_status == SaleStatus::Cancelled {
        return Err(AppError::validation("La venta está anulada"));
    }
    if info.paid {
        return Err(AppError::validation("La cuota ya está paga"));
    }
    let paid_at = fmt_date(parse_date(&input.paid_at, "Fecha de pago")?);
    let late_fee_cents = non_negative(input.late_fee_cents, "El recargo")?;

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO payments (sale_id, installment_id, paid_at, amount_cents, late_fee_cents,
            method, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            info.sale_id,
            input.installment_id,
            paid_at,
            info.amount_cents,
            late_fee_cents,
            input.method,
            clean(input.notes)
        ],
    )?;
    tx.execute(
        "UPDATE installments SET paid_at = ?1, late_fee_cents = ?2, paid_amount_cents = ?3
         WHERE id = ?4",
        params![
            paid_at,
            late_fee_cents,
            info.amount_cents,
            input.installment_id
        ],
    )?;
    let unpaid = scalar(
        &tx,
        "SELECT COUNT(*) FROM installments WHERE sale_id = ?1 AND paid_at IS NULL",
        [info.sale_id],
    )?;
    if unpaid == 0 {
        sales::set_status(&tx, info.sale_id, SaleStatus::Paid)?;
    }
    tx.commit()?;
    sales::detail(conn, info.sale_id)
}

/// Anula un pago (por ejemplo, cargado por error) y deja la cuota impaga otra vez.
pub fn delete(conn: &mut Connection, payment_id: i64) -> AppResult<SaleDetail> {
    let (sale_id, installment_id): (i64, i64) = conn
        .query_row(
            "SELECT sale_id, installment_id FROM payments WHERE id = ?1",
            [payment_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?
        .ok_or(AppError::NotFound("Pago"))?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM payments WHERE id = ?1", [payment_id])?;
    tx.execute(
        "UPDATE installments SET paid_at = NULL, late_fee_cents = 0, paid_amount_cents = 0
         WHERE id = ?1",
        [installment_id],
    )?;
    // Si la venta estaba saldada, vuelve a tener saldo pendiente.
    sales::set_status(&tx, sale_id, SaleStatus::Active)?;
    tx.commit()?;
    sales::detail(conn, sale_id)
}

#[tauri::command(async)]
pub fn preview_payment(
    state: State<'_, AppState>,
    installment_id: i64,
    paid_at: String,
) -> AppResult<PaymentPreview> {
    preview(&*state.authed()?, installment_id, &paid_at)
}

#[tauri::command(async)]
pub fn register_payment(state: State<'_, AppState>, input: PaymentInput) -> AppResult<SaleDetail> {
    register(&mut *state.authed()?, input)
}

#[tauri::command(async)]
pub fn delete_payment(state: State<'_, AppState>, id: i64) -> AppResult<SaleDetail> {
    delete(&mut *state.authed()?, id)
}
