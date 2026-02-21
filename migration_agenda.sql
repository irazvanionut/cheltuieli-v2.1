-- ============================================
-- AGENDA FURNIZORI - Migration (v3)
-- Run: docker exec -i cheltuieli_db psql -U cheltuieli_user -d cheltuieli < migration_agenda.sql
-- ============================================

CREATE TABLE IF NOT EXISTS agenda_furnizori (
    id SERIAL PRIMARY KEY,
    erp_name VARCHAR(255),
    nume VARCHAR(255) NOT NULL,
    categorie VARCHAR(100),
    zile_livrare VARCHAR(100),
    frecventa_comanda VARCHAR(50),
    discount_procent DECIMAL(5,2),
    termen_plata_zile INTEGER,
    suma_minima_comanda DECIMAL(10,2),
    rating_intern SMALLINT,
    note_generale TEXT,
    atentie BOOLEAN DEFAULT false,
    activ BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agenda_contacte (
    id SERIAL PRIMARY KEY,
    furnizor_id INTEGER REFERENCES agenda_furnizori(id) ON DELETE CASCADE,
    nume VARCHAR(255) NOT NULL,
    rol VARCHAR(100),
    primar BOOLEAN DEFAULT false,
    erp_contact BOOLEAN DEFAULT false,
    activ BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agenda_contacte_campuri (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER REFERENCES agenda_contacte(id) ON DELETE CASCADE,
    tip VARCHAR(50) NOT NULL,
    valoare VARCHAR(255) NOT NULL,
    ordine INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agenda_interactiuni (
    id SERIAL PRIMARY KEY,
    furnizor_id INTEGER REFERENCES agenda_furnizori(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES agenda_contacte(id) ON DELETE SET NULL,
    nota TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agenda_todos (
    id SERIAL PRIMARY KEY,
    furnizor_id INTEGER REFERENCES agenda_furnizori(id) ON DELETE CASCADE,
    titlu VARCHAR(500) NOT NULL,
    cantitate VARCHAR(100),
    tip VARCHAR(20) DEFAULT 'todo',
    prioritate SMALLINT DEFAULT 2,
    rezolvat BOOLEAN DEFAULT false,
    data_scadenta DATE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agenda_furnizori_activ ON agenda_furnizori(activ);
CREATE INDEX IF NOT EXISTS idx_agenda_contacte_furnizor ON agenda_contacte(furnizor_id);
CREATE INDEX IF NOT EXISTS idx_agenda_campuri_contact ON agenda_contacte_campuri(contact_id);
CREATE INDEX IF NOT EXISTS idx_agenda_interactiuni_furnizor ON agenda_interactiuni(furnizor_id);
CREATE INDEX IF NOT EXISTS idx_agenda_todos_furnizor_rezolvat ON agenda_todos(furnizor_id, rezolvat);

-- v2 additions (idempotent)
ALTER TABLE agenda_contacte ADD COLUMN IF NOT EXISTS erp_contact BOOLEAN DEFAULT false;
-- v3 additions (idempotent)
ALTER TABLE agenda_furnizori ADD COLUMN IF NOT EXISTS atentie BOOLEAN DEFAULT false;
