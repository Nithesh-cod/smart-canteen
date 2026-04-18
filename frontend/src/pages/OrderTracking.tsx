import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as orderService from '../services/order.service';
import socketService from '../services/socket.service';
import type { Order } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STEPS = ['pending', 'preparing', 'ready', 'completed'] as const;

const getEstimatedTime = (status: string): string => {
  switch (status) {
    case 'pending':   return '~15 minutes';
    case 'preparing': return '~8 minutes';
    case 'ready':     return 'Ready for pickup! 🎉';
    case 'completed': return 'Order completed ✓';
    case 'cancelled': return 'Order cancelled';
    default:          return '';
  }
};

const statusLabel: Record<string, string> = {
  pending:   'ORDER PLACED',
  preparing: 'PREPARING',
  ready:     'READY FOR PICKUP',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return dateStr;
  }
};

const formatDateShort = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch {
    return dateStr;
  }
};

// ─── 4-Step Progress Tracker ──────────────────────────────────────────────────

const ProgressTracker: React.FC<{ status: string }> = ({ status }) => {
  const currentIdx = STATUS_STEPS.indexOf(status as any);
  const stepLabels = ['Placed', 'Preparing', 'Ready', 'Collected'];
  const stepIcons = ['📋', '👨‍🍳', '🍽️', '✅'];

  // Width of fill line: 0% to 100% across 3 segments
  const fillPct = currentIdx <= 0 ? 0 : (currentIdx / (STATUS_STEPS.length - 1)) * 100;

  return (
    <div style={{ margin: '32px 0' }}>
      <div style={{ position: 'relative', padding: '0 20px' }}>
        {/* Background track line */}
        <div style={{
          position: 'absolute', top: 17,
          left: 'calc(20px + 17px)', right: 'calc(20px + 17px)',
          height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 3,
        }} />
        {/* Animated fill line */}
        <div style={{
          position: 'absolute', top: 17,
          left: 'calc(20px + 17px)',
          width: `calc((100% - 40px - 34px) * ${fillPct / 100})`,
          height: 3,
          background: 'linear-gradient(90deg, #00f5ff, #ff00ff)',
          borderRadius: 3,
          transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: '0 0 10px rgba(0,245,255,0.6)',
        }} />

        {/* Step dots */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', zIndex: 1 }}>
          {STATUS_STEPS.map((step, idx) => {
            const isDone = currentIdx > idx;
            const isCurrent = currentIdx === idx;
            const isFuture = currentIdx < idx;
            return (
              <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                {/* Dot */}
                <div style={{ position: 'relative' }}>
                  {isCurrent && (
                    <div style={{
                      position: 'absolute', inset: -6, borderRadius: '50%',
                      background: 'rgba(0,245,255,0.2)',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  )}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: isDone
                      ? 'linear-gradient(135deg, #00ff88, #00f5ff)'
                      : isCurrent
                      ? 'rgba(0,245,255,0.2)'
                      : 'rgba(255,255,255,0.05)',
                    border: `2px solid ${isDone ? '#00ff88' : isCurrent ? '#00f5ff' : 'rgba(255,255,255,0.15)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isDone ? '14px' : '0.85rem',
                    color: '#fff', fontWeight: 700,
                    boxShadow: isDone
                      ? '0 0 16px rgba(0,255,136,0.6)'
                      : isCurrent
                      ? '0 0 16px rgba(0,245,255,0.5)'
                      : 'none',
                    transition: 'all 0.5s',
                    position: 'relative', zIndex: 2,
                    opacity: isFuture ? 0.4 : 1,
                  }}>
                    {isDone ? '✓' : isCurrent ? <span style={{ fontSize: '16px' }}>{stepIcons[idx]}</span> : ''}
                  </div>
                </div>
                {/* Label */}
                <div style={{
                  fontSize: '0.68rem', fontFamily: 'Rajdhani, sans-serif', fontWeight: 700,
                  color: isDone ? '#00ff88' : isCurrent ? '#00f5ff' : 'rgba(255,255,255,0.25)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                  textAlign: 'center', whiteSpace: 'nowrap',
                  transition: 'color 0.5s',
                  textShadow: isDone ? '0 0 8px rgba(0,255,136,0.4)' : isCurrent ? '0 0 8px rgba(0,245,255,0.4)' : 'none',
                }}>
                  {stepLabels[idx]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Recent Orders List ───────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending:   '#ffed4e',
  preparing: '#00f5ff',
  ready:     '#00ff88',
  completed: '#aaaaaa',
  cancelled: '#ff3366',
};

const RecentOrdersList: React.FC<{
  recentOrders: Order[];
  onSelect: (orderNumber: string) => void;
  loadingRecent: boolean;
}> = ({ recentOrders, onSelect, loadingRecent }) => {
  if (loadingRecent) {
    return (
      <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.3)', fontFamily: 'Rajdhani, sans-serif' }}>
        Loading recent orders...
      </div>
    );
  }
  if (recentOrders.length === 0) return null;

  return (
    <div style={{
      marginTop: 24,
      background: 'rgba(255,255,255,0.02)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 24,
      padding: 28,
      animation: 'fadeInUp 0.5s ease-out',
    }}>
      <div style={{
        fontFamily: 'Orbitron, sans-serif', fontSize: '0.72rem', fontWeight: 700,
        color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 2,
        marginBottom: 16,
      }}>
        Recent Orders
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recentOrders.map(ord => {
          const statusColor = STATUS_COLORS[ord.status] || '#aaa';
          return (
            <button
              key={ord.id}
              onClick={() => onSelect(ord.order_number)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid rgba(255,255,255,0.08)`,
                borderLeft: `3px solid ${statusColor}`,
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                width: '100%',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = `${statusColor}66`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)';
              }}
            >
              <div>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: '0.85rem', fontWeight: 700,
                  color: '#fff', letterSpacing: 0.5, marginBottom: 3,
                }}>
                  {ord.order_number}
                </div>
                <div style={{
                  fontFamily: 'Rajdhani, sans-serif', fontSize: '0.75rem',
                  color: 'rgba(255,255,255,0.35)',
                }}>
                  {formatDateShort(ord.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: '0.8rem', fontWeight: 700,
                  color: '#ffed4e',
                }}>
                  ₹{Number(ord.total_amount).toLocaleString('en-IN')}
                </span>
                <span style={{
                  background: `${statusColor}22`,
                  border: `1px solid ${statusColor}55`,
                  color: statusColor,
                  borderRadius: 20,
                  padding: '3px 10px',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}>
                  {statusLabel[ord.status] || ord.status}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ─── OrderTracking Page ───────────────────────────────────────────────────────

const OrderTracking: React.FC = () => {
  const { orderNumber: paramOrderNumber } = useParams<{ orderNumber?: string }>();

  const [orderNumber, setOrderNumber] = useState(paramOrderNumber || '');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Recent orders (last 5 from the student's perspective - we'll fetch from API)
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Load recent orders on mount
  useEffect(() => {
    const loadRecent = async () => {
      setLoadingRecent(true);
      try {
        const res = await orderService.getAll({ limit: 5 });
        const list: Order[] = Array.isArray(res)
          ? res
          : Array.isArray((res as any)?.data?.orders)
            ? (res as any).data.orders
            : Array.isArray((res as any)?.data)
              ? (res as any).data
              : [];
        setRecentOrders(list.slice(0, 5));
      } catch {
        // Silently ignore - user may not be authenticated
      } finally {
        setLoadingRecent(false);
      }
    };
    loadRecent();
  }, []);

  const handleTrack = useCallback(async (num?: string) => {
    const trackNum = (num ?? orderNumber).trim();
    if (!trackNum) {
      setError('Please enter an order number');
      return;
    }
    setLoading(true);
    setError(null);
    setNotFound(false);
    setOrder(null);
    try {
      const res = await orderService.track(trackNum);
      // Backend returns { success, data: order } — axios wraps in response.data
      // so res = { success, data: order }. Support legacy { data: { order } } shape too.
      const data = (res as any).data?.id
        ? (res as any).data
        : (res as any).data?.order ?? (res as any).data?.data?.order ?? null;
      if (!data || !data.id) {
        setNotFound(true);
      } else {
        setOrder(data);
        setOrderNumber(trackNum);
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(err?.response?.data?.message || 'Failed to fetch order. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  const handleRefresh = useCallback(async () => {
    if (!order) return;
    try {
      const res = await orderService.track(order.order_number);
      const data = (res as any).data?.id
        ? (res as any).data
        : (res as any).data?.order ?? (res as any).data?.data?.order ?? null;
      if (data?.id) setOrder(data);
    } catch {
      // silent
    }
  }, [order]);

  const handleBackToList = useCallback(() => {
    setOrder(null);
    setOrderNumber('');
    setError(null);
    setNotFound(false);
  }, []);

  // Auto-track from URL param
  useEffect(() => {
    if (paramOrderNumber) handleTrack(paramOrderNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramOrderNumber]);

  // Socket: real-time status update
  useEffect(() => {
    if (!order) return;
    socketService.connect();
    const handler = (data: any) => {
      if (data.order_number === order.order_number) {
        setOrder(prev => prev ? { ...prev, status: data.status } : prev);
      }
    };
    socketService.on('order:status-updated', handler);
    return () => { socketService.off('order:status-updated', handler); };
  }, [order?.order_number]);

  // Auto-refresh every 30s for active orders
  useEffect(() => {
    if (!order || ['completed', 'cancelled'].includes(order.status)) return;
    const interval = setInterval(() => handleRefresh(), 30000);
    return () => clearInterval(interval);
  }, [order?.status, handleRefresh]);

  const isCancelled = order?.status === 'cancelled';
  const isCompleted = order?.status === 'completed';

  return (
    <>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.4);opacity:.2} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glowPulse {
          0%,100% { box-shadow: 0 0 20px rgba(0,245,255,0.3); }
          50%      { box-shadow: 0 0 40px rgba(0,245,255,0.6), 0 0 60px rgba(255,0,255,0.2); }
        }
        .cyber-grid {
          background-image: linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px);
          background-size: 50px 50px;
        }
        .track-input::placeholder { color: rgba(255,255,255,0.3); }
        .track-input:focus { outline: none; border-color: #00f5ff !important; box-shadow: 0 0 0 3px rgba(0,245,255,0.15) !important; }
      `}</style>

      {/* NOTE: do NOT use className="cyber-grid" here — that CSS class sets
           pointer-events:none which blocks all input interaction on this page */}
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0f0a1f 100%)',
        backgroundImage: 'linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 20px 80px',
      }}>
        <div style={{ width: '100%', maxWidth: 650 }}>

          {/* Main Search Card */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 30,
            padding: 40, animation: 'glowPulse 4s ease-in-out infinite',
          }}>
            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 6 }}>
              <div style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: '2.5rem', fontWeight: 900,
                background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.1,
              }}>
                🍕 SMART CANTEEN
              </div>
            </div>
            <div style={{
              textAlign: 'center', color: 'rgba(255,255,255,0.4)',
              fontFamily: 'Rajdhani, sans-serif', fontSize: '0.9rem', letterSpacing: 3,
              textTransform: 'uppercase', marginBottom: 36,
            }}>
              Order Tracking
            </div>

            {/* Search Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input
                type="text"
                className="track-input"
                placeholder="Enter Order Number (e.g. OZ12345)"
                value={orderNumber}
                onChange={e => { setOrderNumber(e.target.value); setError(null); setNotFound(false); }}
                onKeyDown={e => { if (e.key === 'Enter') handleTrack(); }}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 14, padding: '16px 20px', color: '#fff',
                  fontFamily: 'monospace', fontSize: '1.05rem', letterSpacing: 1.5,
                  width: '100%', boxSizing: 'border-box',
                  transition: 'border-color 0.2s, box-shadow 0.2s', textAlign: 'center',
                }}
              />
              <button
                onClick={() => handleTrack()}
                disabled={loading}
                style={{
                  background: loading ? 'rgba(0,245,255,0.1)' : 'linear-gradient(135deg, #00f5ff33, #ff00ff33)',
                  border: '1px solid rgba(0,245,255,0.5)', borderRadius: 14, padding: '15px 0',
                  color: '#00f5ff', fontFamily: 'Orbitron, sans-serif', fontWeight: 700,
                  fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
                  letterSpacing: 1, transition: 'all 0.25s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  opacity: loading ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(0,245,255,0.25), rgba(255,0,255,0.25))'; }}
                onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #00f5ff33, #ff00ff33)'; }}
              >
                {loading ? (
                  <>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '3px solid rgba(0,245,255,0.3)', borderTop: '3px solid #00f5ff', animation: 'spin 0.8s linear infinite' }} />
                    Tracking...
                  </>
                ) : '🔍 Track Order'}
              </button>
            </div>

            {/* Error / Not Found */}
            {(error || notFound) && (
              <div style={{
                marginTop: 18, padding: '14px 18px',
                background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)',
                borderRadius: 12, color: '#ff3366',
                fontFamily: 'Rajdhani, sans-serif', fontWeight: 600, fontSize: '0.92rem', textAlign: 'center',
              }}>
                {notFound
                  ? `❌ No order found with number "${orderNumber}". Please check and try again.`
                  : `⚠️ ${error}`}
              </div>
            )}
          </div>

          {/* Order Details Card */}
          {order && (
            <div style={{
              marginTop: 24,
              background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)',
              border: `1px solid ${isCancelled ? 'rgba(255,51,102,0.3)' : 'rgba(0,245,255,0.2)'}`,
              borderRadius: 28, padding: 36, animation: 'fadeInUp 0.5s ease-out',
            }}>
              {/* Back + Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={handleBackToList}
                    style={{
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 12px',
                      fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: '0.8rem',
                      cursor: 'pointer', transition: 'all 0.2s', letterSpacing: 1,
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#fff'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'}
                  >
                    ← Back
                  </button>
                  <div>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.3rem', fontWeight: 900, color: '#00f5ff', letterSpacing: 1 }}>
                      {order.order_number}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.38)', fontFamily: 'Rajdhani, sans-serif', marginTop: 3 }}>
                      {formatDate(order.created_at)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleRefresh}
                  style={{
                    background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.25)',
                    color: '#00f5ff', borderRadius: 10, padding: '7px 14px',
                    fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: '0.8rem',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,245,255,0.16)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,245,255,0.08)')}
                >
                  🔄 Refresh
                </button>
              </div>

              {/* Cancelled State */}
              {isCancelled ? (
                <div style={{
                  margin: '24px 0', padding: '24px',
                  background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)',
                  borderRadius: 16, textAlign: 'center',
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: 10 }}>❌</div>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: '#ff3366', marginBottom: 6 }}>Order Cancelled</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.9rem' }}>
                    This order has been cancelled. Contact the canteen for assistance.
                  </div>
                </div>
              ) : (
                <>
                  {/* 4-step Progress Tracker */}
                  <ProgressTracker status={order.status} />

                  {/* Status Display */}
                  <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: '1.4rem', fontWeight: 900,
                      color: isCompleted ? '#00ff88' : '#00f5ff', letterSpacing: 2, marginBottom: 8,
                      textShadow: isCompleted ? '0 0 20px rgba(0,255,136,0.5)' : '0 0 20px rgba(0,245,255,0.5)',
                    }}>
                      {statusLabel[order.status] || order.status.toUpperCase()}
                    </div>
                    <div style={{ color: isCompleted ? '#00ff88' : 'rgba(255,255,255,0.55)', fontFamily: 'Rajdhani, sans-serif', fontSize: '1rem', fontWeight: 600 }}>
                      {getEstimatedTime(order.status)}
                    </div>
                    {/* Auto-refresh indicator */}
                    {!isCompleted && !isCancelled && (
                      <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.2)', fontFamily: 'Rajdhani, sans-serif', fontSize: '0.72rem', letterSpacing: 1 }}>
                        Auto-refreshing every 30s
                      </div>
                    )}
                  </div>
                </>
              )}

              <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '20px 0' }} />

              {/* Order Items */}
              {order.items && order.items.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    fontFamily: 'Orbitron, sans-serif', fontSize: '0.75rem', fontWeight: 700,
                    color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12,
                  }}>ORDER ITEMS</div>
                  <div style={{
                    background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 14, padding: '14px 18px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {order.items.map((item, idx) => (
                      <div key={idx} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        fontFamily: 'Rajdhani, sans-serif', fontSize: '0.95rem',
                        borderBottom: idx < order.items!.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        paddingBottom: idx < order.items!.length - 1 ? 10 : 0,
                      }}>
                        <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>
                          • {item.quantity}× {item.item_name}
                        </span>
                        <span style={{ color: '#ffed4e', fontWeight: 700 }}>
                          ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total + Payment */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 20px',
                background: 'rgba(255,237,78,0.05)', border: '1px solid rgba(255,237,78,0.2)',
                borderRadius: 14, flexWrap: 'wrap', gap: 12,
              }}>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.1rem', fontWeight: 900, color: '#ffed4e' }}>
                  Total: ₹{Number(order.total_amount).toLocaleString('en-IN')}
                </div>
                <div>
                  {order.payment_status === 'paid' ? (
                    <span style={{
                      background: 'rgba(0,255,136,0.15)', border: '1px solid rgba(0,255,136,0.4)',
                      color: '#00ff88', borderRadius: 20, padding: '6px 16px',
                      fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: '0.88rem',
                    }}>✅ Paid</span>
                  ) : (
                    <span style={{
                      background: 'rgba(255,237,78,0.12)', border: '1px solid rgba(255,237,78,0.3)',
                      color: '#ffed4e', borderRadius: 20, padding: '6px 16px',
                      fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: '0.88rem',
                    }}>⏳ Payment Pending</span>
                  )}
                </div>
              </div>

              {/* Student Info */}
              {(order.student_name || order.student_roll) && (
                <div style={{
                  marginTop: 14, fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)',
                  fontFamily: 'Rajdhani, sans-serif', display: 'flex', gap: 16, flexWrap: 'wrap',
                }}>
                  {order.student_name && <span>👤 {order.student_name}</span>}
                  {order.student_roll && <span>🎓 {order.student_roll}</span>}
                </div>
              )}
            </div>
          )}

          {/* Recent Orders List (shown when no order is selected) */}
          {!order && !loading && (
            <RecentOrdersList
              recentOrders={recentOrders}
              onSelect={num => { setOrderNumber(num); handleTrack(num); }}
              loadingRecent={loadingRecent}
            />
          )}

          {/* Footer hint */}
          {!order && !loading && recentOrders.length === 0 && (
            <div style={{
              textAlign: 'center', marginTop: 30,
              color: 'rgba(255,255,255,0.2)', fontFamily: 'Rajdhani, sans-serif',
              fontSize: '0.82rem', letterSpacing: 0.5,
            }}>
              Real-time order tracking powered by Smart Canteen
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrderTracking;
