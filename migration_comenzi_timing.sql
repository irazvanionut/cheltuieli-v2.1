ALTER TABLE comenzi ADD COLUMN IF NOT EXISTS current_status INTEGER;

CREATE TABLE IF NOT EXISTS comenzi_status_history (
    id          SERIAL PRIMARY KEY,
    erp_id      VARCHAR(64) NOT NULL,
    number      INTEGER,
    status      INTEGER NOT NULL,
    is_ridicare BOOLEAN DEFAULT FALSE,
    erp_time    TIMESTAMP WITH TIME ZONE,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_csh_erp_id   ON comenzi_status_history(erp_id);
CREATE INDEX IF NOT EXISTS idx_csh_erp_time ON comenzi_status_history(erp_time);
