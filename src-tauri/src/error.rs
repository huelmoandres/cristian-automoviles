use rusqlite::ErrorCode;
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Error de base de datos: {0}")]
    Db(rusqlite::Error),
    #[error("{0}")]
    Validation(String),
    #[error("Sesión no iniciada")]
    Unauthorized,
    #[error("{0} no encontrado")]
    NotFound(&'static str),
    #[error("Error interno: {0}")]
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn validation(msg: impl Into<String>) -> Self {
        Self::Validation(msg.into())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        if let rusqlite::Error::SqliteFailure(e, Some(msg)) = &err {
            if e.code == ErrorCode::ConstraintViolation && msg.contains("UNIQUE") {
                let field = if msg.contains("plate") {
                    "esa patente"
                } else if msg.contains("document_number") {
                    "ese documento"
                } else if msg.contains("username") {
                    "ese usuario"
                } else {
                    "esos datos"
                };
                return Self::Validation(format!("Ya existe un registro con {field}"));
            }
        }
        Self::Db(err)
    }
}

// El frontend recibe el error como un string legible.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
