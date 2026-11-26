-- La concesionaria opera en Uruguay: moneda local en pesos uruguayos.
-- (Bases creadas antes de este ajuste quedaron con ARS por defecto.)
UPDATE settings SET value = 'UYU' WHERE key = 'local_currency' AND value = 'ARS';
