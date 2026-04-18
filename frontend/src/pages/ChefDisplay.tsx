import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as orderService from '../services/order.service';
import * as menuService from '../services/menu.service';
import socketService from '../services/socket.service';
import { subscribeToTable, unsubscribe } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Order, MenuItem, OrderStatus } from '../types';

// ─── Stats Row ────────────────────────────────────────────────────────────────

const StatsRow: React.FC<{ orders: Order[]; menuItems: MenuItem[] }> = ({ orders, menuItems }) => {
  const pending = orders.filter(o => o.status === 'pending').length;
  const preparing = orders.filter(o => o.status === 'preparing').length;
  const ready = orders.filter(o => o.status === 'ready').length;

  // Today's revenue: sum total_amount of completed/ready orders created today
  const today = new Date().toDateString();
  const revenue = orders
    .filter(o => ['completed', 'ready'].includes(o.status) && new Date(o.created_at).toDateString() === today)
    .reduce((sum, o) => sum + Number(o.total_amount), 0);

  const stats = [
    { label: 'Pending', value: pending, color: '#ffed4e', icon: '🕐' },
    { label: 'Preparing', value: preparing, color: '#00f5ff', icon: '👨‍🍳' },
    { label: 'Ready', value: ready, color: '#00ff88', icon: '🍽️' },
    { label: "Today's Revenue", value: `₹${revenue.toLocaleString('en-IN')}`, color: '#ff00ff', icon: '💰' },
  ];

  return (
    <div className="chef-stats-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '16px',
      marginBottom: '28px',
    }}>
      {stats.map(stat => (
        <div key={stat.label} style={{
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${stat.color}33`,
          borderRadius: '16px',
          padding: '18px 22px',
          boxShadow: `0 0 20px ${stat.color}11`,
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <span style={{ fontSize: '28px' }}>{stat.icon}</span>
          <div>
            <div style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '22px',
              fontWeight: '900',
              color: stat.color,
              lineHeight: 1,
              textShadow: `0 0 15px ${stat.color}66`,
            }}>
              {stat.value}
            </div>
            <div style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '11px',
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              marginTop: '3px',
            }}>
              {stat.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Order Card ───────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): { text: string; isOld: boolean } {
  const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMins < 1) return { text: 'Just now', isOld: false };
  if (diffMins === 1) return { text: '1 min ago', isOld: false };
  if (diffMins < 60) return { text: `${diffMins} mins ago`, isOld: diffMins > 10 };
  return { text: `${Math.floor(diffMins / 60)}h ago`, isOld: true };
}

const STATUS_CONFIG: Record<string, { border: string; glow: string; label: string }> = {
  pending:   { border: '#ffed4e', glow: 'rgba(255,237,78,0.18)',   label: 'PENDING' },
  preparing: { border: '#00f5ff', glow: 'rgba(0,245,255,0.18)',    label: 'PREPARING' },
  ready:     { border: '#00ff88', glow: 'rgba(0,255,136,0.22)',    label: 'READY' },
  completed: { border: 'rgba(255,255,255,0.2)', glow: 'transparent', label: 'DONE' },
  cancelled: { border: '#ff3366', glow: 'rgba(255,51,102,0.18)',   label: 'CANCELLED' },
};

const ChefOrderCard: React.FC<{
  order: Order;
  onStatusUpdate: (id: number, status: OrderStatus) => void;
}> = ({ order, onStatusUpdate }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick(n => n + 1), 30000);
    return () => clearInterval(i);
  }, []);

  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const { text: timeText, isOld } = timeAgo(order.created_at);
  const isNew = Date.now() - new Date(order.created_at).getTime() < 60000;
  const isReady = order.status === 'ready';

  return (
    <>
      <style>{`
        @keyframes newPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.85)} }
        @keyframes readyGlow {
          0%,100% { box-shadow: 0 0 20px rgba(0,255,136,0.22), 0 0 0 1px rgba(0,255,136,0.3); }
          50%      { box-shadow: 0 0 50px rgba(0,255,136,0.45), 0 0 0 1px rgba(0,255,136,0.6); }
        }
      `}</style>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${cfg.border}55`,
        borderLeft: `4px solid ${cfg.border}`,
        borderRadius: '16px',
        padding: '18px',
        marginBottom: '12px',
        animation: isReady ? 'readyGlow 2s ease-in-out infinite' : 'none',
        boxShadow: isNew ? `0 0 30px ${cfg.border}44` : `0 0 15px ${cfg.glow}`,
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
      }}>
        {isNew && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: '#ffed4e', color: '#0a0a1a',
            fontSize: '9px', fontFamily: 'Orbitron, monospace', fontWeight: '700',
            padding: '2px 6px', borderRadius: '4px', letterSpacing: '1px',
            animation: 'newPulse 1s ease-in-out infinite',
          }}>NEW</div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{
            fontFamily: 'Orbitron, monospace', fontSize: '13px', fontWeight: '700',
            color: cfg.border, letterSpacing: '1.5px', textShadow: `0 0 10px ${cfg.border}88`,
          }}>
            #{order.order_number}
          </span>
          <span style={{
            fontSize: '12px', fontFamily: 'Rajdhani, sans-serif',
            color: isOld ? '#ff3366' : 'rgba(255,255,255,0.45)',
            fontWeight: isOld ? '700' : '400',
          }}>
            {isOld ? '⚠ ' : ''}{timeText}
          </span>
        </div>

        {/* Student info */}
        {(order.student_name || order.student_roll) && (
          <div style={{
            fontSize: '14px', fontFamily: 'Rajdhani, sans-serif',
            color: 'rgba(255,255,255,0.8)', marginBottom: '12px',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span>👤</span>
            <span style={{ fontWeight: '600' }}>{order.student_name}</span>
            {order.student_roll && (
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>· {order.student_roll}</span>
            )}
          </div>
        )}

        {/* Items */}
        <div style={{
          background: 'rgba(0,0,0,0.25)', borderRadius: '10px',
          padding: '10px 12px', marginBottom: '14px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {order.items && order.items.length > 0 ? order.items.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 0',
              borderBottom: idx < (order.items?.length ?? 0) - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: 'rgba(255,255,255,0.85)' }}>
                <span style={{ color: cfg.border, fontWeight: '700', marginRight: '5px' }}>{item.quantity}x</span>
                {item.item_name}
              </span>
              <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
                ₹{(item.price * item.quantity).toFixed(0)}
              </span>
            </div>
          )) : (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', fontFamily: 'Rajdhani, sans-serif' }}>No item details</span>
          )}
        </div>

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Total</span>
          <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '15px', color: '#ffed4e', fontWeight: '700', textShadow: '0 0 10px rgba(255,237,78,0.5)' }}>
            ₹{Number(order.total_amount).toFixed(0)}
          </span>
        </div>

        {/* Action buttons per status */}
        {order.status === 'pending' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <ActionBtn
              label="✔ Accept"
              color="#00f5ff"
              onClick={() => onStatusUpdate(order.id, 'preparing')}
            />
            <ActionBtn
              label="✕ Reject"
              color="#ff3366"
              onClick={() => onStatusUpdate(order.id, 'cancelled')}
            />
          </div>
        )}
        {order.status === 'preparing' && (
          <ActionBtn
            label="✅ Mark Ready"
            color="#00ff88"
            onClick={() => onStatusUpdate(order.id, 'ready')}
            fullWidth
          />
        )}
        {order.status === 'ready' && (
          <ActionBtn
            label="✓ Complete"
            color="#ffffff"
            onClick={() => onStatusUpdate(order.id, 'completed')}
            fullWidth
          />
        )}
      </div>
    </>
  );
};

