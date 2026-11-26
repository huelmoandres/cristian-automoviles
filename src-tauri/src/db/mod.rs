use std::path::Path;

use rusqlite::functions::FunctionFlags;
use rusqlite::types::ValueRef;
use rusqlite::{Connection, OpenFlags};
use rusqlite_migration::{Migrations, M};

use crate::domain::text;
use crate::error::{AppError, AppResult};

const MIGRATION_SQL: &[&str] = &[
    include_str!("migrations/001_init.sql"),
    include_str!("migrations/002_uruguay_defaults.sql"),
    include_str!("migrations/003_vehicle_cover.sql"),
    include_str!("migrations/004_fixed_currencies.sql"),
];

pub const SCHEMA_VERSION: i64 = MIGRATION_SQL.len() as i64;

fn migrations() -> Migrations<'static> {
    Migrations::new(MIGRATION_SQL.iter().map(|sql| M::up(sql)).collect())
}

pub fn open(path: &Path) -> AppResult<Connection> {
    let mut conn = Connection::open(path)?;
    configure(&mut conn)?;
    Ok(conn)
}

/// Validate a staged snapshot before migrating it or touching the live database.
pub fn open_backup(path: &Path, declared_version: i64) -> AppResult<Connection> {
    let mut conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version != declared_version || !(1..=SCHEMA_VERSION).contains(&version) {
        return Err(AppError::validation(
            "El respaldo pertenece a una versión incompatible. Actualizá la app e intentá nuevamente.",
        ));
    }

    let mut expected = Connection::open_in_memory()?;
    migrations()
        .to_version(&mut expected, version as usize)
        .map_err(|e| AppError::Internal(format!("migración: {e}")))?;
    if schema(&conn)? != schema(&expected)? {
        return Err(AppError::validation(
            "La base del respaldo no corresponde a esta aplicación",
        ));
    }
    validate_integrity(&conn)?;
    configure(&mut conn)?;
    validate_integrity(&conn)?;
    Ok(conn)
}

fn schema(conn: &Connection) -> AppResult<Vec<(String, String, String)>> {
    let mut stmt = conn
        .prepare("SELECT type, name, COALESCE(sql, '') FROM sqlite_schema ORDER BY type, name")?;
    let rows = stmt.query_map([], |r| {
        let sql: String = r.get(2)?;
        // Preserve quoted values: stripping whitespace can hide changes inside SQL literals.
        Ok((
            r.get(0)?,
            r.get(1)?,
            sql.replace("\r\n", "\n").trim().to_owned(),
        ))
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn validate_integrity(conn: &Connection) -> AppResult<()> {
    let result: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if result != "ok" {
        return Err(AppError::validation("La base del respaldo está dañada"));
    }
    if conn.prepare("PRAGMA foreign_key_check")?.exists([])? {
        return Err(AppError::validation(
            "El respaldo contiene registros relacionados incompletos",
        ));
    }
    Ok(())
}

#[cfg(test)]
pub fn open_in_memory() -> AppResult<Connection> {
    let mut conn = Connection::open_in_memory()?;
    configure(&mut conn)?;
    Ok(conn)
}

fn configure(conn: &mut Connection) -> AppResult<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    register_search_fn(conn)?;
    migrations()
        .to_latest(conn)
        .map_err(|e| AppError::Internal(format!("migración: {e}")))
}

/// `matches_search(query, campo1, campo2, ...)`: ver [`text::matches_all`].
/// Los campos NULL se ignoran y los números se comparan como texto.
fn register_search_fn(conn: &Connection) -> AppResult<()> {
    conn.create_scalar_function(
        text::SQL_MATCH_FN,
        -1,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let query = ctx.get::<String>(0)?;
            let fields: Vec<String> = (1..ctx.len())
                .filter_map(|i| match ctx.get_raw(i) {
                    ValueRef::Text(t) => Some(String::from_utf8_lossy(t).into_owned()),
                    ValueRef::Integer(n) => Some(n.to_string()),
                    _ => None,
                })
                .collect();
            Ok(text::matches_all(&query, fields.iter().map(String::as_str)))
        },
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn migrations_are_valid() {
        assert!(super::migrations().validate().is_ok());
    }

    #[test]
    fn sql_search_function_ignores_accents_and_order() {
        let conn = super::open_in_memory().unwrap();
        let hit: bool = conn
            .query_row(
                "SELECT matches_search('perez juan', 'Juan', 'Pérez', NULL, 2020)",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(hit);
    }

    #[test]
    fn backup_schema_validation_preserves_whitespace_inside_literals() {
        let directory = tempfile::TempDir::new().unwrap();
        let path = directory.path().join("modified.db");
        let conn = rusqlite::Connection::open(&path).unwrap();
        let modified =
            super::MIGRATION_SQL[0].replace("DEFAULT 'available'", "DEFAULT 'a v a i l a b l e'");
        conn.execute_batch(&modified).unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        drop(conn);
        assert!(super::open_backup(&path, 1).is_err());
    }

    #[test]
    fn backup_schema_validation_rejects_reserved_name_triggers() {
        let directory = tempfile::TempDir::new().unwrap();
        let path = directory.path().join("modified.db");
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(super::MIGRATION_SQL[0]).unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        conn.pragma_update(None, "writable_schema", "ON").unwrap();
        conn.execute("INSERT INTO sqlite_schema(type,name,tbl_name,rootpage,sql) VALUES('trigger','sqlite_bad','payments',0,'CREATE TRIGGER sqlite_bad AFTER INSERT ON payments BEGIN UPDATE installments SET amount_cents=0; END')", []).unwrap();
        drop(conn);
        assert!(super::open_backup(&path, 1).is_err());
    }
}
