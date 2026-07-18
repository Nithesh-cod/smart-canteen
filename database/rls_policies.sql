-- ============================================================================
-- Supabase Row-Level Security policies  (FIX S7)
-- ============================================================================
-- Apply ONCE in the Supabase SQL Editor (as the project owner).
--
-- Why:
--   The frontend uses the Supabase anon key to subscribe to Realtime updates.
--   Without RLS, every anon client streams the full contents of orders,
--   students, and order_items — a permanent, silent PII leak.
--
-- Auth model:
--   This codebase uses its OWN JWT (issued by the Express backend), not
--   Supabase Auth.  The backend connects via the Postgres service role and
--   BYPASSES RLS, so it is unaffected by these policies.  RLS only constrains
--   what an anon Supabase client (e.g. the browser Realtime subscription) can
--   see.  The policy below therefore locks anon out of all sensitive tables
--   and allows public read only on the menu and active offers.
--
-- Verification:
--   After running this file, open the kiosk in an anonymous browser tab and
--   confirm that:
--     • the menu still loads (allowed)
--     • a Realtime subscription to `orders` receives ZERO rows
--     • a Realtime subscription to `students` receives ZERO rows
-- ============================================================================

-- ─── Enable RLS on every table that holds private data ──────────────────────
ALTER TABLE students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites   ENABLE ROW LEVEL SECURITY;

-- ─── menu_items: publicly readable, no anon writes ──────────────────────────
ALTER TABLE menu_items  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS menu_items_public_read ON menu_items;
CREATE POLICY menu_items_public_read
  ON menu_items
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─── offers: publicly readable (only those currently active) ────────────────
ALTER TABLE offers      ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offers_public_read ON offers;
CREATE POLICY offers_public_read
  ON offers
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true
         AND (valid_from  IS NULL OR valid_from  <= NOW())
         AND (valid_until IS NULL OR valid_until >= NOW()));

-- ─── students / orders / order_items / favorites ────────────────────────────
-- No policies are created for anon, so anon gets NO rows under RLS.
-- The Express backend uses the service role and continues to work.

-- (Optional, for a future migration to Supabase Auth.) Uncomment to allow each
-- authenticated user to see their own data via Supabase Auth + RLS:
--
--   CREATE POLICY students_self_read ON students
--     FOR SELECT TO authenticated USING (id = auth.uid());
--
--   CREATE POLICY orders_self_read ON orders
--     FOR SELECT TO authenticated USING (student_id = auth.uid());
--
--   CREATE POLICY order_items_via_order ON order_items
--     FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM orders o
--                    WHERE o.id = order_items.order_id
--                      AND o.student_id = auth.uid()));
--
--   CREATE POLICY favorites_self_rw ON favorites
--     FOR ALL TO authenticated USING (student_id = auth.uid());
