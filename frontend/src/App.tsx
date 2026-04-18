import { Routes, Route } from 'react-router-dom'
import StudentKiosk from './pages/StudentKiosk'
import ChefDisplay from './pages/ChefDisplay'
import OwnerDashboard from './pages/OwnerDashboard'
import OrderTracking from './pages/OrderTracking'
import AdminAuthGate from './components/common/AdminAuthGate'

function App() {
  return (
    <div style={{ fontFamily: "'Rajdhani', sans-serif", minHeight: '100vh' }}>
      <Routes>
        {/* ── Student kiosk (public) ───────────────────────────────── */}
        <Route path="/" element={<StudentKiosk />} />
        <Route path="/track" element={<OrderTracking />} />
        <Route path="/track/:orderNumber" element={<OrderTracking />} />

        {/* ── Chef display (requires chef or admin role) ────────────── */}
        <Route
          path="/chef"
          element={
            <AdminAuthGate
              requiredRoles={['chef', 'admin']}
              dashboardName="Chef Display"
              autoLoginRoll={import.meta.env.VITE_CHEF_ROLL}
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
              autoLoginRoll={import.meta.env.VITE_ADMIN_ROLL}
            >
              <OwnerDashboard />
            </AdminAuthGate>
          }
        />
      </Routes>
    </div>
  )
}

export default App
