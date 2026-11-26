mod commands;
mod db;
mod domain;
mod error;
mod media;
mod state;

use tauri::Manager;

use commands::{
    auth, backup, clients, collections, dashboard, payments, plans, sales, search, settings,
    updates, vehicles,
};
use media::MediaStore;
use state::AppState;

const DB_FILE: &str = "cristian.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if updates::is_configured(app.config().plugins.0.get("updater")) {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join(DB_FILE))?;
            let media = MediaStore::new(dir.join(media::VEHICLE_IMAGES_DIR))?;
            vehicles::remove_orphan_images(&conn, &media)?;
            app.manage(AppState::new(conn, media));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::auth_status,
            auth::setup_user,
            auth::login,
            auth::logout,
            auth::change_password,
            backup::export_backup,
            backup::import_backup,
            updates::updater_status,
            settings::get_settings,
            settings::update_settings,
            vehicles::list_vehicles,
            vehicles::get_vehicle,
            vehicles::create_vehicle,
            vehicles::update_vehicle,
            vehicles::delete_vehicle,
            vehicles::import_vehicle_image,
            vehicles::media_dir,
            clients::list_clients,
            clients::get_client,
            clients::create_client,
            clients::update_client,
            clients::delete_client,
            plans::list_plans,
            plans::create_plan,
            plans::update_plan,
            plans::delete_plan,
            plans::simulate_plans,
            sales::preview_sale,
            sales::create_sale,
            sales::list_sales,
            sales::get_sale,
            sales::cancel_sale,
            payments::preview_payment,
            payments::register_payment,
            payments::delete_payment,
            collections::list_due_installments,
            dashboard::get_dashboard,
            search::quick_search_all,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
