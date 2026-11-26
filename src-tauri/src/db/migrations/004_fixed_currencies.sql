-- Las monedas son fijas (USD y UYU, ver domain/status.rs): ya no hay moneda local configurable.
DELETE FROM settings WHERE key = 'local_currency';

-- Cualquier valor fuera de USD/UYU que haya quedado de versiones anteriores pasa a UYU.
UPDATE vehicles SET currency = 'UYU' WHERE currency NOT IN ('USD', 'UYU');
UPDATE vehicles SET purchase_currency = 'UYU'
    WHERE purchase_currency IS NOT NULL AND purchase_currency NOT IN ('USD', 'UYU');
UPDATE sales SET currency = 'UYU' WHERE currency NOT IN ('USD', 'UYU');
