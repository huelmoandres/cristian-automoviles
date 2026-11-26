use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;

use super::{clean, fmt_date, required, scalar, today};
use crate::commands::sales::{self, SaleDetail};
use crate::domain::status::SaleStatus;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Client {
    pub id: i64,
    pub first_name: String,
    pub last_name: String,
    pub document_type: String,
    pub document_number: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ClientListItem {
    #[serde(flatten)]
    pub client: Client,
    pub active_sales: i64,
    pub overdue_installments: i64,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ClientDetail {
    pub client: Client,
    pub sales: Vec<SaleDetail>,
}

#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ClientInput {
    pub first_name: String,
    pub last_name: String,
    pub document_type: String,
    pub document_number: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub notes: Option<String>,
}

pub fn map_row(row: &Row) -> rusqlite::Result<Client> {
    Ok(Client {
        id: row.get("id")?,
        first_name: row.get("first_name")?,
        last_name: row.get("last_name")?,
        document_type: row.get("document_type")?,
        document_number: row.get("document_number")?,
        phone: row.get("phone")?,
        email: row.get("email")?,
        address: row.get("address")?,
        city: row.get("city")?,
        notes: row.get("notes")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn find(conn: &Connection, id: i64) -> AppResult<Client> {
    conn.query_row("SELECT * FROM clients WHERE id = ?1", [id], map_row)
        .optional()?
        .ok_or(AppError::NotFound("Cliente"))
}

pub fn list(conn: &Connection, search: Option<String>) -> AppResult<Vec<ClientListItem>> {
    let search = clean(search);
    let mut stmt = conn.prepare(
        "SELECT c.*,
            (SELECT COUNT(*) FROM sales s WHERE s.client_id = c.id AND s.status = ?3)
                AS active_sales,
            (SELECT COUNT(*) FROM installments i JOIN sales s ON s.id = i.sale_id
              WHERE s.client_id = c.id AND s.status = ?3 AND i.paid_at IS NULL
                AND date(i.due_date, '+' || s.grace_days || ' days') < ?2)
                AS overdue_installments
         FROM clients c
         WHERE ?1 IS NULL
            OR matches_search(?1, c.first_name, c.last_name, c.document_number, c.phone)
         ORDER BY c.last_name, c.first_name",
    )?;
    let rows = stmt.query_map(
        params![search, fmt_date(today()), SaleStatus::Active],
        |r| {
            Ok(ClientListItem {
                client: map_row(r)?,
                active_sales: r.get("active_sales")?,
                overdue_installments: r.get("overdue_installments")?,
            })
        },
    )?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn upsert_params(input: ClientInput) -> AppResult<[Option<String>; 9]> {
    Ok([
        Some(required(&input.first_name, "El nombre")?),
        Some(required(&input.last_name, "El apellido")?),
        Some(required(&input.document_type, "El tipo de documento")?),
        Some(required(&input.document_number, "El número de documento")?.replace(['.', ' '], "")),
        clean(input.phone),
        clean(input.email),
        clean(input.address),
        clean(input.city),
        clean(input.notes),
    ])
}

pub fn create(conn: &Connection, input: ClientInput) -> AppResult<Client> {
    let p = upsert_params(input)?;
    conn.execute(
        "INSERT INTO clients (first_name, last_name, document_type, document_number, phone, email,
            address, city, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params_from_iter(p.iter()),
    )?;
    find(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: ClientInput) -> AppResult<Client> {
    let p = upsert_params(input)?;
    let changed = conn.execute(
        "UPDATE clients SET first_name = ?1, last_name = ?2, document_type = ?3,
            document_number = ?4, phone = ?5, email = ?6, address = ?7, city = ?8, notes = ?9,
            updated_at = datetime('now')
         WHERE id = ?10",
        params![p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound("Cliente"));
    }
    find(conn, id)
}

pub fn delete(conn: &Connection, id: i64) -> AppResult<()> {
    if scalar(
        conn,
        "SELECT COUNT(*) FROM sales WHERE client_id = ?1",
        [id],
    )? > 0
    {
        return Err(AppError::validation(
            "No se puede eliminar: el cliente tiene ventas registradas",
        ));
    }
    if conn.execute("DELETE FROM clients WHERE id = ?1", [id])? == 0 {
        return Err(AppError::NotFound("Cliente"));
    }
    Ok(())
}

pub fn detail(conn: &Connection, id: i64) -> AppResult<ClientDetail> {
    let client = find(conn, id)?;
    let filter = sales::SaleFilter {
        client_id: Some(id),
        ..Default::default()
    };
    let sales = sales::list_ids(conn, &filter)?
        .into_iter()
        .map(|sale_id| sales::detail(conn, sale_id))
        .collect::<AppResult<_>>()?;
    Ok(ClientDetail { client, sales })
}

#[tauri::command(async)]
pub fn list_clients(
    state: State<'_, AppState>,
    search: Option<String>,
) -> AppResult<Vec<ClientListItem>> {
    list(&*state.authed()?, search)
}

#[tauri::command(async)]
pub fn get_client(state: State<'_, AppState>, id: i64) -> AppResult<ClientDetail> {
    detail(&*state.authed()?, id)
}

#[tauri::command(async)]
pub fn create_client(state: State<'_, AppState>, input: ClientInput) -> AppResult<Client> {
    create(&*state.authed()?, input)
}

#[tauri::command(async)]
pub fn update_client(state: State<'_, AppState>, id: i64, input: ClientInput) -> AppResult<Client> {
    update(&*state.authed()?, id, input)
}

#[tauri::command(async)]
pub fn delete_client(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&*state.authed()?, id)
}
