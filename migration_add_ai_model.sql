-- Migration: Add ai_model column to recomandari_apeluri table
-- Run this SQL in your PostgreSQL database

-- Step 1: Add ai_model column
ALTER TABLE recomandari_apeluri
ADD COLUMN IF NOT EXISTS ai_model VARCHAR(20) DEFAULT 'Claude';

-- Step 2: Set NOT NULL constraint
ALTER TABLE recomandari_apeluri
ALTER COLUMN ai_model SET NOT NULL;

-- Step 3: Update existing records to have 'Claude' as default
UPDATE recomandari_apeluri
SET ai_model = 'Claude'
WHERE ai_model IS NULL;

-- Step 4: Drop old unique constraint on data (if exists)
-- Note: You may need to check the actual constraint name in your database
-- Run: SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'recomandari_apeluri' AND constraint_type = 'UNIQUE';
ALTER TABLE recomandari_apeluri DROP CONSTRAINT IF EXISTS recomandari_apeluri_data_key;

-- Step 5: Add composite unique constraint on (data, ai_model)
ALTER TABLE recomandari_apeluri
ADD CONSTRAINT unique_data_ai_model UNIQUE (data, ai_model);

-- Step 6: Add a check constraint to ensure only valid values
ALTER TABLE recomandari_apeluri
ADD CONSTRAINT check_ai_model CHECK (ai_model IN ('Claude', 'Ollama'));

-- Step 7: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_recomandari_apeluri_ai_model ON recomandari_apeluri(ai_model);
CREATE INDEX IF NOT EXISTS idx_recomandari_apeluri_data_ai_model ON recomandari_apeluri(data, ai_model);
