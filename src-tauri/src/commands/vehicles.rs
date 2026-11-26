use std::collections::HashSet;
use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::State;
use ts_rs::TS;

use super::{clean, non_negative, required, scalar};
use crate::domain::status::{Currency, VehicleCondition, VehicleStatus};
use crate::error::{AppError, AppResult};
use crate::media::{self, MediaStore};
use crate::state::AppState;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Vehicle {
    pub id: i64,
    pub brand: String,
    pub model: String,
    pub version: Option<String>,
    pub year: i64,
    pub plate: Option<String>,
    pub vin: Option<String>,
    pub engine_number: Option<String>,
    pub color: Option<String>,
    pub km: i64,
    pub fuel: Option<String>,
    pub transmission: Option<String>,
    pub condition: VehicleCondition,
    pub purchase_price_cents: Option<i64>,
    pub purchase_currency: Option<Currency>,
    pub sale_price_cents: i64,
    pub currency: Currency,
    pub status: VehicleStatus,
    pub notes: Option<String>,
    /// Archivo de la foto de portada (ver `media_dir`).
    pub cover_image: Option<String>,
    /// Miniatura de la portada, para listados.
    pub cover_thumb: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VehicleInput {
    pub brand: String,
    pub model: String,
    pub version: Option<String>,
    pub year: i64,
    pub plate: Option<String>,
    pub vin: Option<String>,
    pub engine_number: Option<String>,
    pub color: Option<String>,
    pub km: i64,
    pub fuel: Option<String>,
    pub transmission: Option<String>,
    pub condition: VehicleCondition,
    pub purchase_price_cents: Option<i64>,
    pub purchase_currency: Option<Currency>,
    pub sale_price_cents: i64,
    pub currency: Currency,
    /// `sold` no se acepta: un vehículo se vende registrando una venta.
    pub status: VehicleStatus,
    pub notes: Option<String>,
    /// Nombre devuelto por `import_vehicle_image`, o `null` sin foto.
    pub cover_image: Option<String>,
}

#[derive(Debug, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VehicleFilter {
    pub search: Option<String>,
    pub status: Option<VehicleStatus>,
}

