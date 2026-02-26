-- Migration v2: Add Ollama embeddings to competitor_products
-- Run: docker exec -i cheltuieli_db psql -U cheltuieli_user -d cheltuieli < migration_competitori_v2.sql

ALTER TABLE competitor_products
    ADD COLUMN IF NOT EXISTS embedding JSONB;

COMMENT ON COLUMN competitor_products.embedding IS
    'Ollama embedding vector stored as JSON array. Dimension depends on configured model.';
