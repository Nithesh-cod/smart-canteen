// ============================================================================
// BUSINESS DETAILS — shown on the legal pages Razorpay reviews
// ============================================================================
// Razorpay's website review checks that the business name, contact details and
// policies on the site MATCH what was submitted during account activation. A
// mismatch is a rejection on its own, separately from the policy text itself.
//
// Everything the reviewer looks at is collected here rather than scattered
// through five page components, so there is one place to correct and no risk of
// the name reading differently on two pages.
//
// ── FILL THESE FOUR IN BEFORE SUBMITTING ────────────────────────────────────
// Each is marked NEEDS_REAL_VALUE. The pages render a visible warning while any
// placeholder remains, so an unfinished page cannot be submitted by accident.
// ============================================================================

export const BUSINESS = {
  /** EXACTLY as submitted to Razorpay during activation — not a shortened or
   *  friendlier version. This is the field most often mismatched. */
  legalName: 'NEEDS_REAL_VALUE — legal business name as given to Razorpay',

  /** The trading name students see. May differ from the legal name. */
  tradingName: 'Smart Canteen',

  /** Monitored inbox. Reviewers sometimes email it to check it is real. */
  email: 'NEEDS_REAL_VALUE — support email',

  /** Include the country code. */
  phone: 'NEEDS_REAL_VALUE — contact phone',

  /** Full postal address of the canteen, including PIN code. */
  address: 'NEEDS_REAL_VALUE — full address with PIN code',

  /** Public site. Used for canonical links in the policy text. */
  website: 'https://smart-canteen-pi-gray.vercel.app',

  /** Shown as the effective date on every policy page. */
  lastUpdated: '17 August 2026',

  /**
   * Refund rule in plain words. The default matches how the system actually
   * behaves — stock is held when an item enters a cart and released on cancel,
   * and the kitchen accepting an order is the point of no return — so changing
   * this text means changing the behaviour too, not just the wording.
   */
  cancellationCutoff:
    'until the kitchen accepts the order; once preparation begins the order cannot be cancelled',
} as const;

/** True while any field still carries its placeholder. */
export const hasPlaceholders = (): boolean =>
  Object.values(BUSINESS).some((v) => typeof v === 'string' && v.startsWith('NEEDS_REAL_VALUE'));
