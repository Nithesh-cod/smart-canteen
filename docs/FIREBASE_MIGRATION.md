# Smart Canteen — Supabase/Postgres → Firebase (Firestore) Migration

Status: **in progress**. This doc is the source of truth for the migration
architecture and progress.

## Why

- Supabase free tier **pauses on idle** → the app "needs turning on" before it works.
- Firestore never pauses, and its `onSnapshot` listeners give realtime sync for
  free — which fixes the "orders don't reflect across multiple chef panels" bug
  at the root (every panel that listens gets every change pushed automatically).

## Target architecture (Phase 1)

```
        ┌──────────────────────────────────────────────┐
        │  Browser (React SPA)                          │
        │   • Kiosk / Chef / Owner / Tracking           │
        │   • Firestore onSnapshot listeners  ◄── realtime, single channel
        │   • Firebase JS SDK (read live data)          │
        └───────────────┬───────────────────────────────┘
                        │  HTTPS/REST (writes, payments, auth)
                        ▼
        ┌──────────────────────────────────────────────┐
        │  Express API (unchanged surface)              │
        │   • JWT/bcrypt auth  • Razorpay  • validation │
        │   • Firebase Admin SDK  ◄── all data access   │
        └───────────────┬───────────────────────────────┘
                        │  Firestore (Admin SDK, server key)
                        ▼
        ┌──────────────────────────────────────────────┐
        │  Cloud Firestore (single source of truth)     │
        └──────────────────────────────────────────────┘
        Local thermal printer stays a local agent (cannot run in cloud).
```

Realtime rule: **the browser never writes directly to Firestore.** Writes go
through the Express API (so pricing, points caps, stock, and auth stay
server-authoritative). The browser only *reads* live via Firestore listeners.
Security rules enforce this (see below).

## Firestore data model

Postgres was relational with `order_items` in its own table. Firestore favours
denormalization, so **order items live inline on the order document** — this
also removes the expensive `json_agg` joins the audit flagged.

### `students/{studentId}`  (auto-ID string; was UUID)
| field | type | notes |
|---|---|---|
| name | string | |
| roll_number | string | unique (enforced in app + rules) |
| phone | string | unique |
| email | string \| null | |
| department | string \| null | |
| password_hash | string | bcrypt; **never** sent to clients / never readable via rules |
| role | 'student'\|'chef'\|'admin' | source of truth for authz |
| points | number | |
| tier | 'Bronze'\|'Silver'\|'Gold'\|'Platinum' | |
| total_orders | number | |
| total_spent | number | |
| is_active | boolean | |
| profile_image_url | string \| null | |
| created_at | Timestamp | |
| last_login | Timestamp | |

Sub-collection `students/{id}/favorites/{menuItemId}` → `{ created_at }`.

### `menu_items/{itemId}`  (keep numeric-style IDs as string doc-ids: "1","2",…)
name, description, category, price(number), image_url, is_available(bool),
rating(number), preparation_time(number), is_vegetarian(bool),
stock_quantity(number; -1 = unlimited), created_at, updated_at.

### `orders/{orderId}`  (auto-ID string; was BIGSERIAL)
student_id(string\|null), order_number(string, human-facing), total_amount,
original_amount, points_used, points_earned, status, payment_status,
payment_method, razorpay_order_id, razorpay_payment_id, razorpay_signature,
guest_name, guest_phone, guest_roll, bill_issued_at(Timestamp\|null),
created_at, updated_at,
**items: [{ menu_item_id, item_name, quantity, price }]** (inline array).

### `offers/{offerId}`
title, description, discount_percentage, min_order_amount, is_active,
valid_from, valid_until, created_at.

### `counters/order_number`  (for collision-free sequential order numbers)
`{ seq: number }` — incremented inside the order transaction.

## Hard-parts mapping

| Postgres feature | Firestore replacement |
|---|---|
| `transaction()` (order + atomic stock) | `db.runTransaction()` — read menu docs, verify `stock >= qty`, write decrements + create order atomically |
| Atomic stock `UPDATE … WHERE stock >= qty` | in-transaction read-check-write (transaction retries on contention) |
| `findByIdentifier` (roll OR phone) | two equality queries (or one Firestore OR query) |
| Owner reports: `GROUP BY day/category`, `SUM` | query by `created_at` range → aggregate in the controller (canteen scale is small); or Firestore `sum()`/`count()` aggregation queries |
| RLS policies | Firestore Security Rules (clients read-only; writes server-only; `password_hash` never exposed) |
| Supabase Realtime / Socket.IO | Firestore `onSnapshot` listeners (single channel) |
| BIGSERIAL / SERIAL / UUID ids | Firestore string doc-ids; `order_number` stays the human id |

