CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
    ('late_fee_bp', '2000'),
    ('grace_days', '0'),
    ('local_currency', 'UYU'),
    ('business_name', 'Cristian Automóviles');

CREATE TABLE vehicles (
    id                   INTEGER PRIMARY KEY,
    brand                TEXT NOT NULL,
    model                TEXT NOT NULL,
    version              TEXT,
    year                 INTEGER NOT NULL,
    plate                TEXT UNIQUE COLLATE NOCASE,
    vin                  TEXT,
    engine_number        TEXT,
    color                TEXT,
    km                   INTEGER NOT NULL DEFAULT 0,
    fuel                 TEXT,
    transmission         TEXT,
    condition            TEXT NOT NULL CHECK (condition IN ('new', 'used')),
    purchase_price_cents INTEGER,
    purchase_currency    TEXT,
    sale_price_cents     INTEGER NOT NULL,
    currency             TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'available'
                         CHECK (status IN ('available', 'reserved', 'sold')),
    notes                TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE clients (
    id              INTEGER PRIMARY KEY,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    document_type   TEXT NOT NULL DEFAULT 'DNI',
    document_number TEXT NOT NULL UNIQUE,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    city            TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE financing_plans (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    installments INTEGER NOT NULL CHECK (installments > 0),
    surcharge_bp INTEGER NOT NULL DEFAULT 0 CHECK (surcharge_bp >= 0),
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Planes de ejemplo: editables desde Configuración
INSERT INTO financing_plans (name, installments, surcharge_bp) VALUES
    ('6 cuotas', 6, 1500),
    ('12 cuotas', 12, 3000),
    ('18 cuotas', 18, 4500),
    ('24 cuotas', 24, 6000);

-- surcharge_bp, late_fee_bp y grace_days se copian al crear la venta para que
-- cambios posteriores en planes/configuración no alteren contratos existentes.
CREATE TABLE sales (
    id                   INTEGER PRIMARY KEY,
    client_id            INTEGER NOT NULL REFERENCES clients (id),
    vehicle_id           INTEGER NOT NULL REFERENCES vehicles (id),
    sale_date            TEXT NOT NULL,
    currency             TEXT NOT NULL,
    price_cents          INTEGER NOT NULL,
    down_payment_cents   INTEGER NOT NULL DEFAULT 0,
    financed_cents       INTEGER NOT NULL DEFAULT 0,
    plan_id              INTEGER REFERENCES financing_plans (id),
    plan_name            TEXT,
    installments_count   INTEGER NOT NULL DEFAULT 0,
    surcharge_bp         INTEGER NOT NULL DEFAULT 0,
    late_fee_bp          INTEGER NOT NULL DEFAULT 0,
    grace_days           INTEGER NOT NULL DEFAULT 0,
    total_financed_cents INTEGER NOT NULL DEFAULT 0,
    first_due_date       TEXT,
    status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'paid', 'cancelled')),
    notes                TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sales_client ON sales (client_id);
CREATE INDEX idx_sales_vehicle ON sales (vehicle_id);

CREATE TABLE installments (
    id                INTEGER PRIMARY KEY,
    sale_id           INTEGER NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
    number            INTEGER NOT NULL,
    due_date          TEXT NOT NULL,
    amount_cents      INTEGER NOT NULL,
    paid_at           TEXT,
    late_fee_cents    INTEGER NOT NULL DEFAULT 0,
    paid_amount_cents INTEGER NOT NULL DEFAULT 0,
    UNIQUE (sale_id, number)
);

CREATE INDEX idx_installments_due ON installments (due_date) WHERE paid_at IS NULL;

CREATE TABLE payments (
    id             INTEGER PRIMARY KEY,
    sale_id        INTEGER NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
    installment_id INTEGER NOT NULL REFERENCES installments (id) ON DELETE CASCADE,
    paid_at        TEXT NOT NULL,
    amount_cents   INTEGER NOT NULL,
    late_fee_cents INTEGER NOT NULL DEFAULT 0,
    method         TEXT NOT NULL DEFAULT 'efectivo'
                   CHECK (method IN ('efectivo', 'transferencia', 'cheque', 'otro')),
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_payments_sale ON payments (sale_id);
CREATE INDEX idx_payments_paid_at ON payments (paid_at);
