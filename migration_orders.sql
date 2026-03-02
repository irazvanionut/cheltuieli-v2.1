-- Migration: comenzi table (OrderProjection history from ERP)
-- Run: docker exec -i cheltuieli_db psql -U cheltuieli_user -d cheltuieli < migration_orders.sql

CREATE TABLE IF NOT EXISTS comenzi (
    id              SERIAL PRIMARY KEY,
    erp_id          VARCHAR(64) UNIQUE NOT NULL,
    number          INTEGER,
    index_in_interval INTEGER,
    created_at_erp  TIMESTAMPTZ,
    erp_time        VARCHAR(10),
    erp_date        VARCHAR(20),
    journal_dt      TIMESTAMPTZ,
    order_info      TEXT,
    ship_to_address TEXT,
    phone           VARCHAR(30),
    email           VARCHAR(200),
    staff_order_name VARCHAR(200),
    total           NUMERIC(10,2),
    payload_json    TEXT,
    synced_at       TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comenzi_number         ON comenzi(number DESC);
CREATE INDEX IF NOT EXISTS idx_comenzi_created_at_erp ON comenzi(created_at_erp);
CREATE INDEX IF NOT EXISTS idx_comenzi_phone          ON comenzi(phone);
CREATE INDEX IF NOT EXISTS idx_comenzi_erp_date       ON comenzi(erp_date);
