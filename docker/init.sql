-- ============================================
-- CHELTUIELI V2 - DATABASE SCHEMA
-- PostgreSQL 16 + pgvector + pg_trgm
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. SETTINGS (Configurări sistem)
-- ============================================

CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    cheie VARCHAR(100) UNIQUE NOT NULL,
    valoare TEXT,
    tip VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
    descriere TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Setări inițiale
INSERT INTO settings (cheie, valoare, tip, descriere) VALUES
    ('ollama_host', 'http://localhost:11434', 'string', 'Adresa serverului Ollama'),
    ('ollama_embedding_model', 'mxbai-embed-large', 'string', 'Model pentru embeddings'),
    ('ollama_chat_model', 'llama3.2:3b', 'string', 'Model pentru chat AI'),
    ('ai_autocomplete_enabled', 'true', 'boolean', 'Activează autocomplete AI'),
    ('ai_chat_enabled', 'true', 'boolean', 'Activează Chat BigBoss'),
    ('ora_inchidere', '07:00', 'string', 'Ora închidere automată exercițiu'),
    ('inchidere_automata', 'true', 'boolean', 'Închidere automată activă'),
    ('tema_ui', 'light', 'string', 'Tema interfață: light/dark/auto'),
    ('limba', 'ro', 'string', 'Limba aplicației'),
    ('inregistrari_per_pagina', '20', 'number', 'Număr înregistrări per pagină'),
    ('monede', 'RON:lei,EUR:€,USD:$', 'string', 'Lista monede active: CODE:label separate prin virgula');

-- ============================================
-- 2. USERS (Utilizatori)
-- ============================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    nume_complet VARCHAR(100) NOT NULL,
    cod_acces VARCHAR(100) NOT NULL, -- hashed PIN/card code
    rol VARCHAR(20) NOT NULL DEFAULT 'operator', -- operator, sef, admin
    activ BOOLEAN DEFAULT true,
    ultima_autentificare TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pentru autentificare rapidă
CREATE INDEX idx_users_cod_acces ON users(cod_acces) WHERE activ = true;
CREATE INDEX idx_users_username ON users(username) WHERE activ = true;

-- User admin inițial (cod: 1234)
INSERT INTO users (username, nume_complet, cod_acces, rol) VALUES
    ('admin', 'Administrator', '$2b$12$2KIEw/ZnreyoPqG0/ZJog.yrlrbX0l0E0DbNO9C6ng5UQ6ACs71sW', 'admin');

-- ============================================
-- 3. PORTOFELE (Conturi)
-- ============================================

