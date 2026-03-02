CREATE TABLE IF NOT EXISTS geocode_overrides (
    id SERIAL PRIMARY KEY,
    address_normalized VARCHAR(500) UNIQUE NOT NULL,
    lat NUMERIC(10, 7) NOT NULL,
    lng NUMERIC(10, 7) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_geocode_overrides_addr ON geocode_overrides(address_normalized);
