-- ============================================================================
-- Migration 002 — Security & correctness fixes
-- ============================================================================
-- FIX S1/S2 (real auth), FIX B2 (order sequence), FIX B3 (receipt guard),
-- FIX C3 (tier index), FIX C4 (razorpay lookup index).
-- All statements are idempotent — safe to re-run.
-- ============================================================================

-- Trigram extension — fuzzy menu search (used by the ATLAS resolver)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── FIX S1/S2 — real authentication ─────────────────────────────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(72);

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'student';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_role_check'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_role_check
      CHECK (role IN ('student','chef','admin'));
  END IF;
END $$;

-- ─── FIX B3 — single-receipt guard ───────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS receipt_printed BOOLEAN DEFAULT FALSE;

-- ─── FIX B2 — collision-free order numbers ───────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_seq START 1000 INCREMENT 1;

-- ─── FIX C4 — webhook order lookup index ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_razorpay ON orders(razorpay_order_id);

-- ─── FIX C3 — admin tier filter index ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_tier ON students(tier);
