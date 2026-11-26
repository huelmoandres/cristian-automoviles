//! Estados y catálogos del dominio. Cada enum se guarda en SQLite como texto,
//! se serializa igual hacia el frontend y exporta su tipo TypeScript.

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Declara un enum persistible: `Variante => "valor"` define el texto en DB y JSON.
macro_rules! db_enum {
    ($(#[$meta:meta])* $name:ident { $($variant:ident => $value:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(
            Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS,
        )]
        #[ts(export)]
        pub enum $name {
            $(#[serde(rename = $value)] $variant),+
        }

        impl $name {
            #[allow(dead_code)]
            pub const ALL: &'static [Self] = &[$(Self::$variant),+];

            pub const fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $value),+
                }
            }
        }

        impl ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
                Ok(ToSqlOutput::from(self.as_str()))
            }
        }

        impl FromSql for $name {
            fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
                match value.as_str()? {
                    $($value => Ok(Self::$variant),)+
                    other => Err(FromSqlError::Other(
                        format!("{}: valor desconocido '{other}'", stringify!($name)).into(),
                    )),
                }
            }
        }
    };
}

db_enum!(VehicleStatus {
    Available => "available",
    Reserved => "reserved",
    Sold => "sold",
});

impl VehicleStatus {
    /// Orden en listados: primero lo disponible para vender.
    pub const fn sort_order(self) -> u8 {
        match self {
            Self::Available => 0,
            Self::Reserved => 1,
            Self::Sold => 2,
        }
    }
}

db_enum!(VehicleCondition {
    New => "new",
    Used => "used",
});

db_enum!(SaleStatus {
    Active => "active",
    Paid => "paid",
    Cancelled => "cancelled",
});

db_enum!(
    /// Monedas en las que opera la concesionaria.
    Currency {
        Usd => "USD",
        Uyu => "UYU",
    }
);

db_enum!(PaymentMethod {
    Cash => "efectivo",
    Transfer => "transferencia",
    Check => "cheque",
    Other => "otro",
});

db_enum!(
    /// Qué cuotas impagas listar en cobranzas.
    DueScope {
        Overdue => "overdue",
        Upcoming => "upcoming",
        Unpaid => "unpaid",
    }
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sql_roundtrip_matches_serde() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        for status in SaleStatus::ALL {
            let back: SaleStatus = conn.query_row("SELECT ?1", [status], |r| r.get(0)).unwrap();
            assert_eq!(back, *status);
            let json = serde_json::to_string(status).unwrap();
            assert_eq!(json, format!("\"{}\"", status.as_str()));
        }
        assert!(serde_json::from_str::<Currency>("\"ARS\"").is_err());
        let bad: rusqlite::Result<PaymentMethod> =
            conn.query_row("SELECT 'bitcoin'", [], |r| r.get(0));
        assert!(bad.is_err());
    }
}
