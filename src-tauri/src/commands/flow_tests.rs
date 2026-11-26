//! Flujo completo contra una base SQLite en memoria.

use chrono::Days;

use super::clients::{self, ClientInput};
use super::payments::{self, PaymentInput};
use super::sales::{self, SaleInput};
use super::vehicles::{self, VehicleInput};
use super::{dashboard, fmt_date, plans, today};
use crate::db;
use crate::domain::finance::InstallmentStatus;
use crate::domain::status::{Currency, PaymentMethod, SaleStatus, VehicleCondition, VehicleStatus};
use crate::media::tests::temp_store;

/// Monto en pesos → centavos.
fn pesos(amount: i64) -> i64 {
    amount * 100
}

fn vehicle_input() -> VehicleInput {
    VehicleInput {
        brand: "Toyota".into(),
        model: "Corolla".into(),
        version: Some("XEi".into()),
        year: 2020,
        plate: Some("ab 123 cd".into()),
        vin: None,
        engine_number: None,
        color: Some("Gris".into()),
        km: 45_000,
        fuel: Some("Nafta".into()),
        transmission: Some("Manual".into()),
        condition: VehicleCondition::Used,
        purchase_price_cents: None,
        purchase_currency: None,
        sale_price_cents: pesos(1_000_000),
        currency: Currency::Uyu,
        status: VehicleStatus::Available,
        notes: None,
        cover_image: None,
    }
}

fn client_input(doc: &str) -> ClientInput {
    ClientInput {
        first_name: "Juan".into(),
        last_name: "Pérez".into(),
        document_type: "DNI".into(),
        document_number: doc.into(),
        phone: Some("1155555555".into()),
        email: None,
        address: None,
        city: None,
        notes: None,
    }
}