const ActionBtn: React.FC<{
  label: string;
  color: string;
  onClick: () => void;
  fullWidth?: boolean;
}> = ({ label, color, onClick, fullWidth }) => {
  const [hover, setHover] = useState(false);
  const rgb = color === '#00f5ff' ? '0,245,255' : color === '#00ff88' ? '0,255,136' : color === '#ff3366' ? '255,51,102' : '255,255,255';
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: fullWidth ? undefined : 1,
        width: fullWidth ? '100%' : undefined,
        padding: '10px',
        background: hover ? `rgba(${rgb},0.2)` : `rgba(${rgb},0.07)`,
        border: `1px solid ${color}`,
        borderRadius: '10px',
        color,
        fontSize: '13px',
        fontWeight: '700',
        fontFamily: 'Rajdhani, sans-serif',
        cursor: 'pointer',
        letterSpacing: '1px',
        transition: 'all 0.2s ease',
        textTransform: 'uppercase',
        boxShadow: hover ? `0 0 18px ${color}55` : 'none',
      }}
    >
      {label}
    </button>
  );
};

// ─── Order Queue ──────────────────────────────────────────────────────────────

const COLUMNS: Array<{ status: OrderStatus; label: string; color: string; glow: string }> = [
  { status: 'pending',   label: 'Pending',   color: '#ffed4e', glow: 'rgba(255,237,78,0.12)' },
  { status: 'preparing', label: 'Preparing', color: '#00f5ff', glow: 'rgba(0,245,255,0.12)' },
  { status: 'ready',     label: 'Ready',     color: '#00ff88', glow: 'rgba(0,255,136,0.12)' },
];

