-- Migration: comenzi_linii + track columns on comenzi
-- Run: docker exec -i cheltuieli_db psql -U cheltuieli_user -d cheltuieli < migration_comenzi_linii.sql

ALTER TABLE comenzi ADD COLUMN IF NOT EXISTS linii_synced       BOOLEAN DEFAULT FALSE;
ALTER TABLE comenzi ADD COLUMN IF NOT EXISTS linii_needs_refresh BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS comenzi_linii (
    id                 SERIAL PRIMARY KEY,
    comanda_id         INTEGER NOT NULL REFERENCES comenzi(id) ON DELETE CASCADE,
    erp_order_id       VARCHAR(64) NOT NULL,
    line_index         INTEGER,
    product_name       TEXT,
    product_group      VARCHAR(200),
    quantity           NUMERIC(10,3),
    unit_of_measure    VARCHAR(20),
    unit_price         NUMERIC(10,2),
    discount_percent   NUMERIC(5,2),
    total              NUMERIC(10,2),
    tax_percent        NUMERIC(5,2),
    tax_text           VARCHAR(50),
    order_line_status  INTEGER,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comenzi_linii_comanda_id   ON comenzi_linii(comanda_id);
CREATE INDEX IF NOT EXISTS idx_comenzi_linii_erp_order_id ON comenzi_linii(erp_order_id);

-- Index for backfill query
CREATE INDEX IF NOT EXISTS idx_comenzi_linii_synced ON comenzi(linii_synced) WHERE linii_synced = FALSE;
CREATE INDEX IF NOT EXISTS idx_comenzi_linii_refresh ON comenzi(linii_needs_refresh) WHERE linii_needs_refresh = TRUE;