#[test]
fn sale_payments_and_late_fees() {
    let mut conn = db::open_in_memory().unwrap();
    let vehicle = vehicles::create(&conn, &temp_store(), vehicle_input()).unwrap();
    assert_eq!(vehicle.plate.as_deref(), Some("AB123CD"));
    let client = clients::create(&conn, client_input("30.123.456")).unwrap();
    assert_eq!(client.document_number, "30123456");
    assert!(clients::create(&conn, client_input("30123456")).is_err());

    let plan = plans::list(&conn, false)
        .unwrap()
        .into_iter()
        .find(|p| p.installments == 12)
        .unwrap();
    assert_eq!(plan.surcharge_bp, 3000);

    // Primera cuota hace 40 días: las cuotas 1 y 2 quedan vencidas, la 3 pendiente
    let first_due = today().checked_sub_days(Days::new(40)).unwrap();
    let input = SaleInput {
        client_id: client.id,
        vehicle_id: vehicle.id,
        sale_date: fmt_date(first_due),
        currency: Currency::Uyu,
        price_cents: pesos(1_000_000),
        down_payment_cents: pesos(200_000),
        plan_id: Some(plan.id),
        first_due_date: Some(fmt_date(first_due)),
        late_fee_bp: None,
        notes: None,
    };
    let preview = sales::preview(&conn, &input).unwrap();
    assert_eq!(preview.financed_cents, pesos(800_000));
    assert_eq!(preview.total_financed_cents, pesos(1_040_000));
    assert_eq!(preview.schedule.len(), 12);

    let detail = sales::create(&mut conn, input).unwrap();
    assert_eq!(
        vehicles::find(&conn, vehicle.id).unwrap().status,
        VehicleStatus::Sold
    );
    assert_eq!(detail.sale.balance_cents, pesos(1_040_000));
    assert_eq!(detail.sale.late_fee_bp, 2000);
    assert_eq!(detail.installments[0].status, InstallmentStatus::Overdue);
    assert_eq!(detail.sale.overdue_installments, 2);
    let cuota = detail.installments[0].amount_cents;
    assert_eq!(detail.installments[0].pending_late_fee_cents, cuota / 5);

    // Pago en fecha: sin recargo sugerido
    let inst1 = &detail.installments[0];
    let p = payments::preview(&conn, inst1.id, &inst1.due_date).unwrap();
    assert!(!p.is_late);
    assert_eq!(p.suggested_late_fee_cents, 0);
    payments::register(
        &mut conn,
        PaymentInput {
            installment_id: inst1.id,
            paid_at: inst1.due_date.clone(),
            late_fee_cents: 0,
            method: PaymentMethod::Cash,
            notes: None,
        },
    )
    .unwrap();

    // Pago atrasado: 20% de recargo sugerido
    let inst2 = &detail.installments[1];
    let late_date = fmt_date(
        chrono::NaiveDate::parse_from_str(&inst2.due_date, "%Y-%m-%d")
            .unwrap()
            .checked_add_days(Days::new(3))
            .unwrap(),
    );
    let p = payments::preview(&conn, inst2.id, &late_date).unwrap();
    assert!(p.is_late);
    assert_eq!(p.suggested_late_fee_cents, cuota / 5);
    let after = payments::register(
        &mut conn,
        PaymentInput {
            installment_id: inst2.id,
            paid_at: late_date,
            late_fee_cents: p.suggested_late_fee_cents,
            method: PaymentMethod::Transfer,
            notes: None,
        },
    )
    .unwrap();
    assert_eq!(after.installments[1].status, InstallmentStatus::PaidLate);
    assert_eq!(after.sale.paid_installments, 2);
    assert_eq!(after.sale.paid_cents, pesos(200_000) + cuota * 2);
    assert_eq!(after.sale.late_fees_paid_cents, cuota / 5);
    assert_eq!(after.sale.balance_cents, pesos(1_040_000) - cuota * 2);
    assert_eq!(after.payments.len(), 2);

    // No se puede pagar dos veces la misma cuota
    assert!(payments::register(
        &mut conn,
        PaymentInput {
            installment_id: inst2.id,
            paid_at: fmt_date(today()),
            late_fee_cents: 0,
            method: PaymentMethod::Cash,
            notes: None,
        },
    )
    .is_err());

    let dash = dashboard::build(&conn).unwrap();
    assert_eq!(dash.active_sales, 1);
    assert_eq!(dash.available_vehicles, 0);

    // No se puede anular con pagos; tras anular los pagos, sí.
    assert!(sales::cancel(&mut conn, after.sale.id).is_err());
    for payment in &after.payments {
        payments::delete(&mut conn, payment.id).unwrap();
    }
    let cancelled = sales::cancel(&mut conn, after.sale.id).unwrap();
    assert_eq!(cancelled.sale.status, SaleStatus::Cancelled);
    assert_eq!(
        vehicles::find(&conn, vehicle.id).unwrap().status,
        VehicleStatus::Available
    );
}

#[test]
fn cash_sale_is_paid_immediately() {
    let mut conn = db::open_in_memory().unwrap();
    let vehicle = vehicles::create(&conn, &temp_store(), vehicle_input()).unwrap();
    let client = clients::create(&conn, client_input("20111222")).unwrap();
    let detail = sales::create(
        &mut conn,
        SaleInput {
            client_id: client.id,
            vehicle_id: vehicle.id,
            sale_date: fmt_date(today()),
            currency: Currency::Usd,
            price_cents: pesos(15_000),
            down_payment_cents: 0,
            plan_id: None,
            first_due_date: None,
            late_fee_bp: None,
            notes: None,
        },
    )
    .unwrap();
    assert_eq!(detail.sale.status, SaleStatus::Paid);
    assert!(detail.installments.is_empty());
    assert_eq!(detail.sale.paid_cents, pesos(15_000));
    assert_eq!(detail.sale.balance_cents, 0);
    // El vehículo vendido no puede venderse otra vez
    assert!(sales::preview(
        &conn,
        &SaleInput {
            client_id: client.id,
            vehicle_id: vehicle.id,
            sale_date: fmt_date(today()),
            currency: Currency::Usd,
            price_cents: 1,
            down_payment_cents: 0,
            plan_id: None,
            first_due_date: None,
            late_fee_bp: None,
            notes: None,
        }
    )
    .is_err());
}

