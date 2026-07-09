-- ═══════════════════════════════════════════════════════════
--  Smart Shelf — Multi-Holding Data Warehouse
--  Supabase Migration: BigQuery Architecture Model
--  Run this once in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ── 1. Universal Products (master_catalog) ─────────────────
-- Add enrichment tracking columns + new architecture fields
ALTER TABLE master_catalog
  ADD COLUMN IF NOT EXISTS off_attempted  BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enrich_failed  BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_source    TEXT      DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS package_type   TEXT,
  ADD COLUMN IF NOT EXISTS weight_g       NUMERIC,
  ADD COLUMN IF NOT EXISTS width_cm       NUMERIC,
  ADD COLUMN IF NOT EXISTS height_cm      NUMERIC,
  ADD COLUMN IF NOT EXISTS depth_cm       NUMERIC,
  ADD COLUMN IF NOT EXISTS images         JSONB,
  ADD COLUMN IF NOT EXISTS vispera_id     TEXT,
  ADD COLUMN IF NOT EXISTS brand_id       TEXT,
  ADD COLUMN IF NOT EXISTS producer_id    TEXT;

-- Index to speed up the cron query (products not yet enriched)
CREATE INDEX IF NOT EXISTS idx_master_catalog_off_attempted
  ON master_catalog (off_attempted)
  WHERE off_attempted IS FALSE OR off_attempted IS NULL;

-- ── 2. Universal Categories (Vispera Model) ────────────────
CREATE TABLE IF NOT EXISTS universal_categories (
  vispera_category_id TEXT PRIMARY KEY,
  category_name       TEXT NOT NULL
);

INSERT INTO universal_categories (vispera_category_id, category_name) VALUES
  ('GROCERY_STORE', 'GROCERY STORE'),
  ('SWEET', 'SWEET'),
  ('ALCOHOL', 'ALCOHOL'),
  ('CLEANING', 'CLEANING'),
  ('DAIRYS', 'DAIRYS'),
  ('FROZEN', 'FROZEN'),
  ('BREAKFAST', 'BREAKFAST'),
  ('SNACKS', 'SNACKS'),
  ('BABY', 'BABY'),
  ('PET', 'PET'),
  ('DESSERT', 'DESSERT'),
  ('CEREALS', 'CEREALS'),
  ('CANNED_FOOD', 'CANNED FOOD'),
  ('DETERGENTS', 'DETERGENTS'),
  ('DRINKS', 'DRINKS'),
  ('HEALTHY', 'HEALTHY'),
  ('PAPER_ITEMS', 'PAPER ITEMS')
ON CONFLICT (vispera_category_id) DO NOTHING;

-- ── 3. Product ↔ Universal Category Mapping ────────────────
CREATE TABLE IF NOT EXISTS product_universal_category_mapping (
  ean                 TEXT REFERENCES master_catalog(ean) ON DELETE CASCADE,
  vispera_category_id TEXT REFERENCES universal_categories(vispera_category_id),
  PRIMARY KEY (ean, vispera_category_id)
);

-- ── 4. Brands & Producers ──────────────────────────────────
CREATE TABLE IF NOT EXISTS brands_producers (
  brand_id      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  producer_id   TEXT,
  brand_name    TEXT NOT NULL,
  producer_name TEXT
);

-- ── 5. Holding SKU Catalog (retailer_catalog extended) ─────
-- Add Holding-Specific fields to the existing retailer_catalog
ALTER TABLE retailer_catalog
  ADD COLUMN IF NOT EXISTS local_product_name  TEXT,
  ADD COLUMN IF NOT EXISTS local_category_name TEXT,
  ADD COLUMN IF NOT EXISTS is_active_holding   BOOLEAN DEFAULT TRUE;

-- ── 6. Staging: Levantamiento ──────────────────────────────
CREATE TABLE IF NOT EXISTS staging_levantamiento (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ean         TEXT NOT NULL,
  holding_id  TEXT NOT NULL,
  dmu         TEXT,
  category    TEXT,
  auditor     TEXT,
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. Staging: Unmatched EANs ─────────────────────────────
CREATE TABLE IF NOT EXISTS staging_unmatched_eans (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ean                   TEXT NOT NULL,
  holding_id            TEXT,
  dmu_category          TEXT,
  api_raw_name          TEXT,
  api_brand             TEXT,
  api_weight            TEXT,
  api_universal_category TEXT,
  confidence_score      TEXT,
  status                TEXT DEFAULT 'PENDING_ENRICHMENT'
);

-- ── 8. Vispera Submission Batch ────────────────────────────
CREATE TABLE IF NOT EXISTS vispera_submission_batch (
  batch_id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  suggested_vispera_name TEXT,
  brand                  TEXT,
  universal_category     TEXT,
  ean_list               JSONB DEFAULT '[]'::jsonb,
  status                 TEXT DEFAULT 'PENDING_REVIEW',
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── Verify all columns ─────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'master_catalog'
ORDER BY ordinal_position;
