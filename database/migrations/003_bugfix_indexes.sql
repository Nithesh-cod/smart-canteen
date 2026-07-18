-- ============================================================================
-- Migration 003 — Bug-fix indexes
-- ============================================================================
-- [C1]  GET /api/students/orders now filters by student_id in SQL — index
--       speeds up paginated history reads.
-- [H2]  Razorpay webhook now looks orders up by razorpay_order_id directly.
--       The index was added in 002 (idx_orders_razorpay); a duplicate name is
--       included here only for completeness and is a no-op (IF NOT EXISTS).
-- All statements are idempotent — safe to re-run.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_student_id ON orders(student_id);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay   ON orders(razorpay_order_id);
