-- Geofences: circular zones auto-created around map pins
CREATE TABLE IF NOT EXISTS geofences (
    id         SERIAL PRIMARY KEY,
    map_pin_id INTEGER REFERENCES map_pins(id) ON DELETE CASCADE,
    lat        DOUBLE PRECISION NOT NULL,
    lng        DOUBLE PRECISION NOT NULL,
    radius_m   INTEGER NOT NULL DEFAULT 100,
    active     BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofences_pin    ON geofences(map_pin_id);
CREATE INDEX IF NOT EXISTS idx_geofences_active ON geofences(active) WHERE active = TRUE;
