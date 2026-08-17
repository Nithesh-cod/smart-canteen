import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import StudentKiosk    from './pages/StudentKiosk'
import UnifiedLogin    from './pages/UnifiedLogin'
import AdminAuthGate   from './components/common/AdminAuthGate'
import { Skeleton }    from './components/common/states'

// The kiosk is the landing route, so it stays in the initial bundle. Everything
// behind a role gate is split out: a student's phone should not download and
// parse the kitchen display, the owner dashboard and a charting library it will
// never open. Those three were the bulk of a ~1MB single chunk that had to be
// compiled before the first pixel on a phone CPU.
const ChefDisplay    = lazy(() => import('./pages/ChefDisplay'))
const OwnerDashboard = lazy(() => import('./pages/OwnerDashboard'))
const OrderTracking  = lazy(() => import('./pages/OrderTracking'))
// Policy pages Razorpay's website review looks for. Lazy because a customer
// ordering lunch should not download them, but they must be real routes with
// their own URLs — a reviewer needs to link to each one directly.
const LegalPage      = lazy(() => import('./pages/LegalPage'))

const RouteFallback = () => (
  <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
    <div className="lg-surface" style={{ padding: 22, width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton width="55%" height={16} />
      <Skeleton width="85%" height={12} />
      <Skeleton width="40%" height={12} />
    </div>
  </div>
)

function App() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", minHeight: '100vh' }}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* ── Student kiosk (public) ───────────────────────────────── */}
          <Route path="/"                  element={<StudentKiosk />} />
          <Route path="/track"             element={<OrderTracking />} />
          <Route path="/track/:orderNumber" element={<OrderTracking />} />

          {/* ── Unified login (all roles — routes by role after sign-in) ─ */}
          <Route path="/login"             element={<UnifiedLogin />} />

          {/* ── Policy pages (public, required for payment-gateway review) ─ */}
          <Route path="/terms"    element={<LegalPage slug="terms" />} />
          <Route path="/privacy"  element={<LegalPage slug="privacy" />} />
          <Route path="/refunds"  element={<LegalPage slug="refunds" />} />
          <Route path="/shipping" element={<LegalPage slug="shipping" />} />
          <Route path="/contact"  element={<LegalPage slug="contact" />} />

          {/* ── Chef display (requires chef or admin role) ────────────── */}
          <Route
            path="/chef"
            element={
              <AdminAuthGate
                requiredRoles={['chef', 'admin']}
                dashboardName="Chef Display"
              >
                <ChefDisplay />
              </AdminAuthGate>
            }
          />

          {/* ── Owner dashboard (requires admin role) ────────────────── */}
          <Route
            path="/owner"
            element={
              <AdminAuthGate
                requiredRoles={['admin']}
                dashboardName="Owner Dashboard"
              >
                <OwnerDashboard />
              </AdminAuthGate>
            }
          />
        </Routes>
      </Suspense>
    </div>
  )
}

export default App
