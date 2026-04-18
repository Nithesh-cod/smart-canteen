import React from 'react';
import type { Order, OrderStatus } from '../../types';
import OrderCard from './OrderCard';

interface OrderQueueProps {
  orders: Order[];
  onStatusUpdate: (orderId: number, status: OrderStatus) => void;
}

const COLUMNS: Array<{ status: OrderStatus; label: string; color: string; glow: string }> = [
  { status: 'pending', label: 'Pending', color: '#ffed4e', glow: 'rgba(255,237,78,0.12)' },
  { status: 'preparing', label: 'Preparing', color: '#00f5ff', glow: 'rgba(0,245,255,0.12)' },
  { status: 'ready', label: 'Ready', color: '#00ff88', glow: 'rgba(0,255,136,0.12)' },
];

const OrderQueue: React.FC<OrderQueueProps> = ({ orders, onStatusUpdate }) => {
  const getOrdersByStatus = (status: OrderStatus) =>
    orders.filter(o => o.status === status);

  return (
    <>
      <style>{`
        @keyframes emptyFloat {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-8px); opacity: 0.6; }
        }
        .queue-col::-webkit-scrollbar {
          width: 4px;
        }
        .queue-col::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.03);
          border-radius: 2px;
        }
        .queue-col::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12);
          border-radius: 2px;
        }
      `}</style>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '20px',
        width: '100%',
        alignItems: 'start',
      }}>
        {COLUMNS.map(col => {
          const colOrders = getOrdersByStatus(col.status);
          return (
            <div key={col.status} style={{ display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
              {/* Column header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
                padding: '12px 18px',
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${col.color}33`,
                borderRadius: '12px',
                boxShadow: `0 0 20px ${col.glow}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: col.color,
                    boxShadow: `0 0 10px ${col.color}`,
                  }} />
                  <span style={{
                    fontFamily: 'Orbitron, monospace',
                    fontSize: '13px',
                    fontWeight: '700',
                    color: col.color,
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    textShadow: `0 0 12px ${col.color}88`,
                  }}>
                    {col.label}
                  </span>
                </div>
                <div style={{
                  background: `${col.color}22`,
                  border: `1px solid ${col.color}55`,
                  borderRadius: '20px',
                  padding: '2px 12px',
                  fontFamily: 'Orbitron, monospace',
                  fontSize: '13px',
                  fontWeight: '700',
                  color: col.color,
                  minWidth: '32px',
                  textAlign: 'center',
                  boxShadow: colOrders.length > 0 ? `0 0 10px ${col.color}44` : 'none',
                }}>
                  {colOrders.length}
                </div>
              </div>

              {/* Orders list */}
              <div
                className="queue-col"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  maxHeight: 'calc(100vh - 280px)',
                  paddingRight: '4px',
                }}
              >
                {colOrders.length > 0 ? (
                  colOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onStatusUpdate={onStatusUpdate}
                    />
                  ))
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px 20px',
                    background: 'rgba(255,255,255,0.015)',
                    borderRadius: '14px',
                    border: `1px dashed ${col.color}33`,
                    animation: 'emptyFloat 3s ease-in-out infinite',
                  }}>
                    <div style={{
                      fontSize: '36px',
                      marginBottom: '10px',
                      filter: 'grayscale(0.5)',
                    }}>
                      {col.status === 'pending' ? '🕐' : col.status === 'preparing' ? '👨‍🍳' : '🍽️'}
                    </div>
                    <span style={{
                      fontFamily: 'Rajdhani, sans-serif',
                      fontSize: '14px',
                      color: `${col.color}66`,
                      letterSpacing: '1px',
                      fontWeight: '500',
                    }}>
                      No orders
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default OrderQueue;