pub fn map_row(row: &Row) -> rusqlite::Result<Vehicle> {
    let cover_image: Option<String> = row.get("cover_image")?;
    Ok(Vehicle {
        cover_thumb: cover_image.as_deref().map(media::thumb_name),
        cover_image,
        id: row.get("id")?,
        brand: row.get("brand")?,
        model: row.get("model")?,
        version: row.get("version")?,
        year: row.get("year")?,
        plate: row.get("plate")?,
        vin: row.get("vin")?,
        engine_number: row.get("engine_number")?,
        color: row.get("color")?,
        km: row.get("km")?,
        fuel: row.get("fuel")?,
        transmission: row.get("transmission")?,
        condition: row.get("condition")?,
        purchase_price_cents: row.get("purchase_price_cents")?,
        purchase_currency: row.get("purchase_currency")?,
        sale_price_cents: row.get("sale_price_cents")?,
        currency: row.get("currency")?,
        status: row.get("status")?,
        notes: row.get("notes")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// Columnas que necesita [`label_from_row`]; el vehículo debe tener alias `v` en el JOIN.
pub const LABEL_COLUMNS: &str = "v.brand, v.model, v.version, v.year, v.plate";

/// Texto corto para listados: "Toyota Corolla XEi 2020 (AB123CD)".
pub fn label(
    brand: &str,
    model: &str,
    version: Option<&str>,
    year: i64,
    plate: Option<&str>,
) -> String {
    let mut s = format!("{brand} {model}");
    if let Some(v) = version {
        s.push_str(&format!(" {v}"));
    }
    s.push_str(&format!(" {year}"));
    if let Some(p) = plate {
        s.push_str(&format!(" ({p})"));
    }
    s
}

/// Arma la etiqueta desde una fila que incluye [`LABEL_COLUMNS`].
pub fn label_from_row(row: &Row) -> rusqlite::Result<String> {
    Ok(label(
        &row.get::<_, String>("brand")?,
        &row.get::<_, String>("model")?,
        row.get::<_, Option<String>>("version")?.as_deref(),
        row.get("year")?,
        row.get::<_, Option<String>>("plate")?.as_deref(),
    ))
}

const VALID_YEARS: std::ops::RangeInclusive<i64> = 1900..=2100;

struct CleanVehicle {
    brand: String,
    model: String,
    version: Option<String>,
    year: i64,
    plate: Option<String>,
    vin: Option<String>,
    engine_number: Option<String>,
    color: Option<String>,
    km: i64,
    fuel: Option<String>,
    transmission: Option<String>,
    condition: VehicleCondition,
    purchase_price_cents: Option<i64>,
    purchase_currency: Option<Currency>,
    sale_price_cents: i64,
    currency: Currency,
    status: VehicleStatus,
    notes: Option<String>,
    cover_image: Option<String>,
}

fn validate(media: &MediaStore, input: VehicleInput) -> AppResult<CleanVehicle> {
    let cover_image = clean(input.cover_image);
    if let Some(name) = &cover_image {
        if !media.exists(name) {
            return Err(AppError::validation(
                "La foto ya no existe: volvé a cargarla",
            ));
        }
    }
    if !VALID_YEARS.contains(&input.year) {
        return Err(AppError::validation("Año inválido"));
    }
    if input.status == VehicleStatus::Sold {
        return Err(AppError::validation(
            "Un vehículo se marca como vendido al registrar la venta",
        ));
    }
    let purchase_price_cents = match input.purchase_price_cents {
        Some(v) => Some(non_negative(v, "El precio de compra")?),
        None => None,
    };
    // El costo, si se carga, va en su moneda o en la del precio de venta.
    let purchase_currency =
        purchase_price_cents.map(|_| input.purchase_currency.unwrap_or(input.currency));
    Ok(CleanVehicle {
        brand: required(&input.brand, "La marca")?,
        model: required(&input.model, "El modelo")?,
        version: clean(input.version),
        year: input.year,
        plate: clean(input.plate).map(|p| p.to_uppercase().replace(' ', "")),
        vin: clean(input.vin).map(|v| v.to_uppercase()),
        engine_number: clean(input.engine_number),
        color: clean(input.color),
        km: non_negative(input.km, "El kilometraje")?,
        fuel: clean(input.fuel),
        transmission: clean(input.transmission),
        condition: input.condition,
        purchase_price_cents,
        purchase_currency,
        sale_price_cents: non_negative(input.sale_price_cents, "El precio de venta")?,
        currency: input.currency,
        status: input.status,
        notes: clean(input.notes),
        cover_image,
    })
}

pub fn find(conn: &Connection, id: i64) -> AppResult<Vehicle> {
    conn.query_row("SELECT * FROM vehicles WHERE id = ?1", [id], map_row)
        .optional()?
        .ok_or(AppError::NotFound("Vehículo"))
}

pub fn list(conn: &Connection, filter: &VehicleFilter) -> AppResult<Vec<Vehicle>> {
    let search = clean(filter.search.clone());
    let mut stmt = conn.prepare(
        "SELECT * FROM vehicles
         WHERE (?1 IS NULL OR status = ?1)
           AND (?2 IS NULL
                OR matches_search(?2, brand, model, version, plate, color, year))
         ORDER BY brand, model",
    )?;
    let mut vehicles: Vec<Vehicle> = stmt
        .query_map(params![filter.status, search], map_row)?
        .collect::<Result<_, _>>()?;
    vehicles.sort_by_key(|v| v.status.sort_order());
    Ok(vehicles)
}

pub fn create(conn: &Connection, media: &MediaStore, input: VehicleInput) -> AppResult<Vehicle> {
    let v = validate(media, input)?;
    conn.execute(
        "INSERT INTO vehicles (brand, model, version, year, plate, vin, engine_number, color, km,
            fuel, transmission, condition, purchase_price_cents, purchase_currency,
            sale_price_cents, currency, status, notes, cover_image)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
            ?19)",
        params![
            v.brand,
            v.model,
            v.version,
            v.year,
            v.plate,
            v.vin,
            v.engine_number,
            v.color,
            v.km,
            v.fuel,
            v.transmission,
            v.condition,
            v.purchase_price_cents,
            v.purchase_currency,
            v.sale_price_cents,
            v.currency,
            v.status,
            v.notes,
            v.cover_image
        ],
    )?;
    find(conn, conn.last_insert_rowid())
}

pub fn update(
    conn: &Connection,
    media: &MediaStore,
    id: i64,
    input: VehicleInput,
) -> AppResult<Vehicle> {
    let current = find(conn, id)?;
    let v = validate(media, input)?;
    // Un vehículo vendido conserva su estado: se libera anulando la venta.
    let status = if current.status == VehicleStatus::Sold {
        current.status
    } else {
        v.status
    };
    conn.execute(
        "UPDATE vehicles SET brand = ?1, model = ?2, version = ?3, year = ?4, plate = ?5, vin = ?6,
            engine_number = ?7, color = ?8, km = ?9, fuel = ?10, transmission = ?11,
            condition = ?12, purchase_price_cents = ?13, purchase_currency = ?14,
            sale_price_cents = ?15, currency = ?16, status = ?17, notes = ?18,
            cover_image = ?19, updated_at = datetime('now')
         WHERE id = ?20",
        params![
            v.brand,
            v.model,
            v.version,
            v.year,
            v.plate,
            v.vin,
            v.engine_number,
            v.color,
            v.km,
            v.fuel,
            v.transmission,
            v.condition,
            v.purchase_price_cents,
            v.purchase_currency,
            v.sale_price_cents,
            v.currency,
            status,
            v.notes,
            v.cover_image,
            id
        ],
    )?;
    // La foto anterior ya no la usa nadie.
    if let Some(old) = current
        .cover_image
        .filter(|old| v.cover_image.as_ref() != Some(old))
    {
        media.remove(&old);
    }
    find(conn, id)
}

pub fn set_status(conn: &Connection, id: i64, status: VehicleStatus) -> AppResult<()> {
    conn.execute(
        "UPDATE vehicles SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![status, id],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, media: &MediaStore, id: i64) -> AppResult<()> {
    let vehicle = find(conn, id)?;
    if scalar(
        conn,
        "SELECT COUNT(*) FROM sales WHERE vehicle_id = ?1",
        [id],
    )? > 0
    {
        return Err(AppError::validation(
            "No se puede eliminar: el vehículo tiene ventas registradas",
        ));
    }
    conn.execute("DELETE FROM vehicles WHERE id = ?1", [id])?;
    if let Some(cover) = vehicle.cover_image {
        media.remove(&cover);
    }
    Ok(())
}

/// Borra fotos importadas que no quedaron asociadas a ningún vehículo.
pub fn remove_orphan_images(conn: &Connection, media: &MediaStore) -> AppResult<usize> {
    let mut stmt =
        conn.prepare("SELECT cover_image FROM vehicles WHERE cover_image IS NOT NULL")?;
    let referenced: HashSet<String> = stmt
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    media.remove_unreferenced(&referenced)
}

#[tauri::command(async)]
pub fn list_vehicles(state: State<'_, AppState>, filter: VehicleFilter) -> AppResult<Vec<Vehicle>> {
    list(&*state.authed()?, &filter)
}

#[tauri::command(async)]
pub fn get_vehicle(state: State<'_, AppState>, id: i64) -> AppResult<Vehicle> {
    find(&*state.authed()?, id)
}

#[tauri::command(async)]
pub fn create_vehicle(state: State<'_, AppState>, input: VehicleInput) -> AppResult<Vehicle> {
    create(&*state.authed()?, &state.media, input)
}

#[tauri::command(async)]
pub fn update_vehicle(
    state: State<'_, AppState>,
    id: i64,
    input: VehicleInput,
) -> AppResult<Vehicle> {
    update(&*state.authed()?, &state.media, id, input)
}

#[tauri::command(async)]
pub fn delete_vehicle(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&*state.authed()?, &state.media, id)
}

/// Importa la foto elegida por el usuario y devuelve el nombre para `VehicleInput.coverImage`.
#[tauri::command(async)]
pub fn import_vehicle_image(state: State<'_, AppState>, source_path: String) -> AppResult<String> {
    let _conn = state.authed()?;
    state.media.import(Path::new(&source_path))
}

/// Carpeta de las fotos, con separador final, para armar las URLs en el frontend.
#[tauri::command(async)]
pub fn media_dir(state: State<'_, AppState>) -> AppResult<String> {
    state.require_auth()?;
    Ok(format!(
        "{}{}",
        state.media.dir().display(),
        std::path::MAIN_SEPARATOR
    ))
}
