-- Migration: Competitor Price Comparison
-- Created: 2026-02-26

CREATE TABLE IF NOT EXISTS competitor_sites (
    id SERIAL PRIMARY KEY,
    nume VARCHAR(100) NOT NULL,
    url VARCHAR(500) NOT NULL,
    scraper_key VARCHAR(50) NOT NULL,
    activ BOOLEAN DEFAULT true,
    last_scraped_at TIMESTAMP,
    scrape_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS competitor_products (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES competitor_sites(id) ON DELETE CASCADE,
    categorie VARCHAR(200),
    denumire VARCHAR(500) NOT NULL,
    pret NUMERIC(10,2),
    unitate VARCHAR(100),
    extra JSONB,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS competitor_price_changes (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES competitor_sites(id) ON DELETE CASCADE,
    denumire VARCHAR(500) NOT NULL,
    pret_vechi NUMERIC(10,2),
    pret_nou NUMERIC(10,2),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial competitor sites
INSERT INTO competitor_sites (nume, url, scraper_key) VALUES
    ('Restaurant Margineni', 'https://restaurantmargineni.ro/meniu/', 'margineni'),
    ('La Nuci', 'https://www.lanuci.ro/online-ordering', 'lanuci')
ON CONFLICT DO NOTHING;
