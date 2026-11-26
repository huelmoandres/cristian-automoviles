//! Reglas de negocio de financiación y mora. Funciones puras, sin acceso a la DB.
//!
//! Montos en centavos (`i64`) y porcentajes en puntos básicos (2000 = 20%).

use chrono::{Days, Months, NaiveDate};
use serde::Serialize;
use ts_rs::TS;

/// 100% expresado en puntos básicos.
pub const BP_DENOM: i64 = 10_000;
/// Tope para recargos configurables (1000%), como resguardo ante errores de carga.
pub const MAX_PERCENT_BP: i64 = 10 * BP_DENOM;

/// Aplica un porcentaje (en puntos básicos) a un monto, redondeando al centavo.
pub fn apply_bp(amount_cents: i64, bp: i64) -> i64 {
    let raw = i128::from(amount_cents) * i128::from(bp);
    let denom = i128::from(BP_DENOM);
    ((raw + denom / 2) / denom) as i64
}

/// Total a pagar en cuotas: saldo financiado + recargo del plan.
pub fn total_with_surcharge(financed_cents: i64, surcharge_bp: i64) -> i64 {
    financed_cents + apply_bp(financed_cents, surcharge_bp)
}

/// Vencimiento de la cuota `index` (0 = primera). Se calcula siempre desde la primera
/// fecha para que un 31 no se "corra": 31/01 → 28/02 → 31/03.
pub fn due_date(first_due: NaiveDate, index: u32) -> NaiveDate {
    first_due
        .checked_add_months(Months::new(index))
        .expect("fecha fuera de rango")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScheduleItem {
    pub number: i64,
    pub due_date: NaiveDate,
    pub amount_cents: i64,
}

/// Importe de cada cuota: el total dividido en partes iguales, redondeado a la unidad
/// (sin centavos). La diferencia de redondeo la absorbe la última cuota.
pub fn installment_amount(total_cents: i64, count: i64) -> i64 {
    if count <= 0 {
        return 0;
    }
    (total_cents / count) / 100 * 100
}

/// Divide el total en `count` cuotas iguales (ver [`installment_amount`]);
/// la diferencia de redondeo se suma a la última cuota.
pub fn build_schedule(total_cents: i64, count: u32, first_due: NaiveDate) -> Vec<ScheduleItem> {
    if count == 0 {
        return Vec::new();
    }
    let n = i64::from(count);
    let base = installment_amount(total_cents, n);
    (0..count)
        .map(|i| {
            let is_last = i + 1 == count;
            ScheduleItem {
                number: i64::from(i) + 1,
                due_date: due_date(first_due, i),
                amount_cents: if is_last {
                    total_cents - base * (n - 1)
                } else {
                    base
                },
            }
        })
        .collect()
}

/// Último día en que se puede pagar sin recargo.
pub fn grace_limit(due: NaiveDate, grace_days: i64) -> NaiveDate {
    due.checked_add_days(Days::new(grace_days.max(0) as u64))
        .expect("fecha fuera de rango")
}

pub fn is_late(due: NaiveDate, pay_date: NaiveDate, grace_days: i64) -> bool {
    pay_date > grace_limit(due, grace_days)
}

/// Recargo por mora: % fijo de la cuota, aplicado una sola vez si se paga fuera de término.
pub fn late_fee(
    amount_cents: i64,
    late_fee_bp: i64,
    due: NaiveDate,
    pay_date: NaiveDate,
    grace_days: i64,
) -> i64 {
    if is_late(due, pay_date, grace_days) {
        apply_bp(amount_cents, late_fee_bp)
    } else {
        0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum InstallmentStatus {
    Paid,
    PaidLate,
    Pending,
    Overdue,
}

pub fn installment_status(
    due: NaiveDate,
    paid_at: Option<NaiveDate>,
    today: NaiveDate,
    grace_days: i64,
) -> InstallmentStatus {
    match paid_at {
        Some(paid) if is_late(due, paid, grace_days) => InstallmentStatus::PaidLate,
        Some(_) => InstallmentStatus::Paid,
        None if is_late(due, today, grace_days) => InstallmentStatus::Overdue,
        None => InstallmentStatus::Pending,
    }
}

/// Días de atraso respecto del vencimiento (0 si no está atrasada).
pub fn days_late(due: NaiveDate, date: NaiveDate) -> i64 {
    (date - due).num_days().max(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pesos(amount: i64) -> i64 {
        amount * 100
    }

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn surcharge_is_applied_over_financed_amount() {
        // 1.000.000 al 30% → 1.300.000
        assert_eq!(total_with_surcharge(100_000_000, 3000), 130_000_000);
        assert_eq!(total_with_surcharge(100_000_000, 0), 100_000_000);
    }

    #[test]
    fn apply_bp_rounds_to_nearest_cent() {
        assert_eq!(apply_bp(333, 2000), 67); // 66.6 → 67
        assert_eq!(apply_bp(1, 5000), 1); // 0.5 → 1
    }

    #[test]
    fn schedule_sums_exactly_to_total() {
        let total = 130_000_050; // 1.300.000,50
        let items = build_schedule(total, 12, d("2026-01-10"));
        assert_eq!(items.len(), 12);
        assert_eq!(items.iter().map(|i| i.amount_cents).sum::<i64>(), total);
        // Cuotas sin centavos salvo la última, que absorbe el redondeo
        assert!(items[..11].iter().all(|i| i.amount_cents % 100 == 0));
        assert_eq!(items[0].amount_cents, 10_833_300);
        assert_eq!(items[11].amount_cents, total - 10_833_300 * 11);
    }

    #[test]
    fn schedule_with_zero_installments_is_empty() {
        assert!(build_schedule(1000, 0, d("2026-01-10")).is_empty());
    }

    #[test]
    fn due_dates_clamp_to_end_of_month_without_drifting() {
        let items = build_schedule(pesos(300), 3, d("2026-01-31"));
        let dates: Vec<_> = items.iter().map(|i| i.due_date).collect();
        assert_eq!(
            dates,
            vec![d("2026-01-31"), d("2026-02-28"), d("2026-03-31")]
        );
    }

    #[test]
    fn late_fee_only_after_grace_period() {
        let due = d("2026-03-10");
        assert_eq!(late_fee(100_000, 2000, due, d("2026-03-10"), 0), 0);
        assert_eq!(late_fee(100_000, 2000, due, d("2026-03-11"), 0), 20_000);
        assert_eq!(late_fee(100_000, 2000, due, d("2026-03-15"), 5), 0);
        assert_eq!(late_fee(100_000, 2000, due, d("2026-03-16"), 5), 20_000);
        // Es un recargo único: no crece con más días de atraso
        assert_eq!(late_fee(100_000, 2000, due, d("2026-09-16"), 5), 20_000);
    }

    #[test]
    fn installment_statuses() {
        let due = d("2026-03-10");
        let today = d("2026-03-20");
        use InstallmentStatus::*;
        assert_eq!(
            installment_status(due, Some(d("2026-03-09")), today, 0),
            Paid
        );
        assert_eq!(
            installment_status(due, Some(d("2026-03-12")), today, 0),
            PaidLate
        );
        assert_eq!(
            installment_status(due, Some(d("2026-03-12")), today, 3),
            Paid
        );
        assert_eq!(installment_status(due, None, today, 0), Overdue);
        assert_eq!(installment_status(due, None, today, 15), Pending);
        assert_eq!(installment_status(d("2026-04-10"), None, today, 0), Pending);
    }

    #[test]
    fn days_late_never_negative() {
        assert_eq!(days_late(d("2026-03-10"), d("2026-03-01")), 0);
        assert_eq!(days_late(d("2026-03-10"), d("2026-03-13")), 3);
    }
}
