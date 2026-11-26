use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};
use crate::media::MediaStore;

pub struct Session {
    pub user_id: i64,
    pub username: String,
}

pub struct AppState {
    db: Mutex<Connection>,
    session: Mutex<Option<Session>>,
    pub media: MediaStore,
}

impl AppState {
    pub fn new(conn: Connection, media: MediaStore) -> Self {
        Self {
            db: Mutex::new(conn),
            session: Mutex::new(None),
            media,
        }
    }

    /// Conexión sin verificar sesión: solo para login / primer usuario.
    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db
            .lock()
            .map_err(|_| AppError::Internal("base de datos bloqueada".into()))
    }

    /// Verifica que haya una sesión iniciada.
    pub fn require_auth(&self) -> AppResult<()> {
        match self.session()?.as_ref() {
            Some(_) => Ok(()),
            None => Err(AppError::Unauthorized),
        }
    }

    /// Conexión para cualquier operación que requiera estar logueado.
    pub fn authed(&self) -> AppResult<MutexGuard<'_, Connection>> {
        let conn = self.conn()?;
        self.require_auth()?;
        Ok(conn)
    }

    pub fn session(&self) -> AppResult<MutexGuard<'_, Option<Session>>> {
        self.session
            .lock()
            .map_err(|_| AppError::Internal("sesión bloqueada".into()))
    }
}
