-- ============================================================================
-- Migration 005 — Allow the 'refunding' transient payment_status
-- ============================================================================
-- Round 5's Y6 introduced a transient payment_status='refunding' state so
-- concurrent refund clicks can claim the row atomically via
-- `UPDATE … WHERE payment_status='paid'`. The original schema.sql CHECK
-- constraint only allowed ('pending','paid','failed','refunded') and rejected
-- every claim with `violates check constraint "orders_payment_status_check"`
-- — every refund attempt failed at the DB layer.
--
-- This migration drops the old constraint and re-adds it with the transient
-- state included. Idempotent — safe to re-run.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_status_check'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_payment_status_check;
  END IF;

  ALTER TABLE orders
    ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('pending','paid','refunding','failed','refunded'));
END $$;
