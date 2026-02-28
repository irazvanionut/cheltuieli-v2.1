-- Migration: ERP Prod customers table (2026-02-27)

CREATE TABLE IF NOT EXISTS erp_customers (
    id          SERIAL PRIMARY KEY,
    erp_id      VARCHAR(100) UNIQUE NOT NULL,
    name        VARCHAR(255),
    address     TEXT,
    phone       VARCHAR(100),
    email       VARCHAR(255),
    type        VARCHAR(100),
    synced_at   TIMESTAMP DEFAULT NOW(),
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_customers_name  ON erp_customers (lower(name));
CREATE INDEX IF NOT EXISTS idx_erp_customers_phone ON erp_customers (phone);

INSERT INTO settings (cheie, valoare, tip, descriere)
VALUES ('erp_prod_bearer_token', '', 'string', 'Bearer token ERP Prod (clienți 10.170.4.101:5020)')
ON CONFLICT (cheie) DO NOTHING;
