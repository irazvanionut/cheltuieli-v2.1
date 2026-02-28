-- Add permanent + note columns to map_pins
ALTER TABLE map_pins ADD COLUMN IF NOT EXISTS permanent BOOLEAN DEFAULT FALSE;
ALTER TABLE map_pins ADD COLUMN IF NOT EXISTS note VARCHAR(255);

-- Insert the permanent Restaurant pin (Afumati, Ilfov)
INSERT INTO map_pins (name, address, lat, lng, color, permanent)
VALUES ('Restaurant', 'București-Urziceni 28, Afumați, Ilfov', 44.5476, 26.2153, 'red', true)
ON CONFLICT DO NOTHING;
