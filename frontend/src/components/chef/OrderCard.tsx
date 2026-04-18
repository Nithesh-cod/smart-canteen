import React, { useState, useEffect } from 'react';
import type { Order, OrderStatus } from '../../types';

interface OrderCardProps {
  order: Order;
  onStatusUpdate: (orderId: number, newStatus: OrderStatus) => void;
}

function timeAgo(dateStr: string): { text: string; isOld: boolean } {
  const now = new Date();
  const created = new Date(dateStr);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return { text: 'Just now', isOld: false };
  if (diffMins === 1) return { text: '1 min ago', isOld: false };
  if (diffMins < 60) return { text: `${diffMins} mins ago`, isOld: diffMins > 10 };
  const diffHrs = Math.floor(diffMins / 60);
  return { text: `${diffHrs}h ago`, isOld: true };
}

function isNewOrder(dateStr: string): boolean {
  const now = new Date();
  const created = new Date(dateStr);
  return now.getTime() - created.getTime() < 60000;
}

const STATUS_BORDER: Record<string, string> = {
  pending: '#ffed4e',
  preparing: '#00f5ff',
  ready: '#00ff88',
  completed: 'rgba(255,255,255,0.2)',
  cancelled: '#ff3366',
};

const STATUS_GLOW: Record<string, string> = {
  pending: 'rgba(255,237,78,0.18)',
  preparing: 'rgba(0,245,255,0.18)',
  ready: 'rgba(0,255,136,0.18)',
  completed: 'rgba(255,255,255,0.05)',
  cancelled: 'rgba(255,51,102,0.18)',
};

const OrderCard: React.FC<OrderCardProps> = ({ order, onStatusUpdate }) => {
  const [, forceUpdate] = useState(0);
  const [hoverBtn, setHoverBtn] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const { text: timeText, isOld } = timeAgo(order.created_at);
  const isNew = isNewOrder(order.created_at);
  const borderColor = STATUS_BORDER[order.status] || 'rgba(255,255,255,0.2)';
  const glowColor = STATUS_GLOW[order.status] || 'transparent';

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${borderColor}`,
    borderRadius: '16px',
    padding: '18px',
    marginBottom: '12px',
    boxShadow: isNew
      ? `0 0 30px ${borderColor}44, inset 0 0 20px ${glowColor}`
      : `0 0 20px ${glowColor}, inset 0 0 10px ${glowColor}`,
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
  };

  const getActionConfig = (): { label: string; nextStatus: OrderStatus; color: string } | null => {
    if (order.status === 'pending') return { label: '▶ Start Preparing', nextStatus: 'preparing', color: '#00f5ff' };
    if (order.status === 'preparing') return { label: '✅ Mark Ready', nextStatus: 'ready', color: '#00ff88' };
    if (order.status === 'ready') return { label: '✓ Complete', nextStatus: 'completed', color: '#ffffff' };
    return null;
  };

  const actionConfig = getActionConfig();

  return (
    <>
      <style>{`
        @keyframes newPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes cardGlow {
          0%, 100% { box-shadow: 0 0 20px ${glowColor}, inset 0 0 10px ${glowColor}; }
          50% { box-shadow: 0 0 45px ${borderColor}55, inset 0 0 25px ${glowColor}; }
        }
      `}</style>
      <div
        style={{
          ...cardStyle,
          animation: isNew ? 'cardGlow 1.8s ease-in-out infinite' : 'none',
        }}
      >
        {/* New order indicator */}
        {isNew && (
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: '#ffed4e',
            color: '#0a0a1a',
            fontSize: '9px',
            fontFamily: 'Orbitron, monospace',
            fontWeight: '700',
            padding: '2px 6px',
            borderRadius: '4px',
            letterSpacing: '1px',
            animation: 'newPulse 1s ease-in-out infinite',
          }}>
            NEW
          </div>
        )}

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '13px',
            fontWeight: '700',
            color: borderColor,
            letterSpacing: '1.5px',
            textShadow: `0 0 10px ${borderColor}88`,
          }}>
            #{order.order_number}
          </span>
          <span style={{
            fontSize: '12px',
            fontFamily: 'Rajdhani, sans-serif',
            color: isOld ? '#ff3366' : 'rgba(255,255,255,0.45)',
            fontWeight: isOld ? '700' : '400',
            textShadow: isOld ? '0 0 8px #ff336688' : 'none',
          }}>
            {isOld ? '⚠ ' : ''}{timeText}
          </span>
        </div>

        {/* Student info */}
        {order.student_name && (
          <div style={{
            fontSize: '14px',
            fontFamily: 'Rajdhani, sans-serif',
            color: 'rgba(255,255,255,0.8)',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span>👤</span>
            <span style={{ fontWeight: '600' }}>{order.student_name}</span>
            {order.student_roll && (
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>
                · {order.student_roll}
              </span>
            )}
          </div>
        )}

        {/* Items */}
        <div style={{
          background: 'rgba(0,0,0,0.25)',
          borderRadius: '10px',
          padding: '10px 12px',
          marginBottom: '14px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {order.items && order.items.length > 0 ? (
            order.items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 0',
                  borderBottom: idx < (order.items?.length ?? 0) - 1
                    ? '1px solid rgba(255,255,255,0.06)'
                    : 'none',
                }}
              >
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: 'rgba(255,255,255,0.85)' }}>
                  <span style={{ color: borderColor, fontWeight: '700', marginRight: '5px' }}>
                    {item.quantity}x
                  </span>
                  {item.item_name}
                </span>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
                  ₹{(item.price * item.quantity).toFixed(0)}
                </span>
              </div>
            ))
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', fontFamily: 'Rajdhani, sans-serif' }}>
              No item details
            </span>
          )}
        </div>

        {/* Total row */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          padding: '0 2px',
        }}>
          <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
            Total
          </span>
          <span style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '15px',
            color: '#ffed4e',
            fontWeight: '700',
            textShadow: '0 0 10px rgba(255,237,78,0.5)',
          }}>
            ₹{order.total_amount.toFixed(0)}
          </span>
        </div>

        {/* Action button */}
        {actionConfig && (
          <button
            onClick={() => onStatusUpdate(order.id, actionConfig.nextStatus)}
            onMouseEnter={() => setHoverBtn(true)}
            onMouseLeave={() => setHoverBtn(false)}
            style={{
              width: '100%',
              padding: '10px',
              background: hoverBtn
                ? `rgba(${actionConfig.color === '#00f5ff' ? '0,245,255' : actionConfig.color === '#00ff88' ? '0,255,136' : '255,255,255'},0.2)`
                : `rgba(${actionConfig.color === '#00f5ff' ? '0,245,255' : actionConfig.color === '#00ff88' ? '0,255,136' : '255,255,255'},0.06)`,
              border: `1px solid ${actionConfig.color}`,
              borderRadius: '10px',
              color: actionConfig.color,
              fontSize: '14px',
              fontWeight: '700',
              fontFamily: 'Rajdhani, sans-serif',
              cursor: 'pointer',
              letterSpacing: '1.5px',
              transition: 'all 0.2s ease',
              textTransform: 'uppercase',
              boxShadow: hoverBtn ? `0 0 20px ${actionConfig.color}55` : 'none',
            }}
          >
            {actionConfig.label}
          </button>
        )}
      </div>
    </>
  );
};

export default OrderCard;
