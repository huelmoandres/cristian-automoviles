use rusqlite::Connection;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

use super::clean;
use crate::commands::clients::{self, ClientListItem};
use crate::commands::sales::{self, Sale, SaleFilter};
use crate::commands::vehicles::{self, Vehicle, VehicleFilter};
use crate::error::AppResult;
use crate::state::AppState;

/// Resultados por grupo en la búsqueda rápida.
const RESULTS_PER_GROUP: usize = 5;

#[derive(Debug, Default, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct QuickSearchResults {
    pub clients: Vec<ClientListItem>,
    pub vehicles: Vec<Vehicle>,
    pub sales: Vec<Sale>,
}

/// Búsqueda global (⌘K) sobre clientes, vehículos y ventas.
pub fn quick_search(conn: &Connection, query: &str) -> AppResult<QuickSearchResults> {
    let Some(query) = clean(Some(query.to_string())) else {
        return Ok(QuickSearchResults::default());
    };
    let mut clients = clients::list(conn, Some(query.clone()))?;
    clients.truncate(RESULTS_PER_GROUP);
    let mut vehicles = vehicles::list(
        conn,
        &VehicleFilter {
            search: Some(query.clone()),
            status: None,
        },
    )?;
    vehicles.truncate(RESULTS_PER_GROUP);
    let sales = sales::list_limited(
        conn,
        &SaleFilter {
            search: Some(query),
            ..Default::default()
        },
        RESULTS_PER_GROUP,
    )?;
    Ok(QuickSearchResults {
        clients,
        vehicles,
        sales,
    })
}

#[tauri::command(async)]
pub fn quick_search_all(
    state: State<'_, AppState>,
    query: String,
) -> AppResult<QuickSearchResults> {
    quick_search(&*state.authed()?, &query)
}
