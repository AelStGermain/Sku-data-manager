-- ═══════════════════════════════════════════════════════════
--  Smart Shelf — Supabase Migration
--  Adds enrichment tracking columns to master_catalog
--  Run this once in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Add enrichment tracking columns (safe: does nothing if they already exist)
ALTER TABLE master_catalog
  ADD COLUMN IF NOT EXISTS off_attempted  BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enrich_failed  BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_source    TEXT      DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS package_type   TEXT,
  ADD COLUMN IF NOT EXISTS weight_g       NUMERIC,
  ADD COLUMN IF NOT EXISTS width_cm       NUMERIC,
  ADD COLUMN IF NOT EXISTS height_cm      NUMERIC,
  ADD COLUMN IF NOT EXISTS depth_cm       NUMERIC;

-- Index to speed up the cron query (products not yet enriched)
CREATE INDEX IF NOT EXISTS idx_master_catalog_off_attempted
  ON master_catalog (off_attempted)
  WHERE off_attempted IS FALSE OR off_attempted IS NULL;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'master_catalog'
ORDER BY ordinal_position;
