# Smart Canteen — Production Deployment Guide

Architecture in production:

```
  Vercel (React SPA)  ──/api rewrite──▶  Render (Express API)  ──▶  Cloud Firestore
        │                                       ▲
        └── Socket.IO (direct) ─────────────────┘
  Local Windows PC:  print-agent.js  ──▶  Firestore listener  ──▶  thermal printer
```

Data + realtime + auth all live in **Firebase**. The Express API is stateless
and talks to Firestore via the Admin SDK. The thermal printer stays on a local
PC (it can't run in the cloud).

---

## 0. Secrets — generate fresh ones

Never commit real secrets. Generate strong values:

```bash
node -e "const c=require('crypto');['JWT_SECRET','JWT_REFRESH_SECRET','RAZORPAY_WEBHOOK_SECRET'].forEach(k=>console.log(k+'='+c.randomBytes(48).toString('base64url')))"
```

Fresh values were already written to your local `backend/.env` — you can copy
those into Render, or generate new ones. **Do not** reuse the old
`..._change_this_in_production_2024` defaults.

---

## 1. Backend → Render

1. New **Web Service** → connect the GitHub repo → root directory `backend`.
   (Render reads `render.yaml` **at the repository root** — it does not look in
   subdirectories. The file sets `rootDir: backend` so the build and start
   commands run inside `backend/`.)

   `render.yaml` also declares a **Key Value (Redis)** service and wires
   `REDIS_URL` into the web service automatically. Accept it — it is not
   optional. Cart stock holds and Socket.IO fanout are both shared state, and
   the server **refuses to boot in production without `REDIS_URL`** on purpose:
   two instances each keeping a private stock count would oversell every
   tracked item, and sockets emitted on one instance would never reach clients
   connected to the other.

   The blueprint asks for `plan: starter` with `numInstances: 1`, in the
   **Singapore** region — Render's closest to India. Oregon adds roughly 250ms
   round-trip to every request, and since add-to-cart now reserves stock on the
   server, that is felt on every tap.

   Deliberately not the free plan: it spins the instance down when idle, which
   drops websockets and strands in-flight stock holds. **Both the web service
   and the Key Value store are paid** — check pricing before deploying.

   To scale out later, raise `numInstances`. The Redis adapter and the shared
   stock authority are already wired, so nothing else changes.

> **Create this as a Blueprint, not a Web Service.** Render only reads
> `render.yaml` for Blueprints — `New → Blueprint`. Creating a Web Service by
> hand ignores the file completely: no Key Value store, no `REDIS_URL`, no
> `NODE_ENV=production`, and Render auto-detects `yarn` even though this repo
> uses npm. The result still boots and looks healthy, which is what makes it
> dangerous — it would be running the single-process stock driver with dev
> rate limits.

2. In **Environment**, add these (render.yaml lists them as comments too):
   - `FIREBASE_SERVICE_ACCOUNT` → paste the **entire** service-account JSON as one
     value (the same file as `backend/serviceAccountKey.json`). `config/firebase`
     reads this in production. **Do not** use `GOOGLE_APPLICATION_CREDENTIALS` on
     Render — there's no file to point at; the inline JSON var is the way.
   - `FIREBASE_PROJECT_ID` → `smart-canteen-64c7e`
   - `JWT_SECRET`, `JWT_REFRESH_SECRET` → from step 0
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` → from the Razorpay dashboard
   - `RAZORPAY_WEBHOOK_SECRET` → from step 0 (must match the webhook, see §4)
   - `FRONTEND_URLS` → your Vercel URL, e.g. `https://smart-canteen.vercel.app`
   - `CANTEEN_NAME` / `CANTEEN_COLLEGE` / `CANTEEN_ADDRESS` / `CANTEEN_GSTIN` / `CANTEEN_PHONE`
   - `CART_HOLD_TTL_SECONDS` *(optional, default 600)* — how long an item stays
     reserved after someone adds it to a cart before the sweeper returns it.
3. Deploy. Confirm `https://<render-url>/health` returns `{ status: "success" }`.
   The boot log should also show `Redis connected — stock authority is Redis`
   and `Redis adapter active`. If it says `No REDIS_URL`, stop and fix it before
   taking orders.
4. Note the Render URL — it must match `frontend/vercel.json` and
   `frontend/.env.production` `VITE_SOCKET_URL`.

> The server **hard-stops on boot in production** if `RAZORPAY_WEBHOOK_SECRET`
> or `REDIS_URL` is unset. Both are intentional: a missing webhook secret would
> 500 every webhook and trigger a Razorpay retry storm, and a missing Redis
> would silently oversell stock. A crash on boot is the cheapest possible
> failure for either.

### Creating the first staff account

Nothing in the UI can mint an admin or chef login — the dashboards are gated and
signup only ever creates students. After the backend is live, run this **once**
from your machine with `backend/.env` pointing at the production Firebase
project:

```
npm run create-admin -- --name "Canteen Owner" --roll OWNER001 --phone 9999999999 --password "<strong password>" --role admin
```

Repeat with `--role chef` for the kitchen account. Re-running with an existing
roll number resets that account's password instead of creating a duplicate.

---

## 2. Frontend → Vercel

1. Import the repo → root directory `frontend` → framework Vite → build
   `npm run build` → output `dist`.
2. Env vars: the public `VITE_FIREBASE_*` + `VITE_RAZORPAY_KEY_ID` are already in
   `frontend/.env.production` (committed — they're public by design). If you host
   the backend somewhere other than the current Render URL, update
   `VITE_SOCKET_URL` there and the rewrite target in `frontend/vercel.json`.
3. Deploy. `vercel.json` rewrites `/api/*` → Render and serves the SPA for
   everything else.

---

## 3. Firebase

- **Firestore security rules** are already deployed. To redeploy after edits:
  `firebase deploy --only firestore:rules` (needs `firebase login`), or re-run the
  Admin-SDK release used during the migration.
- **Authentication**: already enabled (Anonymous provider). Custom-token sign-in
  works from any origin, so no authorized-domain change is required; add your
  Vercel domain under Authentication → Settings → Authorized domains anyway if you
  later add OAuth providers.
- **Billing**: the free **Spark** plan covers Firestore at canteen volume. Move to
  **Blaze** only if you later add Cloud Functions or exceed free quotas.
- **Seed** the production DB once: set `GOOGLE_APPLICATION_CREDENTIALS` locally and
  run `npm run seed:firebase`, or create the owner via `npm run create-admin`.

---

## 4. Razorpay webhook (critical)

1. Razorpay Dashboard → Settings → **Webhooks** → Add.
2. URL: `https://<render-url>/api/payments/webhook`
3. Active event: **`payment.captured`**
4. Secret: the **same** value as `RAZORPAY_WEBHOOK_SECRET` on Render (step 0).
   If these don't match, every webhook fails signature verification.

---

## 5. Local print-agent (on the PC with the printer)

1. Put `serviceAccountKey.json` in `backend/` (gitignored).
2. `backend/.env`: `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json`,
   `FIREBASE_PROJECT_ID=smart-canteen-64c7e`, `PRINTER_TYPE=windows`,
   `PRINTER_NAME=<your POS printer name>`.
3. `cd backend && node print-agent.js` — it prints a receipt whenever an order
   flips to `paid`. Keep it running (Task Scheduler on boot works well).

---

## 6. Post-deploy smoke test

- `GET /health` on Render → 200.
- Load the Vercel site → menu appears (Firestore public read).
- Log into `/owner` and `/chef` with a seeded account → dashboards load with
  **live** updates (Firebase Auth custom token authorizes the realtime reads).
- Place a test order → it appears on every open chef panel instantly.
- Run a Razorpay test payment → webhook marks it paid; the local print-agent prints.

---

## Security checklist
- [ ] Strong `JWT_SECRET` / `JWT_REFRESH_SECRET` set on Render (not the defaults).
- [ ] `RAZORPAY_WEBHOOK_SECRET` matches the Razorpay webhook.
- [ ] `serviceAccountKey.json` is **never** committed (it's gitignored).
- [ ] Firestore rules deployed (clients read-only; orders/students gated by role).
- [ ] Use `rzp_live_*` keys only when going live with real payments.
