use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use argon2::password_hash::phc::PasswordHash;
use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;
use tempfile::{NamedTempFile, TempDir};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db;
use crate::error::{AppError, AppResult};
use crate::media::{self, MediaStore};
use crate::state::AppState;

const APP_ID: &str = "com.cristianautomoviles.app";
const FORMAT_VERSION: u32 = 1;
const DB_FILE: &str = "cristian.db";
const MANIFEST_FILE: &str = "manifest.json";
const MAX_ENTRIES: usize = 100_002;
const MAX_MANIFEST_BYTES: u64 = 16 * 1024;
const MAX_DB_BYTES: u64 = 512 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 8 * 1024 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    application: String,
    format_version: u32,
    app_version: String,
    schema_version: i64,
    created_at: String,
}

fn io_error(error: io::Error) -> AppError {
    AppError::Internal(format!(
        "No se pudo acceder al archivo de respaldo: {error}"
    ))
}

fn archive_error(error: impl std::fmt::Display) -> AppError {
    AppError::validation(format!("No se pudo leer o crear el respaldo: {error}"))
}

fn referenced_images(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT cover_image FROM vehicles WHERE cover_image IS NOT NULL ORDER BY cover_image",
    )?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    for name in &names {
        if !media::is_safe_name(name) || !name.ends_with(".jpg") || name.len() > 180 {
            return Err(AppError::validation(
                "El respaldo contiene un nombre de foto inválido",
            ));
        }
    }
    Ok(names)
}

fn image_files(covers: &[String]) -> HashSet<String> {
    covers
        .iter()
        .flat_map(|cover| [cover.clone(), media::thumb_name(cover)])
        .collect()
}

fn ensure_destination(destination: &Path, media: &MediaStore) -> AppResult<PathBuf> {
    if !destination
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        return Err(AppError::validation(
            "El respaldo debe guardarse con extensión .zip",
        ));
    }
    let parent = destination
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let parent = parent.canonicalize().map_err(io_error)?;
    if parent.starts_with(media.dir().canonicalize().map_err(io_error)?) {
        return Err(AppError::validation(
            "Elegí una carpeta fuera de las fotos de vehículos",
        ));
    }
    let name = destination
        .file_name()
        .ok_or_else(|| AppError::validation("Ruta de respaldo inválida"))?;
    Ok(parent.join(name))
}

