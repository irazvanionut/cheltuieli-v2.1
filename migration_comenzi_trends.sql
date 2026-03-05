CREATE TABLE IF NOT EXISTS comenzi_trends_daily (
    date DATE PRIMARY KEY,
    count_total   INTEGER DEFAULT 0,
    count_dinein  INTEGER DEFAULT 0,
    count_livrare INTEGER DEFAULT 0,
    count_ridicare INTEGER DEFAULT 0,
    val_total     NUMERIC(12,2) DEFAULT 0,
    val_dinein    NUMERIC(12,2) DEFAULT 0,
    val_livrare   NUMERIC(12,2) DEFAULT 0,
    val_ridicare  NUMERIC(12,2) DEFAULT 0,
    computed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comenzi_trends_heatmap (
    dow   INTEGER NOT NULL,   -- 0=Lun ... 6=Dum (Python weekday())
    hour  INTEGER NOT NULL,   -- 0-23
    count_total    INTEGER DEFAULT 0,
    count_dinein   INTEGER DEFAULT 0,
    count_livrare  INTEGER DEFAULT 0,
    count_ridicare INTEGER DEFAULT 0,
    val_avg        NUMERIC(10,2) DEFAULT 0,
    computed_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (dow, hour)
);
