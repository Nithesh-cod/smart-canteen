-- ============================================================================
-- Migration 004 — Bill issuance witness (FIX Z3)
-- ============================================================================
-- Adds a timestamp that records when an order's receipt was first produced
-- (printed or returned as a PDF). The idempotent verifyPayment branch reads
-- this column to short-circuit repeated calls so a kiosk refresh or a
-- network-blip retry doesn't issue a fresh receipt for every hit.
-- finalisePayment (verify path) and the verify idempotent branch both set
-- it; the webhook path runs with skipBill: true and leaves it null so a
-- follow-up verify can still actually produce the receipt.
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bill_issued_at TIMESTAMP NULL;