fn add_file(writer: &mut ZipWriter<File>, name: &str, source: &Path, limit: u64) -> AppResult<u64> {
    let metadata = fs::symlink_metadata(source).map_err(io_error)?;
    if !metadata.is_file() || metadata.len() > limit {
        return Err(AppError::validation(format!(
            "El archivo {name} no es válido o supera el tamaño permitido"
        )));
    }
    writer
        .start_file(
            name,
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(archive_error)?;
    let mut file = File::open(source).map_err(io_error)?;
    let copied = io::copy(&mut file, writer).map_err(io_error)?;
    if copied != metadata.len() {
        return Err(AppError::validation(
            "Una foto cambió mientras se creaba el respaldo. Intentá nuevamente.",
        ));
    }
    Ok(copied)
}

/// SQLite's backup API includes committed WAL pages while the application lock keeps photos stable.
fn export_snapshot(conn: &Connection, media: &MediaStore, destination: &Path) -> AppResult<()> {
    let destination = ensure_destination(destination, media)?;
    let staging = TempDir::new().map_err(io_error)?;
    let snapshot = staging.path().join(DB_FILE);
    conn.backup("main", &snapshot, None)?;
    let snapshot_conn = Connection::open(&snapshot)?;
    let covers = referenced_images(&snapshot_conn)?;
    let files = image_files(&covers);
    if files.len() + 2 > MAX_ENTRIES {
        return Err(AppError::validation(
            "El respaldo supera la cantidad de fotos permitida",
        ));
    }
    let schema_version =
        snapshot_conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let manifest = Manifest {
        application: APP_ID.into(),
        format_version: FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").into(),
        schema_version,
        created_at: Utc::now().to_rfc3339(),
    };
    let output = NamedTempFile::new_in(destination.parent().unwrap()).map_err(io_error)?;
    let mut writer = ZipWriter::new(output.as_file().try_clone().map_err(io_error)?);
    writer
        .start_file(MANIFEST_FILE, SimpleFileOptions::default())
        .map_err(archive_error)?;
    writer
        .write_all(&serde_json::to_vec_pretty(&manifest).map_err(archive_error)?)
        .map_err(io_error)?;
    let mut total = add_file(&mut writer, DB_FILE, &snapshot, MAX_DB_BYTES)?;
    let mut files: Vec<_> = files.into_iter().collect();
    files.sort();
    for name in files {
        total += add_file(
            &mut writer,
            &format!("{}/{name}", media::VEHICLE_IMAGES_DIR),
            &media.dir().join(&name),
            MAX_IMAGE_BYTES,
        )?;
        if total > MAX_TOTAL_BYTES {
            return Err(AppError::validation(
                "El respaldo supera los 8 GB permitidos",
            ));
        }
    }
    writer
        .finish()
        .map_err(archive_error)?
        .sync_all()
        .map_err(io_error)?;
    output.persist(destination).map_err(|e| io_error(e.error))?;
    Ok(())
}

struct StagedBackup {
    conn: Connection,
    staging: TempDir,
    covers: Vec<String>,
}

// ZipArchive indexes by name, so inspect the central directory before duplicate names are hidden.
fn reject_duplicate_entries(source: &Path, offset: u64, expected_count: usize) -> AppResult<()> {
    let mut input = File::open(source).map_err(io_error)?;
    input.seek(SeekFrom::Start(offset)).map_err(io_error)?;
    let mut names = HashSet::new();
    let mut portable_names = HashSet::new();
    loop {
        let mut signature = [0; 4];
        input.read_exact(&mut signature).map_err(archive_error)?;
        if signature != [0x50, 0x4b, 0x01, 0x02] {
            break;
        }
        let mut header = [0; 42];
        input.read_exact(&mut header).map_err(archive_error)?;
        let name_len = u16::from_le_bytes([header[24], header[25]]) as usize;
        let extra_len = u16::from_le_bytes([header[26], header[27]]) as i64;
        let comment_len = u16::from_le_bytes([header[28], header[29]]) as i64;
        if name_len > 512 || names.len() >= MAX_ENTRIES {
            return Err(AppError::validation(
                "El respaldo contiene demasiados archivos o nombres inválidos",
            ));
        }
        let mut name = vec![0; name_len];
        input.read_exact(&mut name).map_err(archive_error)?;
        let portable_name = name.iter().map(u8::to_ascii_lowercase).collect::<Vec<_>>();
        if !names.insert(name) || !portable_names.insert(portable_name) {
            return Err(AppError::validation(
                "El respaldo contiene archivos duplicados",
            ));
        }
        input
            .seek(SeekFrom::Current(extra_len + comment_len))
            .map_err(io_error)?;
    }
    if names.len() != expected_count {
        return Err(AppError::validation(
            "El índice del respaldo está incompleto",
        ));
    }
    Ok(())
}

fn stage_backup(source: &Path) -> AppResult<StagedBackup> {
    let mut archive =
        ZipArchive::new(File::open(source).map_err(io_error)?).map_err(archive_error)?;
    if archive.len() > MAX_ENTRIES {
        return Err(AppError::validation(
            "El respaldo contiene demasiados archivos",
        ));
    }
    reject_duplicate_entries(source, archive.central_directory_start(), archive.len())?;
    let staging = TempDir::new().map_err(io_error)?;
    fs::create_dir(staging.path().join(media::VEHICLE_IMAGES_DIR)).map_err(io_error)?;
    let mut names = HashSet::new();
    let mut total = 0u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(archive_error)?;
        let name = entry.name().to_owned();
        let image_name = name.strip_prefix("vehicle-images/");
        let valid_image = image_name.is_some_and(|name| {
            media::is_safe_name(name) && name.ends_with(".jpg") && name.len() <= 190
        });
        let limit = if name == MANIFEST_FILE {
            MAX_MANIFEST_BYTES
        } else if name == DB_FILE {
            MAX_DB_BYTES
        } else if valid_image {
            MAX_IMAGE_BYTES
        } else {
            return Err(AppError::validation(
                "El respaldo contiene una ruta o archivo no permitido",
            ));
        };
        if !entry.is_file() || entry.enclosed_name().is_none() || !names.insert(name.clone()) {
            return Err(AppError::validation(
                "El respaldo contiene rutas inseguras o archivos duplicados",
            ));
        }
        if entry.size() > limit
            || total
                .checked_add(entry.size())
                .is_none_or(|size| size > MAX_TOTAL_BYTES)
        {
            return Err(AppError::validation(
                "El respaldo supera el tamaño permitido",
            ));
        }
        total += entry.size();
        let expected_size = entry.size();
        let mut file = File::create(staging.path().join(&name)).map_err(io_error)?;
        let copied =
            io::copy(&mut entry.by_ref().take(limit + 1), &mut file).map_err(archive_error)?;
        if copied != expected_size || copied > limit {
            return Err(AppError::validation(
                "El respaldo contiene un archivo incompleto o demasiado grande",
            ));
        }
    }
    let manifest: Manifest =
        serde_json::from_slice(&fs::read(staging.path().join(MANIFEST_FILE)).map_err(io_error)?)
            .map_err(archive_error)?;
    if manifest.application != APP_ID || manifest.format_version != FORMAT_VERSION {
        return Err(AppError::validation(
            "Este archivo no es un respaldo compatible de Cristian Automóviles",
        ));
    }
    let conn = db::open_backup(&staging.path().join(DB_FILE), manifest.schema_version)?;
    validate_user(&conn)?;
    let covers = referenced_images(&conn)?;
    let expected: HashSet<_> = image_files(&covers)
        .into_iter()
        .map(|name| format!("{}/{name}", media::VEHICLE_IMAGES_DIR))
        .chain([MANIFEST_FILE.to_string(), DB_FILE.to_string()])
        .collect();
    if names != expected {
        return Err(AppError::validation(
            "El respaldo tiene fotos faltantes o archivos inesperados",
        ));
    }
    Ok(StagedBackup {
        staging,
        conn,
        covers,
    })
}