#[test]
fn plan_simulation_uses_plan_surcharge() {
    let conn = db::open_in_memory().unwrap();
    let sims = plans::simulate(&conn, pesos(10_000)).unwrap();
    let twelve = sims.iter().find(|s| s.plan.installments == 12).unwrap();
    assert_eq!(twelve.total_cents, pesos(13_000));
    assert_eq!(twelve.installment_cents, pesos(1_083));
}

#[test]
fn plan_name_defaults_to_installments() {
    let conn = db::open_in_memory().unwrap();
    let plan = plans::create(
        &conn,
        plans::PlanInput {
            name: None,
            installments: 36,
            surcharge_bp: 9000,
            active: true,
        },
    )
    .unwrap();
    assert_eq!(plan.name, "36 cuotas");
}

#[test]
fn vehicle_cover_is_validated_and_replaced() {
    let conn = db::open_in_memory().unwrap();
    let media = temp_store();
    let source = media.dir().join("photo.png");
    image::RgbImage::new(10, 10).save(&source).unwrap();

    let mut input = vehicle_input();
    input.cover_image = Some("no-existe.jpg".into());
    assert!(vehicles::create(&conn, &media, input).is_err());

    let first = media.import(&source).unwrap();
    let mut input = vehicle_input();
    input.cover_image = Some(first.clone());
    let vehicle = vehicles::create(&conn, &media, input).unwrap();
    assert_eq!(vehicle.cover_thumb, Some(crate::media::thumb_name(&first)));

    // Reemplazar la portada borra el archivo anterior
    let second = media.import(&source).unwrap();
    let mut input = vehicle_input();
    input.cover_image = Some(second.clone());
    vehicles::update(&conn, &media, vehicle.id, input).unwrap();
    assert!(!media.exists(&first));

    // Eliminar el vehículo borra su foto
    vehicles::delete(&conn, &media, vehicle.id).unwrap();
    assert!(!media.exists(&second));
}

#[test]
fn searches_ignore_accents_and_word_order() {
    let mut conn = db::open_in_memory().unwrap();
    let media = temp_store();
    let vehicle = vehicles::create(&conn, &media, vehicle_input()).unwrap();
    let mut input = client_input("4.680.132-1");
    input.first_name = "Andrés".into();
    input.last_name = "Huelmo".into();
    let client = clients::create(&conn, input).unwrap();
    clients::create(&conn, client_input("1234567")).unwrap();

    assert_eq!(
        clients::list(&conn, Some("huelmo andres".into()))
            .unwrap()
            .len(),
        1
    );
    assert_eq!(clients::list(&conn, Some("perez".into())).unwrap().len(), 1);

    let plan = plans::list(&conn, false).unwrap().remove(0);
    sales::create(
        &mut conn,
        SaleInput {
            client_id: client.id,
            vehicle_id: vehicle.id,
            sale_date: fmt_date(today()),
            currency: Currency::Usd,
            price_cents: pesos(20_000),
            down_payment_cents: pesos(5_000),
            plan_id: Some(plan.id),
            first_due_date: Some(fmt_date(today())),
            late_fee_bp: None,
            notes: None,
        },
    )
    .unwrap();

    // Cobranzas: por nombre sin tilde, por documento y por patente
    let due = |search: &str| {
        super::collections::list(
            &conn,
            &super::collections::DueFilter {
                scope: crate::domain::status::DueScope::Unpaid,
                days: None,
                search: Some(search.into()),
            },
            today(),
        )
        .unwrap()
        .len()
    };
    assert_eq!(due("andres"), plan.installments as usize);
    assert_eq!(due("4680"), plan.installments as usize);
    assert_eq!(due("ab123cd"), plan.installments as usize);
    assert_eq!(due("garcia"), 0);

    let results = super::search::quick_search(&conn, "corolla").unwrap();
    assert_eq!(results.vehicles.len(), 1);
    assert_eq!(results.sales.len(), 1);
    assert!(results.clients.is_empty());
    assert!(super::search::quick_search(&conn, "  ")
        .unwrap()
        .vehicles
        .is_empty());
}