const OrdersTab: React.FC<{ orders: Order[]; onStatusUpdate: (id: number, s: OrderStatus) => void }> = ({ orders, onStatusUpdate }) => (
  <>
    <style>{`
      .queue-col::-webkit-scrollbar { width: 4px; }
      .queue-col::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 2px; }
      .queue-col::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
    `}</style>
    <div className="chef-orders-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', alignItems: 'start' }}>
      {COLUMNS.map(col => {
        const colOrders = orders.filter(o => o.status === col.status);
        return (
          <div key={col.status} style={{ display: 'flex', flexDirection: 'column', minHeight: '200px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '16px', padding: '12px 18px',
              background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)',
              border: `1px solid ${col.color}33`, borderRadius: '12px',
              boxShadow: `0 0 20px ${col.glow}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: col.color, boxShadow: `0 0 10px ${col.color}` }} />
                <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '13px', fontWeight: '700', color: col.color, letterSpacing: '2px', textTransform: 'uppercase' }}>
                  {col.label}
                </span>
              </div>
              <div style={{
                background: `${col.color}22`, border: `1px solid ${col.color}55`, borderRadius: '20px',
                padding: '2px 12px', fontFamily: 'Orbitron, monospace', fontSize: '13px',
                fontWeight: '700', color: col.color, textAlign: 'center',
              }}>
                {colOrders.length}
              </div>
            </div>
            <div className="queue-col" style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 380px)', paddingRight: '4px' }}>
              {colOrders.length > 0 ? colOrders.map(order => (
                <ChefOrderCard key={order.id} order={order} onStatusUpdate={onStatusUpdate} />
              )) : (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '40px 20px', background: 'rgba(255,255,255,0.015)',
                  borderRadius: '14px', border: `1px dashed ${col.color}33`,
                }}>
                  <div style={{ fontSize: '36px', marginBottom: '10px', filter: 'grayscale(0.5)' }}>
                    {col.status === 'pending' ? '🕐' : col.status === 'preparing' ? '👨‍🍳' : '🍽️'}
                  </div>
                  <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', color: `${col.color}66`, letterSpacing: '1px', fontWeight: '500' }}>
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

// ─── Edit Menu Tab ────────────────────────────────────────────────────────────

interface EditableItem extends MenuItem {
  editName: string;
  editPrice: string;
  editImageUrl: string;
  editStock: string;
  saving: boolean;
}

const DeleteModal: React.FC<{
  itemName: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ itemName, onConfirm, onCancel }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <div style={{
      background: 'rgba(10,10,26,0.95)', border: '1px solid rgba(255,51,102,0.4)',
      borderRadius: '20px', padding: '36px', maxWidth: '380px', width: '90%',
      boxShadow: '0 0 40px rgba(255,51,102,0.2)', textAlign: 'center',
      animation: 'fadeInUp 0.25s ease',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
      <h3 style={{
        fontFamily: 'Orbitron, monospace', fontSize: '16px', fontWeight: '700',
        color: '#ff3366', letterSpacing: '2px', marginBottom: '12px',
      }}>DELETE ITEM</h3>
      <p style={{
        fontFamily: 'Rajdhani, sans-serif', fontSize: '15px',
        color: 'rgba(255,255,255,0.7)', marginBottom: '28px', lineHeight: 1.5,
      }}>
        Are you sure you want to delete <strong style={{ color: '#fff' }}>{itemName}</strong>? This action cannot be undone.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={onCancel} style={{
          flex: 1, padding: '12px',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '10px', color: 'rgba(255,255,255,0.7)',
          fontFamily: 'Rajdhani, sans-serif', fontWeight: '700', fontSize: '14px',
          cursor: 'pointer', letterSpacing: '1px', transition: 'all 0.2s',
        }}>Cancel</button>
        <button onClick={onConfirm} style={{
          flex: 1, padding: '12px',
          background: 'rgba(255,51,102,0.15)', border: '1px solid #ff3366',
          borderRadius: '10px', color: '#ff3366',
          fontFamily: 'Rajdhani, sans-serif', fontWeight: '700', fontSize: '14px',
          cursor: 'pointer', letterSpacing: '1px', transition: 'all 0.2s',
        }}>Delete</button>
      </div>
    </div>
  </div>
);

const EditMenuTab: React.FC<{
  items: MenuItem[];
  onRefresh: () => void;
}> = ({ items, onRefresh }) => {
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<EditableItem | null>(null);

  useEffect(() => {
    setEditItems(items.map(item => ({
      ...item,
      editName: item.name,
      editPrice: String(item.price),
      editImageUrl: item.image_url ?? '',
      editStock: String(item.stock_quantity ?? -1),
      saving: false,
    })));
  }, [items]);

  const updateField = (id: number, field: 'editName' | 'editPrice' | 'editImageUrl' | 'editStock', value: string) => {
    setEditItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleSave = async (item: EditableItem) => {
    setEditItems(prev => prev.map(i => i.id === item.id ? { ...i, saving: true } : i));
    try {
      await menuService.update(item.id, {
        name: item.editName.trim() || item.name,
        price: parseFloat(item.editPrice) || item.price,
        image_url: item.editImageUrl.trim() || undefined,
        stock_quantity: item.editStock === '' ? -1 : parseInt(item.editStock, 10),
      });
      onRefresh();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setEditItems(prev => prev.map(i => i.id === item.id ? { ...i, saving: false } : i));
    }
  };

  const handleToggle = async (item: EditableItem) => {
    setEditItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i));
    try {
      await menuService.toggleAvailability(item.id);
    } catch (err) {
      setEditItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: item.is_available } : i));
    }
  };

  const handleDelete = async (item: EditableItem) => {
    setDeleteTarget(null);
    try {
      await menuService.deleteItem(item.id);
      onRefresh();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .menu-edit-input { background: rgba(255,255,255,0.05) !important; border: 1px solid rgba(255,255,255,0.12) !important; }
        .menu-edit-input:focus { outline: none; border-color: #00f5ff !important; box-shadow: 0 0 0 2px rgba(0,245,255,0.15) !important; }
        /* Toggle switch styles */
        .toggle-switch { position:relative; display:inline-block; width:44px; height:24px; cursor:pointer; }
        .toggle-switch input { opacity:0; width:0; height:0; }
        .toggle-slider {
          position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0;
          background: rgba(255,51,102,0.3); border-radius:24px; transition:.3s;
          border: 1px solid rgba(255,51,102,0.5);
        }
        .toggle-slider:before {
          position:absolute; content:''; height:18px; width:18px; left:2px; bottom:2px;
          background:#ff3366; border-radius:50%; transition:.3s;
        }
        input:checked + .toggle-slider { background: rgba(0,255,136,0.3); border-color: rgba(0,255,136,0.5); }
        input:checked + .toggle-slider:before { transform:translateX(20px); background:#00ff88; }
      `}</style>

      {deleteTarget && (
        <DeleteModal
          itemName={deleteTarget.editName}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '20px',
      }}>
        {editItems.map((item, idx) => (
          <div key={item.id} style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '18px',
            overflow: 'hidden',
            animation: `fadeInUp 0.4s ease ${idx * 0.04}s both`,
            transition: 'all 0.3s',
          }}>
            {/* Image */}
            <div style={{ height: '140px', background: 'rgba(0,0,0,0.3)', overflow: 'hidden', position: 'relative', cursor: 'pointer' }}
              title="Edit image URL below">
              {item.image_url ? (
                <img src={item.editImageUrl || item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: item.is_available ? 1 : 0.4 }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '48px', opacity: item.is_available ? 1 : 0.4 }}>🍽️</div>
              )}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.45)', opacity: 0, transition: 'opacity 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
              >
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: '#00f5ff', fontWeight: '700', letterSpacing: '1px', background: 'rgba(0,245,255,0.15)', padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(0,245,255,0.4)' }}>
                  📷 Change Image
                </span>
              </div>
              {!item.is_available && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.5)', pointerEvents: 'none',
                }}>
                  <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '12px', color: '#ff3366', letterSpacing: '2px', fontWeight: '700' }}>UNAVAILABLE</span>
                </div>
              )}
            </div>

            {/* Fields */}
            <div style={{ padding: '16px' }}>
              <input
                type="text"
                className="menu-edit-input"
                value={item.editName}
                onChange={e => updateField(item.id, 'editName', e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  color: '#fff', fontFamily: 'Rajdhani, sans-serif', fontSize: '15px',
                  fontWeight: '600', marginBottom: '10px', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', color: 'rgba(255,255,255,0.5)' }}>₹</span>
                <input
                  type="number"
                  className="menu-edit-input"
                  value={item.editPrice}
                  onChange={e => updateField(item.id, 'editPrice', e.target.value)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: '8px',
                    color: '#ffed4e', fontFamily: 'Orbitron, monospace', fontSize: '14px',
                    fontWeight: '700', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Image URL */}
              <input
                type="url"
                className="menu-edit-input"
                value={item.editImageUrl}
                onChange={e => updateField(item.id, 'editImageUrl', e.target.value)}
                placeholder="Image URL (https://...)"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  color: '#fff', fontFamily: 'Rajdhani, sans-serif', fontSize: '13px',
                  marginBottom: '10px', boxSizing: 'border-box',
                }}
              />

              {/* Stock */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>Stock:</span>
                <input
                  type="number"
                  className="menu-edit-input"
                  value={item.editStock}
                  onChange={e => updateField(item.id, 'editStock', e.target.value)}
                  min="-1"
                  placeholder="-1 = unlimited"
                  title="-1 means unlimited stock"
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: '8px',
                    color: item.editStock === '-1' ? 'rgba(255,255,255,0.4)' : '#00f5ff',
                    fontFamily: 'Orbitron, monospace', fontSize: '13px',
                    fontWeight: '700', boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                  {item.editStock === '-1' ? '∞ unlimited' : `${item.editStock} left`}
                </span>
              </div>

              {/* Availability toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '13px', color: item.is_available ? '#00ff88' : '#ff3366', fontWeight: '600', letterSpacing: '1px' }}>
                  {item.is_available ? '● Available' : '● Unavailable'}
                </span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={item.is_available} onChange={() => handleToggle(item)} />
                  <span className="toggle-slider" />
                </label>
              </div>

              {/* Save + Delete */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleSave(item)}
                  disabled={item.saving}
                  style={{
                    flex: 1, padding: '9px',
                    background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.4)',
                    borderRadius: '9px', color: '#00f5ff',
                    fontFamily: 'Rajdhani, sans-serif', fontWeight: '700', fontSize: '13px',
                    cursor: item.saving ? 'not-allowed' : 'pointer', letterSpacing: '1px',
                    opacity: item.saving ? 0.6 : 1, transition: 'all 0.2s',
                  }}
                >
                  {item.saving ? '...' : '💾 Save'}
                </button>
                <button
                  onClick={() => setDeleteTarget(item)}
                  style={{
                    padding: '9px 14px',
                    background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.4)',
                    borderRadius: '9px', color: '#ff3366',
                    fontFamily: 'Rajdhani, sans-serif', fontWeight: '700', fontSize: '13px',
                    cursor: 'pointer', letterSpacing: '1px', transition: 'all 0.2s',
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

// ─── Main ChefDisplay Component ───────────────────────────────────────────────

const ChefDisplay: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'menu'>('orders');
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Web Audio API beep
  const playNotificationBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const playTone = (freq: number, startTime: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.frequency.setValueAtTime(freq, startTime);
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.4, startTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      const now = ctx.currentTime;
      playTone(880, now, 0.15);
      playTone(1100, now + 0.18, 0.2);
    } catch {
      // Audio not supported
    }
  }, [soundEnabled]);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await orderService.getAll({ limit: 100 });
      const orderList: Order[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.data?.orders)
          ? (data as any).data.orders
          : Array.isArray((data as any)?.data)
            ? (data as any).data
            : [];
      setOrders(orderList.filter(o => ['pending', 'preparing', 'ready'].includes(o.status)));
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    }
  }, []);

  const fetchMenuItems = useCallback(async () => {
    try {
      const data = await menuService.getAll();
      if (data.success && Array.isArray(data.data)) {
        setMenuItems(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch menu:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchOrders(), fetchMenuItems()]);
      setLoading(false);
    };
    init();

    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    // Polling fallback — refresh active orders every 20s in case realtime misses events
    const pollInterval = setInterval(() => fetchOrders(), 20_000);

    try {
      socketService.connect();
      socketService.joinAsChef();
      socketService.on('connect', () => setConnectionStatus('connected'));
      socketService.on('disconnect', () => setConnectionStatus('disconnected'));
      socketService.on('order:created', (newOrder: Order) => {
        setOrders(prev => {
          if (prev.find(o => o.id === newOrder.id)) return prev;
          return [newOrder, ...prev];
        });
        playNotificationBeep();
      });
      socketService.on('order:status-updated', (updatedOrder: Order) => {
        setOrders(prev => {
          if (['completed', 'cancelled'].includes(updatedOrder.status)) {
            return prev.filter(o => o.id !== updatedOrder.id);
          }
          return prev.map(o => o.id === updatedOrder.id ? updatedOrder : o);
        });
      });
      socketService.on('order:cancelled', (data: { id: number }) => {
        setOrders(prev => prev.filter(o => o.id !== data.id));
      });
      socketService.on('menu:availability-changed', (updatedItem: MenuItem) => {
        setMenuItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
      });
      socketService.on('menu:stock-updated', (data: { id: number; stock_quantity: number; is_available: boolean }) => {
        setMenuItems(prev => prev.map(item =>
          item.id === data.id
            ? { ...item, stock_quantity: data.stock_quantity, is_available: data.is_available }
            : item
        ));
      });
      socketService.on('menu:item-updated', (updated: any) => {
        setMenuItems(prev => prev.map(item =>
          item.id === updated.id ? { ...item, ...updated } : item
        ));
      });
      setConnectionStatus('connected');
    } catch (err) {
      console.error('Socket connection failed:', err);
      setConnectionStatus('disconnected');
    }

    // ── Supabase Realtime — direct DB-level subscriptions ─────────────────
    // These fire independently of Socket.IO so nothing is missed even if
    // the WebSocket briefly disconnects.
    const ordersChannel = subscribeToTable('orders', ({ eventType, new: row }) => {
      if (eventType === 'INSERT') {
        // Re-fetch so we get the full joined data (items, student name, etc.)
        fetchOrders();
        playNotificationBeep();
      } else if (eventType === 'UPDATE') {
        const updated = row as any;
        if (['completed', 'cancelled'].includes(updated.status)) {
          setOrders(prev => prev.filter(o => o.id !== updated.id));
        } else if (['pending', 'preparing', 'ready'].includes(updated.status)) {
          // Partial update — just patch the status; full data arrives via Socket.IO
          setOrders(prev => prev.map(o =>
            o.id === updated.id ? { ...o, status: updated.status } : o
          ));
        }
      }
    }, 'chef:orders');

    const menuChannel = subscribeToTable('menu_items', ({ eventType, new: row }) => {
      if (eventType === 'UPDATE') {
        const item = row as any;
        setMenuItems(prev => prev.map(m =>
          m.id === item.id ? { ...m, ...item } : m
        ));
      } else {
        // INSERT / DELETE — full refresh
        fetchMenuItems();
      }
    }, 'chef:menu_items');

    return () => {
      clearInterval(clockInterval);
      clearInterval(pollInterval);
      socketService.off('connect');
      socketService.off('disconnect');
      socketService.off('order:created');
      socketService.off('order:status-updated');
      socketService.off('order:cancelled');
      socketService.off('menu:availability-changed');
      socketService.off('menu:stock-updated');
      socketService.off('menu:item-updated');
      unsubscribe(ordersChannel);
      unsubscribe(menuChannel);
    };
  }, [fetchOrders, fetchMenuItems, playNotificationBeep]);

  const handleStatusUpdate = useCallback(async (orderId: number, status: OrderStatus) => {
    setOrders(prev => {
      if (['completed', 'cancelled'].includes(status)) {
        return prev.filter(o => o.id !== orderId);
      }
      return prev.map(o => o.id === orderId ? { ...o, status } : o);
    });
    try {
      await orderService.updateStatus(orderId, status);
    } catch (err) {
      console.error('Failed to update status:', err);
      fetchOrders();
    }
  }, [fetchOrders]);

  const totalActive = orders.filter(o => ['pending', 'preparing'].includes(o.status)).length;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: linear-gradient(135deg, #0a0a1a, #1a0a2e, #0f0a1f); min-height: 100vh; font-family: 'Rajdhani', sans-serif; }
        @keyframes scanline { 0%{background-position:0 0} 100%{background-position:0 100vh} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes slideInDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }

        /* class names — layout overridden by index.css media queries */
      `}</style>

      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a1a, #1a0a2e, #0f0a1f)', position: 'relative' }}>
        {/* Grid overlay */}
        <div style={{
          position: 'fixed', inset: 0,
          backgroundImage: 'linear-gradient(rgba(0,245,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.02) 1px, transparent 1px)',
          backgroundSize: '40px 40px', pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Header */}
        <header className="chef-header" style={{
          position: 'sticky', top: 0, zIndex: 50, height: '80px',
          background: 'rgba(10,10,26,0.88)', backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(0,245,255,0.2)',
          boxShadow: '0 4px 30px rgba(0,245,255,0.08)',
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
          padding: '0 40px', animation: 'slideInDown 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '28px' }}>👨‍🍳</span>
            <div>
              <h1 style={{
                fontFamily: 'Orbitron, monospace', fontSize: '20px', fontWeight: '900',
                background: 'linear-gradient(90deg, #00f5ff, #ff00ff)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text', letterSpacing: '3px', lineHeight: 1,
              }}>KITCHEN DISPLAY</h1>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.35)', letterSpacing: '2px', marginTop: '2px' }}>
                SMART CANTEEN · CHEF STATION
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{
              background: 'rgba(255,237,78,0.08)', border: '1px solid rgba(255,237,78,0.3)',
              borderRadius: '12px', padding: '8px 20px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '22px', fontWeight: '700', color: '#ffed4e', lineHeight: 1, textShadow: '0 0 15px rgba(255,237,78,0.6)' }}>
                {totalActive}
              </span>
              <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '10px', color: 'rgba(255,237,78,0.6)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                Active Orders
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', justifyContent: 'flex-end' }}>
            <button onClick={() => setSoundEnabled(s => !s)} title={soundEnabled ? 'Disable sound' : 'Enable sound'} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '6px 12px',
              color: soundEnabled ? '#00f5ff' : 'rgba(255,255,255,0.3)',
              cursor: 'pointer', fontSize: '16px', transition: 'all 0.2s',
            }}>
              {soundEnabled ? '🔔' : '🔕'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: connectionStatus === 'connected' ? '#00ff88' : '#ff3366',
                boxShadow: connectionStatus === 'connected' ? '0 0 10px #00ff88' : '0 0 10px #ff3366',
                animation: connectionStatus === 'disconnected' ? 'blink 1s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '12px', color: connectionStatus === 'connected' ? '#00ff88' : '#ff3366', letterSpacing: '1px', fontWeight: '600' }}>
                {connectionStatus === 'connected' ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
            <div style={{ fontFamily: 'Orbitron, monospace', fontSize: '16px', color: 'rgba(255,255,255,0.7)', letterSpacing: '2px', minWidth: '80px', textAlign: 'right' }}>
              {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="chef-main" style={{ position: 'relative', zIndex: 1, padding: '28px 40px 60px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '20px' }}>
              <div style={{ width: '60px', height: '60px', border: '3px solid rgba(0,245,255,0.1)', borderTop: '3px solid #00f5ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '14px', color: 'rgba(0,245,255,0.6)', letterSpacing: '3px' }}>LOADING KITCHEN...</span>
            </div>
          ) : (
            <>
              {/* Stats Row */}
              <StatsRow orders={orders} menuItems={menuItems} />

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.08)', width: 'fit-content' }}>
                {(['orders', 'menu'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '10px 28px',
                      background: activeTab === tab ? 'rgba(0,245,255,0.12)' : 'transparent',
                      border: activeTab === tab ? '1px solid rgba(0,245,255,0.4)' : '1px solid transparent',
                      borderRadius: '8px',
                      color: activeTab === tab ? '#00f5ff' : 'rgba(255,255,255,0.4)',
                      fontFamily: 'Orbitron, monospace',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      letterSpacing: '2px',
                      textTransform: 'uppercase',
                      transition: 'all 0.2s',
                      boxShadow: activeTab === tab ? '0 0 15px rgba(0,245,255,0.2)' : 'none',
                    }}
                  >
                    {tab === 'orders' ? '📋 Orders' : '✏️ Edit Menu'}
                  </button>
                ))}
              </div>

              {activeTab === 'orders' ? (
                <OrdersTab orders={orders} onStatusUpdate={handleStatusUpdate} />
              ) : (
                <EditMenuTab items={menuItems} onRefresh={fetchMenuItems} />
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
};

export default ChefDisplay;