fn validate_user(conn: &Connection) -> AppResult<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
    if count != 1 {
        return Err(AppError::validation(
            "El respaldo debe contener el usuario de acceso del sistema",
        ));
    }
    let (username, hash): (String, String) =
        conn.query_row("SELECT username, password_hash FROM users", [], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;
    let valid_hash = PasswordHash::new(&hash).is_ok_and(|parsed| {
        argon2::Algorithm::try_from(parsed.algorithm.as_str()).is_ok()
            && parsed
                .version
                .is_none_or(|version| argon2::Version::try_from(version).is_ok())
            && argon2::Params::try_from(&parsed).is_ok()
            && parsed.salt.is_some()
            && parsed.hash.is_some()
    });
    if username.trim().is_empty() || !valid_hash {
        return Err(AppError::validation(
            "El usuario o la contraseña del respaldo no son válidos",
        ));
    }
    Ok(())
}

fn may_import(state: &AppState, conn: &Connection) -> AppResult<bool> {
    let has_user: bool =
        conn.query_row("SELECT EXISTS(SELECT 1 FROM users)", [], |row| row.get(0))?;
    if has_user {
        state.require_auth()?;
    }
    Ok(has_user)
}

/// New image names preserve the current database's photos until SQLite commits the restore.
fn install_staged(
    conn: &mut Connection,
    media: &MediaStore,
    backup: &mut StagedBackup,
) -> AppResult<()> {
    let prefix = format!(
        "restore_{}_{}",
        std::process::id(),
        Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let mut copied = Vec::new();
    let result = (|| {
        let tx = backup.conn.transaction()?;
        for (index, cover) in backup.covers.iter().enumerate() {
            let replacement = format!("{prefix}_{index}.jpg");
            for (old, new) in [
                (cover.clone(), replacement.clone()),
                (media::thumb_name(cover), media::thumb_name(&replacement)),
            ] {
                let source = backup
                    .staging
                    .path()
                    .join(media::VEHICLE_IMAGES_DIR)
                    .join(old);
                let destination = media.dir().join(new);
                let mut output = fs::OpenOptions::new()
                    .create_new(true)
                    .write(true)
                    .open(&destination)
                    .map_err(io_error)?;
                copied.push(destination);
                io::copy(&mut File::open(source).map_err(io_error)?, &mut output)
                    .map_err(io_error)?;
                output.sync_all().map_err(io_error)?;
            }
            tx.execute(
                "UPDATE vehicles SET cover_image = ?1 WHERE cover_image = ?2",
                [&replacement, cover],
            )?;
        }
        tx.commit()?;
        // A new snapshot includes staged migrations and photo name changes, regardless of its WAL mode.
        let ready = backup.staging.path().join("ready.db");
        backup.conn.backup("main", &ready, None)?;
        conn.restore("main", ready, None::<fn(rusqlite::backup::Progress)>)?;
        Ok(())
    })();
    if result.is_err() {
        for path in copied {
            let _ = fs::remove_file(path);
        }
    }
    result
}

pub fn export(state: &AppState, destination: &Path) -> AppResult<()> {
    let conn = state.authed()?;
    export_snapshot(&conn, &state.media, destination)
}

pub fn import(state: &AppState, source: &Path) -> AppResult<Option<String>> {
    // Check before expensive decompression, and again after obtaining the replacement lock.
    may_import(state, &*state.conn()?)?;
    let mut backup = stage_backup(source)?;
    let mut conn = state.conn()?;
    let had_user = may_import(state, &conn)?;
    let previous = if had_user {
        let directory = state
            .media
            .dir()
            .parent()
            .ok_or_else(|| AppError::Internal("Carpeta de datos inválida".into()))?
            .join("recovery-backups");
        fs::create_dir_all(&directory).map_err(io_error)?;
        let path = directory.join(format!(
            "antes-de-importar-{}.zip",
            Utc::now().format("%Y%m%d-%H%M%S-%f")
        ));
        export_snapshot(&conn, &state.media, &path)?;
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    };
    install_staged(&mut conn, &state.media, &mut backup)?;
    *state.session()? = None;
    Ok(previous)
}

#[tauri::command(async)]
pub fn export_backup(state: State<'_, AppState>, destination_path: String) -> AppResult<()> {
    export(&state, Path::new(&destination_path))
}

#[tauri::command(async)]
pub fn import_backup(state: State<'_, AppState>, source_path: String) -> AppResult<Option<String>> {
    import(&state, Path::new(&source_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::Session;
    use argon2::{Argon2, PasswordHasher};

    fn state(directory: &Path) -> AppState {
        fs::create_dir_all(directory).unwrap();
        AppState::new(
            db::open(&directory.join(DB_FILE)).unwrap(),
            MediaStore::new(directory.join(media::VEHICLE_IMAGES_DIR)).unwrap(),
        )
    }

    fn add_user(conn: &Connection, username: &str) {
        let hash = Argon2::default()
            .hash_password(b"secret123")
            .unwrap()
            .to_string();
        conn.execute(
            "INSERT INTO users(username, password_hash) VALUES (?1, ?2)",
            [username, &hash],
        )
        .unwrap();
    }

    fn sign_in(state: &AppState, username: &str) {
        *state.session().unwrap() = Some(Session {
            user_id: 1,
            username: username.into(),
        });
    }

    fn populate(state: &AppState, username: &str) {
        let conn = state.conn().unwrap();
        add_user(&conn, username);
        conn.execute(
            "UPDATE settings SET value = 'Negocio restaurado' WHERE key = 'business_name'",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO vehicles(id, brand, model, year, condition, sale_price_cents, currency, cover_image) VALUES(1, 'Toyota', 'Corolla', 2020, 'used', 1200000, 'USD', 'photo.jpg')", []).unwrap();
        conn.execute("INSERT INTO clients(id, first_name, last_name, document_number) VALUES (1, 'Ana', 'Pérez', '12345678')", []).unwrap();
        conn.execute("INSERT INTO sales(id, client_id, vehicle_id, sale_date, currency, price_cents, plan_id, installments_count) VALUES(1, 1, 1, '2026-11-25', 'USD', 1200000, 1, 6)", []).unwrap();
        conn.execute("INSERT INTO installments(id, sale_id, number, due_date, amount_cents) VALUES(1, 1, 1, '2026-12-25', 200000)", []).unwrap();
        conn.execute("INSERT INTO payments(sale_id, installment_id, paid_at, amount_cents, method) VALUES (1, 1, '2026-12-25', 200000, 'transferencia')", []).unwrap();
        fs::write(state.media.dir().join("photo.jpg"), b"cover-content").unwrap();
        fs::write(state.media.dir().join("photo_thumb.jpg"), b"thumb-content").unwrap();
        drop(conn);
        sign_in(state, username);
    }

    fn username(state: &AppState) -> String {
        state
            .conn()
            .unwrap()
            .query_row("SELECT username FROM users", [], |row| row.get(0))
            .unwrap()
    }

    fn read_entries(path: &Path) -> Vec<(String, Vec<u8>)> {
        let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
        (0..archive.len())
            .map(|index| {
                let mut entry = archive.by_index(index).unwrap();
                let name = entry.name().to_string();
                let mut data = Vec::new();
                entry.read_to_end(&mut data).unwrap();
                (name, data)
            })
            .collect()
    }

    fn write_entries(path: &Path, entries: Vec<(String, Vec<u8>)>) {
        let mut archive = ZipWriter::new(File::create(path).unwrap());
        for (name, data) in entries {
            archive
                .start_file(name, SimpleFileOptions::default())
                .unwrap();
            archive.write_all(&data).unwrap();
        }
        archive.finish().unwrap();
    }

    #[test]
    fn wal_roundtrip_preserves_business_data_photos_and_creates_recovery_backup() {
        let directory = TempDir::new().unwrap();
        let source = state(&directory.path().join("source"));
        source
            .conn()
            .unwrap()
            .pragma_update(None, "wal_autocheckpoint", 0)
            .unwrap();
        populate(&source, "original-user");
        assert!(
            directory
                .path()
                .join("source/cristian.db-wal")
                .metadata()
                .unwrap()
                .len()
                > 0
        );
        let archive = directory.path().join("backup.zip");
        export(&source, &archive).unwrap();

        let target = state(&directory.path().join("target"));
        populate(&target, "previous-user");
        let recovery = import(&target, &archive).unwrap().unwrap();
        assert_eq!(username(&target), "original-user");
        let conn = target.conn().unwrap();
        for table in ["clients", "vehicles", "sales", "installments", "payments"] {
            assert_eq!(
                conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row
                    .get::<_, i64>(0))
                    .unwrap(),
                1
            );
        }
        assert_eq!(
            conn.query_row("SELECT amount_cents FROM payments", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            200000
        );
        assert_eq!(
            conn.query_row(
                "SELECT value FROM settings WHERE key='business_name'",
                [],
                |row| row.get::<_, String>(0)
            )
            .unwrap(),
            "Negocio restaurado"
        );
        let cover: String = conn
            .query_row("SELECT cover_image FROM vehicles", [], |row| row.get(0))
            .unwrap();
        assert_ne!(cover, "photo.jpg");
        assert_eq!(
            fs::read(target.media.dir().join(&cover)).unwrap(),
            b"cover-content"
        );
        assert_eq!(
            fs::read(target.media.dir().join(media::thumb_name(&cover))).unwrap(),
            b"thumb-content"
        );
        assert!(target.media.dir().join("photo.jpg").is_file());
        drop(conn);
        assert!(target.require_auth().is_err());
        let previous = stage_backup(Path::new(&recovery)).unwrap();
        assert_eq!(
            previous
                .conn
                .query_row("SELECT username FROM users", [], |row| row
                    .get::<_, String>(0))
                .unwrap(),
            "previous-user"
        );
        // The recovery archive remains useful after startup cleans old photos.
        crate::commands::vehicles::remove_orphan_images(&target.conn().unwrap(), &target.media)
            .unwrap();
        sign_in(&target, "original-user");
        import(&target, Path::new(&recovery)).unwrap();
        assert_eq!(username(&target), "previous-user");
    }

    #[test]
    fn first_run_import_does_not_require_a_disposable_user() {
        let directory = TempDir::new().unwrap();
        let source = state(&directory.path().join("source"));
        populate(&source, "original-user");
        let archive = directory.path().join("backup.zip");
        export(&source, &archive).unwrap();
        let target = state(&directory.path().join("target"));
        assert_eq!(import(&target, &archive).unwrap(), None);
        assert_eq!(username(&target), "original-user");
        assert!(target.require_auth().is_err());
    }

    #[test]
    fn installed_database_requires_login_for_export_and_import() {
        let directory = TempDir::new().unwrap();
        let target = state(directory.path());
        populate(&target, "protected");
        *target.session().unwrap() = None;
        assert!(matches!(
            export(&target, &directory.path().join("backup.zip")),
            Err(AppError::Unauthorized)
        ));
        assert!(matches!(
            import(&target, &directory.path().join("does-not-exist.zip")),
            Err(AppError::Unauthorized)
        ));
        assert_eq!(username(&target), "protected");
    }

    #[test]
    fn invalid_archives_never_replace_existing_data() {
        let directory = TempDir::new().unwrap();
        let source = state(&directory.path().join("source"));
        populate(&source, "original");
        let valid = directory.path().join("valid.zip");
        export(&source, &valid).unwrap();
        let target = state(&directory.path().join("target"));
        populate(&target, "protected");
        let invalid = directory.path().join("invalid.zip");
        fs::write(&invalid, b"not a zip archive").unwrap();
        assert!(import(&target, &invalid).is_err());
        assert_eq!(username(&target), "protected");

        let mut entries = read_entries(&valid);
        entries.push(("../outside.jpg".into(), vec![1]));
        write_entries(&invalid, entries);
        assert!(import(&target, &invalid).is_err());
        assert!(!directory.path().join("outside.jpg").exists());
        assert_eq!(username(&target), "protected");

        let mut entries = read_entries(&valid);
        entries.retain(|(name, _)| name != "vehicle-images/photo_thumb.jpg");
        write_entries(&invalid, entries);
        assert!(import(&target, &invalid).is_err());
        assert_eq!(username(&target), "protected");

        let mut entries = read_entries(&valid);
        entries
            .iter_mut()
            .find(|(name, _)| name == DB_FILE)
            .unwrap()
            .1 = b"not a database".to_vec();
        write_entries(&invalid, entries);
        assert!(import(&target, &invalid).is_err());
        assert_eq!(username(&target), "protected");
        assert!(!directory.path().join("target/recovery-backups").exists());
        assert!(target.require_auth().is_ok());
    }

    #[test]
    fn rejects_an_extra_trigger_with_a_name_similar_to_sqlite_internals() {
        let directory = TempDir::new().unwrap();
        let source = state(&directory.path().join("source"));
        populate(&source, "original");
        let archive = directory.path().join("backup.zip");
        export(&source, &archive).unwrap();
        let target = state(&directory.path().join("target"));
        populate(&target, "protected");
        let mut entries = read_entries(&archive);
        let staged = directory.path().join("staged.db");
        fs::write(
            &staged,
            &entries.iter().find(|(name, _)| name == DB_FILE).unwrap().1,
        )
        .unwrap();
        let conn = Connection::open(&staged).unwrap();
        conn.execute_batch("CREATE TRIGGER sqliteXcorrupt AFTER INSERT ON payments BEGIN UPDATE installments SET amount_cents=0; END;").unwrap();
        drop(conn);
        entries
            .iter_mut()
            .find(|(name, _)| name == DB_FILE)
            .unwrap()
            .1 = fs::read(staged).unwrap();
        write_entries(&archive, entries);
        assert!(import(&target, &archive).is_err());
        assert_eq!(username(&target), "protected");
        assert!(!directory.path().join("target/recovery-backups").exists());
    }

    #[test]
    fn rejects_duplicate_zip_names_before_name_indexing_hides_them() {
        let directory = TempDir::new().unwrap();
        let archive = directory.path().join("duplicate.zip");
        write_entries(
            &archive,
            vec![
                ("manifest.json".into(), vec![1]),
                ("manifesz.json".into(), vec![2]),
            ],
        );
        let mut bytes = fs::read(&archive).unwrap();
        for offset in 0..bytes.len() - 13 {
            if &bytes[offset..offset + 13] == b"manifesz.json" {
                bytes[offset..offset + 13].copy_from_slice(b"manifest.json");
            }
        }
        fs::write(&archive, bytes).unwrap();
        let reader = ZipArchive::new(File::open(&archive).unwrap()).unwrap();
        assert!(
            reject_duplicate_entries(&archive, reader.central_directory_start(), reader.len())
                .is_err()
        );
    }

    #[test]
    fn failed_export_preserves_the_previous_backup_file() {
        let directory = TempDir::new().unwrap();
        let source = state(&directory.path().join("source"));
        populate(&source, "original");
        let archive = directory.path().join("backup.zip");
        fs::write(&archive, b"previous backup").unwrap();
        fs::remove_file(source.media.dir().join("photo.jpg")).unwrap();
        assert!(export(&source, &archive).is_err());
        assert_eq!(fs::read(&archive).unwrap(), b"previous backup");
    }

    #[test]
    fn failed_sqlite_restore_keeps_existing_database_and_photos() {
        let directory = TempDir::new().unwrap();
        let source = state(&directory.path().join("source"));
        populate(&source, "original");
        let archive = directory.path().join("backup.zip");
        export(&source, &archive).unwrap();
        let target_path = directory.path().join("target");
        let target = state(&target_path);
        populate(&target, "protected");
        drop(target);
        let target = AppState::new(
            Connection::open_with_flags(
                target_path.join(DB_FILE),
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
            )
            .unwrap(),
            MediaStore::new(target_path.join(media::VEHICLE_IMAGES_DIR)).unwrap(),
        );
        sign_in(&target, "protected");
        assert!(import(&target, &archive).is_err());
        assert_eq!(username(&target), "protected");
        assert_eq!(
            fs::read(target.media.dir().join("photo.jpg")).unwrap(),
            b"cover-content"
        );
        assert_eq!(fs::read_dir(target.media.dir()).unwrap().count(), 2);
        assert!(target.require_auth().is_ok());
    }

    #[test]
    fn rejects_future_schema_and_database_with_missing_relationships() {
        let directory = TempDir::new().unwrap();
        let source = state(&directory.path().join("source"));
        populate(&source, "original");
        let valid = directory.path().join("valid.zip");
        export(&source, &valid).unwrap();
        let target = state(&directory.path().join("target"));
        populate(&target, "protected");
        let staged = directory.path().join("staged.db");
        let invalid = directory.path().join("invalid.zip");
        let mut entries = read_entries(&valid);
        fs::write(
            &staged,
            &entries.iter().find(|(name, _)| name == DB_FILE).unwrap().1,
        )
        .unwrap();
        let conn = Connection::open(&staged).unwrap();
        conn.pragma_update(None, "user_version", db::SCHEMA_VERSION + 1)
            .unwrap();
        drop(conn);
        entries
            .iter_mut()
            .find(|(name, _)| name == DB_FILE)
            .unwrap()
            .1 = fs::read(&staged).unwrap();
        let manifest = &mut entries
            .iter_mut()
            .find(|(name, _)| name == MANIFEST_FILE)
            .unwrap()
            .1;
        let mut value: serde_json::Value = serde_json::from_slice(manifest).unwrap();
        value["schemaVersion"] = (db::SCHEMA_VERSION + 1).into();
        *manifest = serde_json::to_vec(&value).unwrap();
        write_entries(&invalid, entries);
        assert!(import(&target, &invalid).is_err());
        assert_eq!(username(&target), "protected");

        let mut entries = read_entries(&valid);
        fs::write(
            &staged,
            &entries.iter().find(|(name, _)| name == DB_FILE).unwrap().1,
        )
        .unwrap();
        let conn = Connection::open(&staged).unwrap();
        conn.pragma_update(None, "foreign_keys", "OFF").unwrap();
        conn.execute("DELETE FROM clients", []).unwrap();
        drop(conn);
        entries
            .iter_mut()
            .find(|(name, _)| name == DB_FILE)
            .unwrap()
            .1 = fs::read(&staged).unwrap();
        write_entries(&invalid, entries);
        assert!(import(&target, &invalid).is_err());
        assert_eq!(username(&target), "protected");
    }

    #[test]
    fn imports_a_previous_schema_after_migration() {
        let directory = TempDir::new().unwrap();
        let old_database = directory.path().join("old.db");
        let conn = Connection::open(&old_database).unwrap();
        conn.execute_batch(include_str!("../db/migrations/001_init.sql"))
            .unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        add_user(&conn, "old-user");
        drop(conn);
        let archive = directory.path().join("old.zip");
        let manifest = Manifest {
            application: APP_ID.into(),
            format_version: FORMAT_VERSION,
            app_version: "0.0.1".into(),
            schema_version: 1,
            created_at: Utc::now().to_rfc3339(),
        };
        write_entries(
            &archive,
            vec![
                (MANIFEST_FILE.into(), serde_json::to_vec(&manifest).unwrap()),
                (DB_FILE.into(), fs::read(&old_database).unwrap()),
            ],
        );
        let target = state(&directory.path().join("target"));
        import(&target, &archive).unwrap();
        assert_eq!(username(&target), "old-user");
        let conn = target.conn().unwrap();
        assert_eq!(
            conn.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                .unwrap(),
            db::SCHEMA_VERSION
        );
        conn.prepare("SELECT cover_image FROM vehicles").unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM settings WHERE key='local_currency'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }
}
