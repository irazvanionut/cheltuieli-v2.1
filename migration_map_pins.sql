-- Map pins table for Navigatie GPS page
CREATE TABLE IF NOT EXISTS map_pins (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    address     TEXT,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    color       VARCHAR(20) DEFAULT 'blue',
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_pins_name ON map_pins (lower(name));

-- Traccar settings
INSERT INTO settings (cheie, valoare, tip, descriere)
VALUES
  ('traccar_url',      '', 'string', 'URL Traccar (ex: http://10.x.x.x:30003)'),
  ('traccar_email',    '', 'string', 'Email admin Traccar'),
  ('traccar_password', '', 'string', 'Parolă admin Traccar')
ON CONFLICT (cheie) DO NOTHING;