CREATE TABLE portofele (
    id SERIAL PRIMARY KEY,
    nume VARCHAR(50) UNIQUE NOT NULL,
    descriere TEXT,
    ordine INTEGER DEFAULT 0,
    activ BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portofele inițiale
INSERT INTO portofele (nume, ordine) VALUES 
    ('Zi', 1),
    ('Dimineata', 2),
    ('Soferi', 3),
    ('Apl', 4),
    ('Seara', 5),
    ('Banca', 6),
    ('Prot', 7);

-- ============================================
-- 4. CATEGORII
-- ============================================

CREATE TABLE categorii (
    id SERIAL PRIMARY KEY,
    nume VARCHAR(50) UNIQUE NOT NULL,
    descriere TEXT,
    culoare VARCHAR(7) DEFAULT '#6B7280', -- HEX color
    afecteaza_sold BOOLEAN DEFAULT true,
    ordine INTEGER DEFAULT 0,
    activ BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categorii inițiale
INSERT INTO categorii (nume, culoare, afecteaza_sold, ordine) VALUES 
    ('Cheltuieli', '#EF4444', true, 1),
    ('Marfă', '#3B82F6', true, 2),
    ('Salarii', '#10B981', true, 3),
    ('Tips', '#F59E0B', true, 4),
    ('FormePlata', '#6B7280', false, 5);

-- ============================================
-- 5. GRUPE
-- ============================================

CREATE TABLE grupe (
    id SERIAL PRIMARY KEY,
    nume VARCHAR(50) NOT NULL,
    categorie_id INTEGER REFERENCES categorii(id) ON DELETE SET NULL,
    ordine INTEGER DEFAULT 0,
    activ BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(nume, categorie_id)
);

-- Grupe inițiale
INSERT INTO grupe (nume, categorie_id, ordine) VALUES 
    -- Cheltuieli
    ('ChZilnice', 1, 1),
    ('CheltAnuale', 1, 2),
    ('Investitii', 1, 3),
    ('Protocol', 1, 4),
    ('Datorii', 1, 5),
    -- Marfă
    ('Distribuitori', 2, 1),
    ('Soferi', 2, 2),
    -- Salarii
    ('Personal', 3, 1),
    -- Tips
    ('Pahar', 4, 1),
    -- FormePlata
    ('Numerar', 5, 1),
    ('Card', 5, 2),
    ('Alte', 5, 3);

-- ============================================
-- 6. NOMENCLATOR (Master Data)
-- ============================================

CREATE TABLE nomenclator (
    id SERIAL PRIMARY KEY,
    denumire VARCHAR(255) NOT NULL,
    categorie_id INTEGER REFERENCES categorii(id) ON DELETE SET NULL,
    grupa_id INTEGER REFERENCES grupe(id) ON DELETE SET NULL,
    tip_entitate VARCHAR(50) DEFAULT 'Altele', -- Furnizor, Persoana, Serviciu, Altele
    embedding vector(1024), -- pentru AI autocomplete
    frecventa_utilizare INTEGER DEFAULT 0,
    ultima_utilizare TIMESTAMP,
    activ BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes pentru search rapid
CREATE INDEX idx_nomenclator_denumire_trgm ON nomenclator USING gin (denumire gin_trgm_ops);
CREATE INDEX idx_nomenclator_embedding ON nomenclator USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_nomenclator_categorie ON nomenclator(categorie_id) WHERE activ = true;
CREATE INDEX idx_nomenclator_activ ON nomenclator(activ);

-- Nomenclator inițial (exemple)
INSERT INTO nomenclator (denumire, categorie_id, grupa_id, tip_entitate) VALUES
    -- Cheltuieli
    ('Gunoi', 1, 1, 'Serviciu'),
    ('Gaze', 1, 1, 'Serviciu'),
    ('Curent', 1, 1, 'Serviciu'),
    ('Detergent', 1, 1, 'Serviciu'),
    ('Carbuni', 1, 1, 'Serviciu'),
    ('Formatie Masa', 1, 1, 'Serviciu'),
    ('Masa Personal', 1, 1, 'Serviciu'),
    -- Marfă
    ('Metro', 2, 6, 'Furnizor'),
    ('Kaufland', 2, 6, 'Furnizor'),
    ('Selgros', 2, 6, 'Furnizor'),
    -- Salarii
    ('Ionescu Maria', 3, 8, 'Persoana'),
    ('Popescu Ion', 3, 8, 'Persoana'),
    -- Tips
    ('Ionescu Maria Pahar', 4, 9, 'Persoana'),
    ('Popescu Ion Pahar', 4, 9, 'Persoana'),
    -- FormePlata
    ('Plata Card', 5, 11, 'Altele'),
    ('Plata Euro', 5, 12, 'Altele'),
    ('Plata Tikete', 5, 12, 'Altele');

-- ============================================
-- 7. EXERCITII (Zi contabilă)
-- ============================================

CREATE TABLE exercitii (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL UNIQUE,
    ora_deschidere TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ora_inchidere TIMESTAMP,
    inchis_de INTEGER REFERENCES users(id),
    activ BOOLEAN DEFAULT true, -- exercițiu curent deschis
    observatii TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_exercitii_data ON exercitii(data DESC);
CREATE INDEX idx_exercitii_activ ON exercitii(activ) WHERE activ = true;

-- ============================================
-- 8. CHELTUIELI (Tranzacții principale)
-- ============================================

CREATE TABLE cheltuieli (
    id SERIAL PRIMARY KEY,
    exercitiu_id INTEGER REFERENCES exercitii(id) ON DELETE CASCADE,
    portofel_id INTEGER REFERENCES portofele(id),
    nomenclator_id INTEGER REFERENCES nomenclator(id),
    
    -- Dacă nu există în nomenclator
    denumire_custom VARCHAR(255),
    categorie_id INTEGER REFERENCES categorii(id),
    grupa_id INTEGER REFERENCES grupe(id),
    
    suma NUMERIC(12, 2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'RON', -- RON, EUR, USD
    sens VARCHAR(20) NOT NULL, -- 'Cheltuiala', 'Incasare', 'Alimentare', 'Transfer'
    
    -- Flags
    neplatit BOOLEAN DEFAULT false,
    verificat BOOLEAN DEFAULT false,
    verificat_de INTEGER REFERENCES users(id),
    verificat_la TIMESTAMP,
    
    -- Metadata
    operator_id INTEGER REFERENCES users(id),
    comentarii TEXT,
    activ BOOLEAN DEFAULT true, -- Soft delete
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cheltuieli_exercitiu ON cheltuieli(exercitiu_id);
CREATE INDEX idx_cheltuieli_portofel ON cheltuieli(portofel_id);
CREATE INDEX idx_cheltuieli_nomenclator ON cheltuieli(nomenclator_id);
CREATE INDEX idx_cheltuieli_categorie ON cheltuieli(categorie_id);
CREATE INDEX idx_cheltuieli_activ ON cheltuieli(activ);
CREATE INDEX idx_cheltuieli_sens ON cheltuieli(sens);
CREATE INDEX idx_cheltuieli_neplatit ON cheltuieli(neplatit) WHERE neplatit = true;
CREATE INDEX idx_cheltuieli_verificat ON cheltuieli(verificat);

-- ============================================
-- 9. TRANSFERURI (între portofele)
-- ============================================

CREATE TABLE transferuri (
    id SERIAL PRIMARY KEY,
    exercitiu_id INTEGER REFERENCES exercitii(id) ON DELETE CASCADE,
    
    portofel_sursa_id INTEGER REFERENCES portofele(id),
    portofel_dest_id INTEGER REFERENCES portofele(id),
    
    cheltuiala_sursa_id INTEGER REFERENCES cheltuieli(id) ON DELETE CASCADE,
    cheltuiala_dest_id INTEGER REFERENCES cheltuieli(id) ON DELETE CASCADE,
    
    suma NUMERIC(12, 2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'RON', -- RON, EUR, USD
    suma_dest NUMERIC(12, 2),        -- nullable: dest amount for cross-currency transfers
    moneda_dest VARCHAR(3),           -- nullable: dest currency for cross-currency transfers
    operator_id INTEGER REFERENCES users(id),
    comentarii TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transferuri_exercitiu ON transferuri(exercitiu_id);

-- ============================================
-- 10. ALIMENTARI (sold inițial portofele)
-- ============================================

CREATE TABLE alimentari (
    id SERIAL PRIMARY KEY,
    exercitiu_id INTEGER REFERENCES exercitii(id) ON DELETE CASCADE,
    portofel_id INTEGER REFERENCES portofele(id),
    suma NUMERIC(12, 2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'RON', -- RON, EUR, USD
    operator_id INTEGER REFERENCES users(id),
    comentarii TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alimentari_exercitiu ON alimentari(exercitiu_id);

-- ============================================
-- 11. CHAT HISTORY (pentru BigBoss AI)
-- ============================================

CREATE TABLE chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    message TEXT NOT NULL,
    response TEXT,
    embedding vector(1024),
    context_used JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_history_user ON chat_history(user_id);
CREATE INDEX idx_chat_history_embedding ON chat_history USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ============================================
-- 12. APELURI ZILNIC (Sumar zilnic apeluri)
-- ============================================

CREATE TABLE apeluri_zilnic (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL UNIQUE,
    total INTEGER DEFAULT 0,
    answered INTEGER DEFAULT 0,
    abandoned INTEGER DEFAULT 0,
    answer_rate INTEGER DEFAULT 0,
    abandon_rate INTEGER DEFAULT 0,
    asa INTEGER DEFAULT 0,
    waited_over_30 INTEGER DEFAULT 0,
    hold_answered_avg INTEGER DEFAULT 0,
    hold_answered_median INTEGER DEFAULT 0,
    hold_answered_p90 INTEGER DEFAULT 0,
    hold_abandoned_avg INTEGER DEFAULT 0,
    hold_abandoned_median INTEGER DEFAULT 0,
    hold_abandoned_p90 INTEGER DEFAULT 0,
    call_duration_avg INTEGER DEFAULT 0,
    call_duration_median INTEGER DEFAULT 0,
    call_duration_p90 INTEGER DEFAULT 0,
    hourly_data JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 13. APELURI DETALII (Apeluri individuale)
-- ============================================

CREATE TABLE apeluri_detalii (
    id SERIAL PRIMARY KEY,
    apeluri_zilnic_id INTEGER NOT NULL REFERENCES apeluri_zilnic(id) ON DELETE CASCADE,
    callid VARCHAR(100),
    caller_id VARCHAR(100),
    agent VARCHAR(50),
    status VARCHAR(20) NOT NULL,
    ora VARCHAR(10),
    hold_time INTEGER DEFAULT 0,
    call_time INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_apeluri_zilnic_data ON apeluri_zilnic(data DESC);
CREATE INDEX idx_apeluri_detalii_zilnic ON apeluri_detalii(apeluri_zilnic_id);

-- ============================================
-- 14. RECOMANDARI APELURI (Insights comenzi)
-- ============================================

CREATE TABLE recomandari_apeluri (
    id SERIAL PRIMARY KEY,
    data DATE NOT NULL UNIQUE,
    total_conversatii INTEGER DEFAULT 0,
    conversations JSONB DEFAULT '[]',
    top_recomandari JSONB DEFAULT '[]',
    top_lucruri_bune JSONB DEFAULT '[]',
    tip_apeluri JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recomandari_apeluri_data ON recomandari_apeluri(data DESC);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER tr_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_portofele_updated_at BEFORE UPDATE ON portofele FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_categorii_updated_at BEFORE UPDATE ON categorii FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_grupe_updated_at BEFORE UPDATE ON grupe FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_nomenclator_updated_at BEFORE UPDATE ON nomenclator FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_exercitii_updated_at BEFORE UPDATE ON exercitii FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_cheltuieli_updated_at BEFORE UPDATE ON cheltuieli FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function: Get sold portofel
CREATE OR REPLACE FUNCTION get_sold_portofel(
    p_portofel_id INTEGER,
    p_exercitiu_id INTEGER DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
    v_sold NUMERIC(12, 2);
    v_alimentari NUMERIC(12, 2);
    v_cheltuieli NUMERIC(12, 2);
    v_transferuri_in NUMERIC(12, 2);
    v_transferuri_out NUMERIC(12, 2);
BEGIN
    -- Alimentări
    SELECT COALESCE(SUM(suma), 0) INTO v_alimentari
    FROM alimentari
    WHERE portofel_id = p_portofel_id
      AND (p_exercitiu_id IS NULL OR exercitiu_id = p_exercitiu_id);
    
    -- Cheltuieli (doar cele care afectează sold)
    SELECT COALESCE(SUM(ch.suma), 0) INTO v_cheltuieli
    FROM cheltuieli ch
    LEFT JOIN categorii cat ON ch.categorie_id = cat.id
    WHERE ch.portofel_id = p_portofel_id
      AND ch.activ = true
      AND ch.sens = 'Cheltuiala'
      AND ch.neplatit = false
      AND (cat.afecteaza_sold = true OR cat.afecteaza_sold IS NULL)
      AND (p_exercitiu_id IS NULL OR ch.exercitiu_id = p_exercitiu_id);
    
    -- Transferuri primite
    SELECT COALESCE(SUM(suma), 0) INTO v_transferuri_in
    FROM transferuri
    WHERE portofel_dest_id = p_portofel_id
      AND (p_exercitiu_id IS NULL OR exercitiu_id = p_exercitiu_id);
    
    -- Transferuri trimise
    SELECT COALESCE(SUM(suma), 0) INTO v_transferuri_out
    FROM transferuri
    WHERE portofel_sursa_id = p_portofel_id
      AND (p_exercitiu_id IS NULL OR exercitiu_id = p_exercitiu_id);
    
    v_sold := v_alimentari - v_cheltuieli + v_transferuri_in - v_transferuri_out;
    
    RETURN v_sold;
END;
$$ LANGUAGE plpgsql;

-- Function: Autocomplete nomenclator (trigram)
CREATE OR REPLACE FUNCTION autocomplete_nomenclator(
    p_query TEXT,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id INTEGER,
    denumire VARCHAR,
    categorie_id INTEGER,
    categorie_nume VARCHAR,
    grupa_id INTEGER,
    grupa_nume VARCHAR,
    tip_entitate VARCHAR,
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.id,
        n.denumire,
        n.categorie_id,
        c.nume as categorie_nume,
        n.grupa_id,
        g.nume as grupa_nume,
        n.tip_entitate,
        similarity(n.denumire, p_query) as sim
    FROM nomenclator n
    LEFT JOIN categorii c ON n.categorie_id = c.id
    LEFT JOIN grupe g ON n.grupa_id = g.id
    WHERE n.activ = true
      AND (
          n.denumire ILIKE p_query || '%'
          OR n.denumire ILIKE '%' || p_query || '%'
          OR n.denumire % p_query
      )
    ORDER BY
        CASE WHEN n.denumire ILIKE p_query || '%' THEN 0
             WHEN n.denumire % p_query THEN 1
             ELSE 2 END,
        sim DESC,
        n.frecventa_utilizare DESC,
        n.ultima_utilizare DESC NULLS LAST
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
-- ============================================

-- View: Raport zilnic complet
CREATE OR REPLACE VIEW v_raport_zilnic AS
SELECT 
    e.id as exercitiu_id,
    e.data,
    e.activ as exercitiu_activ,
    cat.id as categorie_id,
    cat.nume as categorie,
    cat.culoare as categorie_culoare,
    cat.afecteaza_sold,
    g.id as grupa_id,
    g.nume as grupa,
    COALESCE(n.denumire, ch.denumire_custom) as denumire,
    p.id as portofel_id,
    p.nume as portofel,
    ch.id as cheltuiala_id,
    ch.suma,
    ch.neplatit,
    ch.verificat,
    ch.sens,
    u.username as operator,
    ch.comentarii,
    ch.created_at
FROM cheltuieli ch
JOIN exercitii e ON ch.exercitiu_id = e.id
JOIN portofele p ON ch.portofel_id = p.id
LEFT JOIN nomenclator n ON ch.nomenclator_id = n.id
LEFT JOIN categorii cat ON COALESCE(ch.categorie_id, n.categorie_id) = cat.id
LEFT JOIN grupe g ON COALESCE(ch.grupa_id, n.grupa_id) = g.id
LEFT JOIN users u ON ch.operator_id = u.id
WHERE ch.activ = true
ORDER BY cat.ordine, g.ordine, ch.created_at DESC;

-- View: Solduri portofele pentru exercițiu activ
CREATE OR REPLACE VIEW v_solduri_portofele AS
SELECT 
    p.id as portofel_id,
    p.nume as portofel,
    p.ordine,
    get_sold_portofel(p.id) as sold_total,
    get_sold_portofel(p.id, (SELECT id FROM exercitii WHERE activ = true ORDER BY data DESC LIMIT 1)) as sold_zi_curenta
FROM portofele p
WHERE p.activ = true
ORDER BY p.ordine;

-- View: Sumar categorii pentru exercițiu
CREATE OR REPLACE VIEW v_sumar_categorii AS
SELECT 
    e.id as exercitiu_id,
    e.data,
    cat.id as categorie_id,
    cat.nume as categorie,
    cat.culoare,
    cat.afecteaza_sold,
    COUNT(ch.id) as nr_tranzactii,
    COALESCE(SUM(CASE WHEN ch.neplatit = false THEN ch.suma ELSE 0 END), 0) as total_platit,
    COALESCE(SUM(CASE WHEN ch.neplatit = true THEN ch.suma ELSE 0 END), 0) as total_neplatit,
    COALESCE(SUM(ch.suma), 0) as total
FROM exercitii e
CROSS JOIN categorii cat
LEFT JOIN cheltuieli ch ON ch.exercitiu_id = e.id 
    AND (ch.categorie_id = cat.id OR EXISTS (
        SELECT 1 FROM nomenclator n WHERE n.id = ch.nomenclator_id AND n.categorie_id = cat.id
    ))
    AND ch.activ = true
    AND ch.sens = 'Cheltuiala'
WHERE cat.activ = true
GROUP BY e.id, e.data, cat.id, cat.nume, cat.culoare, cat.afecteaza_sold, cat.ordine
ORDER BY e.data DESC, cat.ordine;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE settings IS 'Configurări sistem inclusiv conexiune Ollama';
COMMENT ON TABLE users IS 'Utilizatori cu autentificare prin cod/card';
COMMENT ON TABLE portofele IS 'Conturi pentru gestiunea numerarului';
COMMENT ON TABLE categorii IS 'Categorii principale: Cheltuieli, Marfă, Salarii, Tips, FormePlata';
COMMENT ON TABLE grupe IS 'Subgrupări pentru categorii';
COMMENT ON TABLE nomenclator IS 'Master data cu AI embeddings pentru autocomplete';
COMMENT ON TABLE exercitii IS 'Zi contabilă - se deschide/închide la 07:00';
COMMENT ON TABLE cheltuieli IS 'Tranzacții principale';
COMMENT ON TABLE transferuri IS 'Transferuri între portofele';
COMMENT ON TABLE alimentari IS 'Sold inițial pentru portofele';
COMMENT ON TABLE chat_history IS 'Istoric conversații cu AI BigBoss';

    COMMENT ON COLUMN nomenclator.embedding IS 'Vector embedding generat cu Ollama (768 dims)';
COMMENT ON COLUMN categorii.afecteaza_sold IS 'Dacă false, nu se scade din sold (ex: FormePlata)';
COMMENT ON COLUMN cheltuieli.neplatit IS 'Pentru marfă neplătită - apare separat în raport';
COMMENT ON COLUMN cheltuieli.activ IS 'Soft delete - nu se șterge fizic';
