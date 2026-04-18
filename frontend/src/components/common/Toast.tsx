import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  exiting: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const DISMISS_MS = 3500;
const EXIT_ANIMATION_MS = 350;

const TYPE_CONFIG: Record<
  ToastType,
  { icon: string; borderColor: string; iconBg: string }
> = {
  success: {
    icon: '✅',
    borderColor: '#00ff88',
    iconBg: 'rgba(0,255,136,0.15)',
  },
  error: {
    icon: '❌',
    borderColor: '#ff3366',
    iconBg: 'rgba(255,51,102,0.15)',
  },
  warning: {
    icon: '⚠️',
    borderColor: '#ffed4e',
    iconBg: 'rgba(255,237,78,0.15)',
  },
  info: {
    icon: 'ℹ️',
    borderColor: '#00f5ff',
    iconBg: 'rgba(0,245,255,0.15)',
  },
};

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    // Mark as exiting first (triggers slide-out animation)
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    // Remove from DOM after animation completes
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      counterRef.current += 1;
      const id = `toast-${Date.now()}-${counterRef.current}`;
      const item: ToastItem = { id, message, type, exiting: false };

      setToasts((prev) => [...prev, item]);

      setTimeout(() => removeToast(id), DISMISS_MS);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
};

// ─── Container ────────────────────────────────────────────────────────────────

const ToastContainer: React.FC<{
  toasts: ToastItem[];
  onClose: (id: string) => void;
}> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null;

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    pointerEvents: 'none',
  };

  return (
    <div style={containerStyle}>
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────────────

const ToastCard: React.FC<{
  toast: ToastItem;
  onClose: (id: string) => void;
}> = ({ toast, onClose }) => {
  const [closeHovered, setCloseHovered] = useState(false);
  const cfg = TYPE_CONFIG[toast.type];

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '300px',
    maxWidth: '420px',
    padding: '14px 16px',
    background: 'rgba(15,10,31,0.97)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderLeft: `4px solid ${cfg.borderColor}`,
    borderRadius: '12px',
    boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)`,
    pointerEvents: 'all',
    animation: toast.exiting
      ? 'slideOutRight 0.35s ease forwards'
      : 'slideInRight 0.35s cubic-bezier(0.16,1,0.3,1) forwards',
    overflow: 'hidden',
  };

  const iconWrapStyle: React.CSSProperties = {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    background: cfg.iconBg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    flexShrink: 0,
  };

  const messageStyle: React.CSSProperties = {
    flex: 1,
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: '0.95rem',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 1.4,
    letterSpacing: '0.02em',
  };

  const closeBtnStyle: React.CSSProperties = {
    flexShrink: 0,
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: 'none',
    background: closeHovered
      ? 'rgba(255,255,255,0.15)'
      : 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.8rem',
    transition: 'background 0.15s ease, color 0.15s ease',
    outline: 'none',
    lineHeight: 1,
  };

  return (
    <>
      {/* Inject keyframes once via a style tag approach using a hidden element */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0);    opacity: 1; max-height: 100px; margin-bottom: 0; }
          to   { transform: translateX(110%); opacity: 0; max-height: 0;     margin-bottom: -10px; }
        }
      `}</style>
      <div style={cardStyle} role="alert" aria-live="polite">
        <div style={iconWrapStyle}>{cfg.icon}</div>
        <span style={messageStyle}>{toast.message}</span>
        <button
          style={closeBtnStyle}
          onClick={() => onClose(toast.id)}
          onMouseEnter={() => setCloseHovered(true)}
          onMouseLeave={() => setCloseHovered(false)}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </>
  );
};

export default ToastProvider;
