# Smart Canteen — Presentation Runbook

Keep this open on your phone / second screen during the talk.

## Logins (all password: `test1234`)
| Role | Roll number | Opens |
|---|---|---|
| Owner | `OWNER001` | `/owner` |
| Chef | `CHEF001` | `/chef` |
| Student | `STU001` | kiosk (sign-in) |

---

## Pre-flight (10 min before)
- [ ] App reachable (deployed URL **or** local — see below).
- [ ] Open **3 browser windows/tabs**, one per surface:
  1. **Kiosk** → `/`
  2. **Chef** → `/chef` (log in as `CHEF001`)
  3. **Owner** → `/owner` (log in as `OWNER001`)
- [ ] (Optional) A **4th tab** on `/chef` to show multi-panel sync.
- [ ] Chef panel: pick the announcer language (top-right) and confirm it speaks a
      sample. If Tamil/Marathi are silent, use English or Chrome/Edge.
- [ ] Razorpay in **Test mode**; test card `4111 1111 1111 1111`, any future
      expiry, any CVV.

## Local fallback (if the deploy misbehaves)
```bash
cd backend && npm start
```
```bash
cd frontend && npm run dev
```
Open `http://localhost:3000`. This is verified working — use it if the cloud hiccups.

---

## The demo (≈5 min)

**1. The problem (15s)** — "Paper tokens, long queues, no live view for the
kitchen. Smart Canteen is a real-time canteen ordering system on Firebase."

**2. Student orders (60s)** — On the **Kiosk**:
- Browse the menu, add 2–3 items to the cart.
- (Optional) Click **Sign In** → log in as `STU001` to show points earning.
- Open cart → **Checkout** → pay with the Razorpay **test card**.
- Say: "Pricing and stock are validated server-side — the client can't tamper."

**3. Kitchen sees it instantly (45s)** — Switch to the **Chef** window:
- The new order appears **the moment it's placed** (Firestore realtime) and the
  panel **announces it aloud** in the chosen language.
- If you have the 4th chef tab: point out it appears on **both** — "any number
  of kitchen screens stay in sync."

**4. Fulfilment (30s)** — On Chef: click **Accept** → **Mark Ready**.
- Point to the other chef tab / owner updating on its own.
- "One receipt prints at the counter when it's ready — no duplicates."

**5. Owner analytics + staff (60s)** — Switch to **Owner**:
- Dashboard: revenue, orders, student tiers updating live.
- Open the **Staff** tab → create a chef account live → "no CLI, no code."

**6. Under the hood (30s)** — "Node/Express API, Cloud Firestore for data +
realtime, Firebase Auth with role-based security rules, Razorpay payments, a
local thermal-printer agent, and a Jest/CI test suite — 33 tests green."

---

## Quick troubleshooting
- **Dashboards not updating live** → confirm Firebase **Authentication** is
  enabled (Anonymous). They fall back to a 30s refresh otherwise.
- **Announcer silent** → that language's voice isn't installed; switch to English
  or use Chrome/Edge.
- **"Session expired" on a dashboard** → the JWT expired; just log in again.
- **Payment webhook not confirming** → the Razorpay webhook secret must match
  `RAZORPAY_WEBHOOK_SECRET` on the backend.
