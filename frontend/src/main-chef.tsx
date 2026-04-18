import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { store } from './store/store'
import { ToastProvider } from './components/common/Toast'
import AdminAuthGate from './components/common/AdminAuthGate'
import ChefDisplay from './pages/ChefDisplay'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <AdminAuthGate
            requiredRoles={['chef', 'admin']}
            dashboardName="Chef Display"
            autoLoginRoll={import.meta.env.VITE_CHEF_ROLL}
          >
            <ChefDisplay />
          </AdminAuthGate>
        </ToastProvider>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
)
