import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { store } from './store/store'
import { ToastProvider } from './components/common/Toast'
import AdminAuthGate from './components/common/AdminAuthGate'
import OwnerDashboard from './pages/OwnerDashboard'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <AdminAuthGate
            requiredRoles={['admin']}
            dashboardName="Owner Dashboard"
            autoLoginRoll={import.meta.env.VITE_ADMIN_ROLL}
          >
            <OwnerDashboard />
          </AdminAuthGate>
        </ToastProvider>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
)
