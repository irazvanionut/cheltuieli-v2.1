-- Cleanup script: Delete old recomandari data before re-uploading
-- This ensures clean data without null telefon/data/ora fields

-- Option 1: Delete specific dates
DELETE FROM recomandari_apeluri WHERE data = '2026-01-01';
DELETE FROM recomandari_apeluri WHERE data = '2026-01-03';

-- Option 2: Delete ALL recomandari (use this if you want to start fresh)
-- TRUNCATE TABLE recomandari_apeluri;

-- Verify deletion
SELECT data, ai_model, total_conversatii FROM recomandari_apeluri ORDER BY data DESC;
