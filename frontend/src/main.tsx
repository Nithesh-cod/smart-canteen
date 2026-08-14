import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { store } from './store/store'
import { ToastProvider } from './components/common/Toast'
import App from './App'
import MobileApp from './MobileApp'
import { IS_NATIVE } from './utils/constants'
import './index.css'

// One bundle serves both the website and the Android app; the shell is chosen
// at runtime from whether Capacitor injected itself (see utils/constants).
//
// Web opens on the public kiosk — a counter terminal anyone can order from as a
// guest. The app opens on sign-in, because a phone belongs to one person and
// carrying their identity between launches is the point of installing it.
//
// BrowserRouter still wraps both: the web build needs real paths (/chef, /owner,
// /track/:orderNumber), and inside the WebView it simply stays on "/" while
// MobileApp does its own switching.
const Root = IS_NATIVE ? MobileApp : App

// Marks the document so CSS can adjust for the app shell without every
// component needing to know it is running natively. The shell supplies its own
// top bar and sign-out, so page-level chrome built for the website (the
// floating profile pill, the desktop hero spacing) would otherwise sit on top
// of it — the overlap that made the app look like the layout had collapsed.
if (IS_NATIVE) document.documentElement.classList.add('is-native')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <Root />
        </ToastProvider>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
)
