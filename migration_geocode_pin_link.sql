ALTER TABLE geocode_overrides
  ADD COLUMN IF NOT EXISTS map_pin_id INTEGER REFERENCES map_pins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_geocode_overrides_map_pin_id ON geocode_overrides(map_pin_id);