## Security rules (intent)

- `students`: a client may read **only their own** doc, and **never**
  `password_hash` (kept in a way rules can't leak; writes server-only).
- `menu_items`, `offers`: public read; writes server-only.
- `orders`: read allowed for the owning student or a matching guest-order id;
  writes server-only.
- Chef/Owner dashboards read via the **Admin SDK** through the API, or via
  authenticated Firebase custom-token sessions (Phase 1b) — TBD; simplest first
  cut has dashboards read through the API and use listeners scoped by rules.

## Phased plan / checklist

- [x] Firestore data-model design (this doc)
- [x] Backend Firebase Admin config (`backend/src/config/firebase.js`)
- [x] Frontend Firebase client config (`frontend/src/services/firebase.ts`)
- [x] Port `Student` model → Firestore (live-verified)
- [x] Port `MenuItem` model → Firestore (live-verified)
- [x] Port `Order` model → Firestore (live-verified)
- [x] Order-create transaction with atomic stock reserve — **race-tested, no oversell**
- [x] Owner report aggregations on Firestore (getStats / getRevenueData / getTopSelling)
- [x] Seed script: menu + admin/chef/student accounts → Firestore (live-verified)
- [x] Controllers: rewrite pg `transaction()` blocks (payment finalise/refund) → Firestore
- [x] Remove `config/database` from the boot path — **server boots on Firestore**
- [x] Offers ported to Firestore (`Offer` model)
- [x] End-to-end HTTP smoke test: health, menu, login, /me, dashboard, order+stock
- [x] Frontend: replaced Supabase `subscribeToTable` with Firestore `onSnapshot`
      in Chef / Kiosk / Owner; deleted `supabase.ts`; removed the dep; build passes
- [x] Chef panel consolidated to a SINGLE Firestore realtime source (fixes the
      "orders don't show on other chef panels" bug); order ids are now strings
- [x] Security rules deployed (firestore.rules) — clients read-only, writes
      server-only; orders/students gated by a Firebase Auth role claim. Verified
      live: anon can read menu but NOT orders/students (S7 PII leak closed).
- [x] Firebase custom-token auth: backend GET /api/auth/firebase-token +
      AdminAuthGate signs staff into Firebase Auth so dashboard onSnapshot reads
      are authorized. (Uses cert() signing — no IAM Credentials API needed.)
- [ ] **USER ACTION**: enable Firebase Authentication in the console (one click)
      so signInWithCustomToken works — until then dashboards fall back to 30s poll.
- [x] Multilingual chef announcer (English/Tamil/Hindi/Marathi) — offline
      per-language templates, sequential queue, voice detection + "no voice"
      warning, tap-to-preview on language select. Text verified in all 4 langs.
- [x] Live browser test: two chef panels sync via Firestore; ACCEPT on one moved
      the order to PREPARING on the other automatically. **Multi-chef bug fixed.**
- [x] Migrated `print-agent.js` from Supabase Realtime → Firestore listener
      (Admin SDK; skips startup backlog; session dedup). Verified live: flipping
      an order to paid triggered the print pipeline (physical printer absent here).
- [ ] End-to-end re-verify once Firebase Authentication is enabled

## Cleanup note
`backend/.env` still has SUPABASE_URL / SUPABASE_ANON_KEY / DATABASE_URL — these
are now UNUSED (frontend, backend, and print-agent are all off Supabase/pg).
Safe to delete them from the env whenever convenient.

## What the user must provide (critical path — I cannot create these)

See the "Firebase project setup" section handed over in chat. In short:
1. A Firebase project with **Cloud Firestore** enabled (Native mode).
2. **Web app config** (`apiKey`, `authDomain`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`) → frontend `.env` as `VITE_FIREBASE_*`.
3. A **service-account JSON** (Project settings → Service accounts →
   Generate new private key) → backend, referenced by env (never committed).
