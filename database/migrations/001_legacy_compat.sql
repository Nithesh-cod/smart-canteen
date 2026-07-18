-- ============================================================================
-- Migration 001 — Legacy compatibility
-- ============================================================================
-- Brings databases created before the schema refactor up to the baseline that
-- the application code expects. Replaces the old setTimeout auto-migration that
-- used to live in backend/src/config/database.js (FIX B4).
-- All statements are idempotent — safe to re-run.
-- ============================================================================

-- stock_quantity on menu_items (-1 = unlimited)
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT -1;

-- Drop the original 4-value category CHECK — categories are now free-form
ALTER TABLE menu_items
  DROP CONSTRAINT IF EXISTS menu_items_category_check;

-- Guest checkout columns on orders (no-login student checkout)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS guest_name  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS guest_roll  VARCHAR(50);

-- offers table — column widths unified with database/schema.sql (was drifting)
CREATE TABLE IF NOT EXISTS offers (
    id                  SERIAL PRIMARY KEY,
    title               VARCHAR(255)  NOT NULL,
    description         TEXT          DEFAULT '',
    discount_percentage DECIMAL(5,2),
    discount_amount     DECIMAL(8,2),
    min_order_amount    DECIMAL(8,2)  DEFAULT 0,
    valid_from          TIMESTAMPTZ,
    valid_until         TIMESTAMPTZ,
    is_active           BOOLEAN       DEFAULT true,
    created_at          TIMESTAMPTZ   DEFAULT NOW()
);
