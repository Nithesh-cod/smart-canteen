import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from '../components/owner/Dashboard';
import SalesChart from '../components/owner/SalesChart';
import OfferManager from '../components/owner/OfferManager';
import Modal from '../components/common/Modal';
import { useToast } from '../components/common/Toast';
import api from '../services/api';
import socketService from '../services/socket.service';
import { subscribeToTable, unsubscribe } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Order, MenuItem, Student, DashboardStats, Offer } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type PageId = 'dashboard' | 'sales' | 'orders' | 'menu' | 'offers' | 'students';

const navItems: Array<{ id: PageId; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'sales',     label: 'Sales',     icon: '📈' },
  { id: 'orders',    label: 'Orders',    icon: '📋' },
  { id: 'menu',      label: 'Menu',      icon: '🍽️' },
  { id: 'offers',    label: 'Offers',    icon: '🎁' },
  { id: 'students',  label: 'Students',  icon: '👥' },
];

// ─── Status helpers ────────────────────────────────────────────────────────────

const statusColor = (status: string): { bg: string; text: string; border: string } => {
  switch (status) {
    case 'pending':   return { bg: 'rgba(255,237,78,0.2)',   text: '#ffed4e',               border: '#ffed4e' };
    case 'preparing': return { bg: 'rgba(0,245,255,0.2)',    text: '#00f5ff',               border: '#00f5ff' };
    case 'ready':     return { bg: 'rgba(0,255,136,0.2)',    text: '#00ff88',               border: '#00ff88' };
    case 'completed': return { bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.3)' };
    case 'cancelled': return { bg: 'rgba(255,51,102,0.2)',   text: '#ff3366',               border: '#ff3366' };
    default:          return { bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.3)' };
  }
};

const tierColor = (tier: string): string => {
  switch (tier?.toLowerCase()) {
    case 'bronze':   return '#cd7f32';
    case 'silver':   return '#c0c0c0';
    case 'gold':     return '#ffd700';
    case 'platinum': return '#e5e4e2';
    default:         return '#c0c0c0';
  }
};

// ─── Shared style helpers ──────────────────────────────────────────────────────

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20,
  padding: 25,
};

const glassInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  padding: '10px 14px',
  color: '#fff',
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '0.95rem',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const inputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.currentTarget.style.borderColor = '#00f5ff';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,245,255,0.12)';
};
const inputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
  e.currentTarget.style.boxShadow = 'none';
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 5,
  color: 'rgba(255,255,255,0.55)',
  fontFamily: 'Rajdhani, sans-serif',
  fontWeight: 600,
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
};

// ─── OrdersTable ──────────────────────────────────────────────────────────────

const ORDER_STATUS_FILTERS = ['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled'];

const OrdersTable: React.FC<{ orders: Order[]; onRefresh: () => void }> = ({ orders, onRefresh }) => {
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered =
    statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter);

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
      });
    } catch { return dateStr; }
  };

  return (
    <div>
      {/* Filter Pills + Refresh */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ORDER_STATUS_FILTERS.map((f) => {
            const isActive = statusFilter === f;
            const sc = f !== 'all' ? statusColor(f) : null;
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 25,
                  border: `1px solid ${isActive && sc ? sc.border : isActive ? '#00f5ff' : 'rgba(255,255,255,0.15)'}`,
                  background: isActive && sc ? sc.bg : isActive ? 'rgba(0,245,255,0.15)' : 'rgba(255,255,255,0.03)',
                  color: isActive && sc ? sc.text : isActive ? '#00f5ff' : 'rgba(255,255,255,0.5)',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s',
                  letterSpacing: 0.3,
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
        <button
          onClick={onRefresh}
          style={{
            background: 'rgba(0,245,255,0.1)',
            border: '1px solid rgba(0,245,255,0.3)',
            color: '#00f5ff',
            borderRadius: 10,
            padding: '7px 18px',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,245,255,0.2)')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,245,255,0.1)')
          }
        >
          🔄 Refresh
        </button>
      </div>

      {/* Table */}
      <div style={{ ...glassCard, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'Rajdhani, sans-serif',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'rgba(0,245,255,0.04)',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {['Order #', 'Student', 'Amount', 'Status', 'Payment', 'Time'].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '14px 16px',
                      textAlign: 'left',
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.45)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const sc = statusColor(order.status);
                const paid = order.payment_status === 'paid' || order.payment_status === 'completed';
                return (
                  <tr
                    key={order.id}
                    style={{ transition: 'background 0.15s', cursor: 'default' }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLTableRowElement).style.background =
                        'rgba(255,255,255,0.03)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLTableRowElement).style.background =
                        'transparent')
                    }
                  >
                    <td
                      style={{
                        padding: '13px 16px',
                        color: '#00f5ff',
                        fontWeight: 700,
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {order.order_number}
                    </td>
                    <td
                      style={{
                        padding: '13px 16px',
                        color: 'rgba(255,255,255,0.8)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{order.student_name || '—'}</div>
                      {order.student_roll && (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)' }}>
                          {order.student_roll}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '13px 16px',
                        color: '#ffed4e',
                        fontWeight: 700,
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      ₹{Number(order.total_amount).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span
                        style={{
                          background: sc.bg,
                          color: sc.text,
                          border: `1px solid ${sc.border}`,
                          borderRadius: 20,
                          padding: '3px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                        }}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span
                        style={{
                          background: paid ? 'rgba(0,255,136,0.12)' : 'rgba(255,237,78,0.12)',
                          color: paid ? '#00ff88' : '#ffed4e',
                          border: `1px solid ${paid ? 'rgba(0,255,136,0.3)' : 'rgba(255,237,78,0.3)'}`,
                          borderRadius: 20,
                          padding: '3px 10px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                        }}
                      >
                        {order.payment_status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '13px 16px',
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: '0.82rem',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {formatTime(order.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.3)',
                fontFamily: 'Rajdhani, sans-serif',
              }}
            >
              No {statusFilter !== 'all' ? statusFilter : ''} orders found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── MenuManagement ───────────────────────────────────────────────────────────

const MENU_CATEGORIES = [
  'Main Course', 'Snacks', 'Beverages', 'Desserts',
  'Breakfast', 'Combo', 'Specials', 'Other',
];

interface MenuFormData {
  name: string;
  category: string;
  price: string;
  description: string;
  is_vegetarian: boolean;
  preparation_time: string;
  stock_quantity: string;
}

const defaultMenuForm = (): MenuFormData => ({
  name: '',
  category: 'Snacks',
  price: '',
  description: '',
  is_vegetarian: true,
  preparation_time: '10',
  stock_quantity: '-1',
});

const MenuManagement: React.FC<{ items: MenuItem[]; onRefresh: () => void }> = ({
  items,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<MenuFormData>(defaultMenuForm());
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { showToast } = useToast();

  const filtered = items.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingItem(null);
    setFormData(defaultMenuForm());
    setShowAddForm(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      price: String(item.price),
      description: item.description ?? '',
      is_vegetarian: item.is_vegetarian,
      preparation_time: String(item.preparation_time ?? 10),
      stock_quantity: String(item.stock_quantity ?? -1),
    });
    setShowAddForm(true);
  };

  const closeForm = () => {
    setShowAddForm(false);
    setEditingItem(null);
    setFormData(defaultMenuForm());
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.price) {
      showToast('Name and price are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const stockVal = parseInt(formData.stock_quantity);
      const payload = {
        name: formData.name.trim(),
        category: formData.category,
        price: parseFloat(formData.price),
        description: formData.description.trim(),
        is_vegetarian: formData.is_vegetarian,
        preparation_time: parseInt(formData.preparation_time) || 10,
        stock_quantity: isNaN(stockVal) ? -1 : stockVal,
      };
      if (editingItem) {
        await api.put(`/menu/${editingItem.id}`, payload);
        showToast('Item updated!', 'success');
      } else {
        await api.post('/menu', payload);
        showToast('Item added!', 'success');
      }
      closeForm();
      onRefresh();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to save item', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: MenuItem) => {
    setTogglingId(item.id);
    try {
      await api.patch(`/menu/${item.id}/availability`);
      onRefresh();
    } catch (err: any) {
      showToast('Failed to toggle availability', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this menu item?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/menu/${id}`);
      showToast('Item deleted', 'success');
      onRefresh();
    } catch (err: any) {
      showToast('Failed to delete item', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          placeholder="🔍 Search menu items or categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...glassInput,
            flex: 1,
            minWidth: 220,
            padding: '11px 16px',
          }}
          onFocus={inputFocus}
          onBlur={inputBlur}
        />
        <button
          onClick={openAdd}
          style={{
            background: 'linear-gradient(135deg, rgba(0,245,255,0.2), rgba(255,0,255,0.2))',
            border: '1px solid rgba(0,245,255,0.5)',
            color: '#00f5ff',
            borderRadius: 12,
            padding: '11px 22px',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              'linear-gradient(135deg, rgba(0,245,255,0.3), rgba(255,0,255,0.3))')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              'linear-gradient(135deg, rgba(0,245,255,0.2), rgba(255,0,255,0.2))')
          }
        >
          + Add Item
        </button>
      </div>

      {/* Items Table */}
      <div style={{ ...glassCard, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'Rajdhani, sans-serif',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'rgba(0,245,255,0.04)',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {['Item', 'Category', 'Price', 'Stock', 'Type', 'Available', 'Actions'].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '14px 16px',
                      textAlign: 'left',
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.45)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  style={{ transition: 'background 0.15s', cursor: 'default' }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background =
                      'rgba(255,255,255,0.03)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')
                  }
                >
                  <td
                    style={{
                      padding: '13px 16px',
                      color: '#fff',
                      fontWeight: 600,
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div>{item.name}</div>
                    {item.rating > 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#ffed4e' }}>
                        {'★'.repeat(Math.round(item.rating))} {item.rating.toFixed(1)}
                      </div>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '13px 16px',
                      color: 'rgba(255,255,255,0.55)',
                      fontSize: '0.88rem',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    {item.category}
                  </td>
                  <td
                    style={{
                      padding: '13px 16px',
                      color: '#ffed4e',
                      fontWeight: 700,
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    ₹{Number(item.price).toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {(() => {
                      const sq = item.stock_quantity;
                      if (sq === null || sq === undefined || sq === -1) {
                        return <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem' }}>∞ Unlimited</span>;
                      }
                      if (sq === 0) {
                        return <span style={{ color: '#ff3366', fontWeight: 700, fontSize: '0.82rem' }}>Out of Stock</span>;
                      }
                      return (
                        <span style={{ color: sq <= 5 ? '#ffed4e' : '#00ff88', fontWeight: 700, fontSize: '0.82rem' }}>
                          {sq <= 5 ? `⚠️ ${sq}` : sq}
                        </span>
                      );
                    })()}
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span
                      style={{
                        background: item.is_vegetarian
                          ? 'rgba(0,255,136,0.12)'
                          : 'rgba(255,51,102,0.12)',
                        color: item.is_vegetarian ? '#00ff88' : '#ff3366',
                        border: `1px solid ${item.is_vegetarian ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)'}`,
                        borderRadius: 20,
                        padding: '3px 10px',
                        fontSize: '0.73rem',
                        fontWeight: 700,
                      }}
                    >
                      {item.is_vegetarian ? '🟢 Veg' : '🔴 Non-Veg'}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={togglingId === item.id}
                      style={{
                        background: item.is_available
                          ? 'rgba(0,255,136,0.18)'
                          : 'rgba(255,51,102,0.12)',
                        border: `1px solid ${item.is_available ? '#00ff88' : '#ff3366'}`,
                        color: item.is_available ? '#00ff88' : '#ff3366',
                        borderRadius: 20,
                        padding: '4px 14px',
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        fontFamily: 'Rajdhani, sans-serif',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        opacity: togglingId === item.id ? 0.5 : 1,
                      }}
                    >
                      {togglingId === item.id ? '...' : item.is_available ? '● On' : '○ Off'}
                    </button>
                  </td>
                  <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => openEdit(item)}
                        style={{
                          background: 'rgba(0,245,255,0.1)',
                          border: '1px solid rgba(0,245,255,0.3)',
                          color: '#00f5ff',
                          borderRadius: 8,
                          padding: '5px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          fontFamily: 'Rajdhani, sans-serif',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.background =
                            'rgba(0,245,255,0.2)')
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.background =
                            'rgba(0,245,255,0.1)')
                        }
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        style={{
                          background: 'rgba(255,51,102,0.1)',
                          border: '1px solid rgba(255,51,102,0.3)',
                          color: '#ff3366',
                          borderRadius: 8,
                          padding: '5px 12px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          fontFamily: 'Rajdhani, sans-serif',
                          cursor: deletingId === item.id ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          opacity: deletingId === item.id ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => {
                          if (deletingId !== item.id)
                            (e.currentTarget as HTMLButtonElement).style.background =
                              'rgba(255,51,102,0.2)';
                        }}
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.background =
                            'rgba(255,51,102,0.1)')
                        }
                      >
                        {deletingId === item.id ? '...' : '🗑️'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.3)',
                fontFamily: 'Rajdhani, sans-serif',
              }}
            >
              {search ? 'No items match your search' : 'No menu items yet'}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAddForm && (
        <Modal
          isOpen={showAddForm}
          onClose={closeForm}
          title={editingItem ? `Edit: ${editingItem.name}` : 'Add Menu Item'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Item Name *</label>
              <input
                type="text"
                placeholder="e.g. Paneer Tikka"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                style={{ ...glassInput, width: '100%', boxSizing: 'border-box' }}
                onFocus={inputFocus}
                onBlur={inputBlur}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Category *</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData((f) => ({ ...f, category: e.target.value }))}
                  style={{
                    ...glassInput,
                    width: '100%',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                  onFocus={inputFocus}
                  onBlur={inputBlur}
                >
                  {MENU_CATEGORIES.map((cat) => (
                    <option
                      key={cat}
                      value={cat}
                      style={{ background: '#1a0a2e', color: '#fff' }}
                    >
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Price (₹) *</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 80"
                  value={formData.price}
                  onChange={(e) => setFormData((f) => ({ ...f, price: e.target.value }))}
                  style={{ ...glassInput, width: '100%', boxSizing: 'border-box' }}
                  onFocus={inputFocus}
                  onBlur={inputBlur}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                placeholder="Describe the item..."
                value={formData.description}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, description: e.target.value }))
                }
                style={{
                  ...glassInput,
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  minHeight: 70,
                }}
                onFocus={inputFocus}
                onBlur={inputBlur}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Prep Time (min)</label>
                <input
                  type="number"
                  min="1"
                  value={formData.preparation_time}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, preparation_time: e.target.value }))
                  }
                  style={{ ...glassInput, width: '100%', boxSizing: 'border-box' }}
                  onFocus={inputFocus}
                  onBlur={inputBlur}
                />
              </div>
              <div>
                <label style={labelStyle}>Stock (-1 = unlimited)</label>
                <input
                  type="number"
                  min="-1"
                  value={formData.stock_quantity}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, stock_quantity: e.target.value }))
                  }
                  style={{ ...glassInput, width: '100%', boxSizing: 'border-box' }}
                  onFocus={inputFocus}
                  onBlur={inputBlur}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div />
              <div>
                <label style={labelStyle}>Type</label>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    marginTop: 6,
                    alignItems: 'center',
                    height: 40,
                  }}
                >
                  {[true, false].map((isVeg) => (
                    <label
                      key={String(isVeg)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        fontFamily: 'Rajdhani, sans-serif',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        color:
                          formData.is_vegetarian === isVeg
                            ? isVeg
                              ? '#00ff88'
                              : '#ff3366'
                            : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      <input
                        type="radio"
                        name="vegType"
                        checked={formData.is_vegetarian === isVeg}
                        onChange={() => setFormData((f) => ({ ...f, is_vegetarian: isVeg }))}
                        style={{ accentColor: isVeg ? '#00ff88' : '#ff3366' }}
                      />
                      {isVeg ? '🟢 Veg' : '🔴 Non-Veg'}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, rgba(0,245,255,0.25), rgba(255,0,255,0.25))',
                  border: '1px solid rgba(0,245,255,0.5)',
                  color: '#00f5ff',
                  borderRadius: 12,
                  padding: '12px 0',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Item'}
              </button>
              <button
                onClick={closeForm}
                disabled={saving}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.6)',
                  borderRadius: 12,
                  padding: '12px 0',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── StudentsTable ────────────────────────────────────────────────────────────

const StudentsTable: React.FC<{ students: Student[]; onRefresh: () => void }> = ({
  students,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');

  const filtered = students.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.roll_number.toLowerCase().includes(search.toLowerCase()) ||
      s.phone.includes(search)
  );

  return (
    <div>
      {/* Search + Refresh */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          placeholder="🔍 Search by name, roll number, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...glassInput, flex: 1, minWidth: 220, padding: '11px 16px' }}
          onFocus={inputFocus}
          onBlur={inputBlur}
        />
        <button
          onClick={onRefresh}
          style={{
            background: 'rgba(0,245,255,0.1)',
            border: '1px solid rgba(0,245,255,0.3)',
            color: '#00f5ff',
            borderRadius: 10,
            padding: '10px 18px',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {/* Summary */}
      <div
        style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '0.85rem',
          color: 'rgba(255,255,255,0.4)',
          marginBottom: 14,
        }}
      >
        Showing {filtered.length} of {students.length} students
      </div>

      <div style={{ ...glassCard, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'Rajdhani, sans-serif',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'rgba(0,245,255,0.04)',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {['Name', 'Roll #', 'Phone', 'Tier', 'Points', 'Total Spent', 'Orders', 'Active'].map(
                  (col) => (
                    <th
                      key={col}
                      style={{
                        padding: '14px 16px',
                        textAlign: 'left',
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.45)',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                      }}
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((student) => {
                const tc = tierColor(student.tier);
                return (
                  <tr
                    key={student.id}
                    style={{ transition: 'background 0.15s', cursor: 'default' }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLTableRowElement).style.background =
                        'rgba(255,255,255,0.03)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLTableRowElement).style.background =
                        'transparent')
                    }
                  >
                    <td
                      style={{
                        padding: '13px 16px',
                        color: '#fff',
                        fontWeight: 600,
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {student.name}
                    </td>
                    <td
                      style={{
                        padding: '13px 16px',
                        color: '#00f5ff',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {student.roll_number}
                    </td>
                    <td
                      style={{
                        padding: '13px 16px',
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '0.88rem',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {student.phone}
                    </td>
                    <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span
                        style={{
                          background: `${tc}22`,
                          color: tc,
                          border: `1px solid ${tc}55`,
                          borderRadius: 20,
                          padding: '3px 12px',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                        }}
                      >
                        {student.tier}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '13px 16px',
                        color: '#ff00ff',
                        fontWeight: 700,
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {Number(student.points).toLocaleString('en-IN')}
                    </td>
                    <td
                      style={{
                        padding: '13px 16px',
                        color: '#ffed4e',
                        fontWeight: 700,
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      ₹{Number(student.total_spent).toLocaleString('en-IN')}
                    </td>
                    <td
                      style={{
                        padding: '13px 16px',
                        color: 'rgba(255,255,255,0.7)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {student.total_orders}
                    </td>
                    <td style={{ padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span
                        style={{
                          background: student.is_active
                            ? 'rgba(0,255,136,0.12)'
                            : 'rgba(255,51,102,0.1)',
                          color: student.is_active ? '#00ff88' : '#ff3366',
                          border: `1px solid ${student.is_active ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)'}`,
                          borderRadius: 20,
                          padding: '3px 10px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        {student.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.3)',
                fontFamily: 'Rajdhani, sans-serif',
              }}
            >
              {search ? 'No students match your search' : 'No students found'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── OwnerDashboard (main page) ───────────────────────────────────────────────

const OwnerDashboard: React.FC = () => {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenueData, setRevenueData] = useState<Array<{ date: string; revenue: number }>>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [period, setPeriod] = useState<'7days' | '30days' | '90days'>('7days');
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/admin/dashboard');
      const d = res.data?.data ?? res.data;
      if (!d) return;
      // Transform the backend shape → DashboardStats shape expected by <Dashboard>
      const mapped: DashboardStats = {
        todayRevenue:  Number(d.revenue?.today?.amount   ?? 0),
        weekRevenue:   Number(d.revenue?.week?.amount    ?? 0),
        monthRevenue:  Number(d.revenue?.month?.amount   ?? 0),
        todayOrders:   Number(d.revenue?.today?.order_count ?? 0),
        pendingOrders: Number(d.pending_orders ?? 0),
        topItems:      d.top_items ?? [],
        recentOrders:  d.recent_orders ?? [],
        // Backend sends { tier, count }; Dashboard.tsx reads student_count
        tierDistribution: (d.tier_distribution ?? []).map(
          (t: { tier: string; count?: number; student_count?: number }) => ({
            tier: t.tier,
            student_count: Number(t.student_count ?? t.count ?? 0),
          })
        ),
      };
      setStats(mapped);
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    }
  }, []);

  const fetchRevenue = useCallback(async (p: string) => {
    try {
      const res = await api.get(`/admin/revenue?period=${p}`);
      // Backend returns { data: { period, days, revenue: [...] } }
      setRevenueData(res.data?.data?.revenue ?? res.data?.data ?? []);
    } catch {
      setRevenueData([]);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.get('/orders?limit=50');
      setOrders(res.data?.data?.orders ?? res.data?.data ?? []);
    } catch (e) {
      setOrders([]);
    }
  }, []);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await api.get('/menu');
      setMenuItems(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (e) {
      setMenuItems([]);
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await api.get('/admin/students');
      setStudents(res.data?.data?.students ?? res.data?.data ?? []);
    } catch (e) {
      setStudents([]);
    }
  }, []);

  const fetchOffers = useCallback(async () => {
    try {
      const res = await api.get('/admin/offers');
      setOffers(res.data.data || []);
    } catch (e) {
      setOffers([]);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.allSettled([
        fetchDashboard(),
        fetchRevenue(period),
        fetchOrders(),
        fetchMenu(),
        fetchStudents(),
        fetchOffers(),
      ]);
      setLoading(false);
    };
    init();

    // ── Polling fallback: refresh dashboard & orders every 30s ─────────────
    // Ensures data stays fresh even if both Socket.IO and Supabase Realtime
    // connections drop (e.g. laptop sleep, network switch).
    const pollInterval = setInterval(() => {
      fetchOrders();
      fetchDashboard();
    }, 30_000);

    return () => clearInterval(pollInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Real-time: Socket.IO + Supabase Realtime (dual layer) ────────────────
  useEffect(() => {
    // ─ Socket.IO (low-latency, server-emitted events) ──────────────────────
    const socket = socketService.connect();
    socketService.joinAsOwner();

    const handleOrderChange = () => {
      fetchOrders();
      fetchDashboard();
    };
    const handleMenuChange = () => {
      fetchMenu();
    };

    socket.on('order:created', handleOrderChange);
    socket.on('order:status-updated', handleOrderChange);
    socket.on('order:cancelled', handleOrderChange);
    socket.on('menu:availability-changed', handleMenuChange);
    socket.on('menu:stock-updated', handleMenuChange);
    socket.on('menu:item-updated', handleMenuChange);
    socket.on('menu:bulk-updated', handleMenuChange);

    // ─ Supabase Realtime (direct DB subscriptions — catches anything missed) ─
    const ordersChannel: RealtimeChannel = subscribeToTable(
      'orders',
      () => { fetchOrders(); fetchDashboard(); },
      'owner:orders'
    );

    const menuChannel: RealtimeChannel = subscribeToTable(
      'menu_items',
      () => { fetchMenu(); },
      'owner:menu_items'
    );

    const studentsChannel: RealtimeChannel = subscribeToTable(
      'students',
      () => { fetchStudents(); fetchDashboard(); },
      'owner:students'
    );

    return () => {
      socket.off('order:created', handleOrderChange);
      socket.off('order:status-updated', handleOrderChange);
      socket.off('order:cancelled', handleOrderChange);
      socket.off('menu:availability-changed', handleMenuChange);
      socket.off('menu:stock-updated', handleMenuChange);
      socket.off('menu:item-updated', handleMenuChange);
      socket.off('menu:bulk-updated', handleMenuChange);
      unsubscribe(ordersChannel);
      unsubscribe(menuChannel);
      unsubscribe(studentsChannel);
    };
  }, [fetchOrders, fetchDashboard, fetchMenu, fetchStudents]);

  const handlePeriodChange = (p: '7days' | '30days' | '90days') => {
    setPeriod(p);
    fetchRevenue(p);
  };

  const currentNav = navItems.find((n) => n.id === activePage);

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0a0a1a, #1a0a2e, #0f0a1f)',
        }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: 250,
            minHeight: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            background: 'rgba(10,10,26,0.97)',
            backdropFilter: 'blur(20px)',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            padding: '30px 15px',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Logo */}
          <div
            style={{
              textAlign: 'center',
              marginBottom: 40,
              padding: '0 10px',
            }}
          >
            <div
              style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '1.2rem',
                fontWeight: 900,
                background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              🍕 SMART CANTEEN
            </div>
            <div
              style={{
                fontSize: '0.7rem',
                color: 'rgba(255,255,255,0.4)',
                marginTop: 4,
                letterSpacing: 2,
                fontFamily: 'Rajdhani, sans-serif',
              }}
            >
              OWNER PORTAL
            </div>
          </div>

          {/* Nav Items */}
          <nav style={{ flex: 1 }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 18px',
                  marginBottom: 6,
                  borderRadius: 12,
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '1rem',
                  fontWeight: 600,
                  transition: 'all 0.3s',
                  background:
                    activePage === item.id
                      ? 'rgba(0,245,255,0.12)'
                      : 'transparent',
                  color:
                    activePage === item.id
                      ? '#00f5ff'
                      : 'rgba(255,255,255,0.65)',
                  borderLeft:
                    activePage === item.id
                      ? '4px solid #00f5ff'
                      : '4px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (activePage !== item.id) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(0,245,255,0.06)';
                    (e.currentTarget as HTMLButtonElement).style.color =
                      'rgba(255,255,255,0.85)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activePage !== item.id) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color =
                      'rgba(255,255,255,0.65)';
                  }
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: 16,
              fontSize: '0.72rem',
              color: 'rgba(255,255,255,0.25)',
              fontFamily: 'Rajdhani, sans-serif',
              textAlign: 'center',
              letterSpacing: 0.5,
            }}
          >
            Smart Canteen v1.0
          </div>
        </aside>

        {/* Main Content */}
        <main
          style={{
            marginLeft: 250,
            flex: 1,
            padding: '35px 40px',
            minHeight: '100vh',
          }}
        >
          {/* Top Bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 35,
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              paddingBottom: 20,
            }}
          >
            <h1
              style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '2rem',
                fontWeight: 900,
                background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: 0,
              }}
            >
              {currentNav?.icon} {currentNav?.label}
            </h1>
            <div
              style={{
                background: 'rgba(255,215,0,0.1)',
                border: '1px solid #ffd700',
                borderRadius: 25,
                padding: '8px 20px',
                color: '#ffd700',
                fontWeight: 600,
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '0.9rem',
              }}
            >
              👔 Owner
            </div>
          </div>

          {/* Page Content */}
          {loading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 80,
                flexDirection: 'column',
                gap: 20,
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  border: '4px solid rgba(0,245,255,0.2)',
                  borderTop: '4px solid #00f5ff',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <div
                style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '0.9rem',
                  letterSpacing: 1,
                }}
              >
                Loading dashboard...
              </div>
            </div>
          ) : (
            <>
              {activePage === 'dashboard' && stats && (
                <Dashboard stats={stats} />
              )}
              {activePage === 'dashboard' && !stats && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: 60,
                    color: 'rgba(255,255,255,0.35)',
                    fontFamily: 'Rajdhani, sans-serif',
                  }}
                >
                  No dashboard data available
                </div>
              )}
              {activePage === 'sales' && (
                <SalesChart
                  data={revenueData}
                  period={period}
                  onPeriodChange={handlePeriodChange}
                />
              )}
              {activePage === 'orders' && (
                <OrdersTable orders={orders} onRefresh={fetchOrders} />
              )}
              {activePage === 'menu' && (
                <MenuManagement items={menuItems} onRefresh={fetchMenu} />
              )}
              {activePage === 'offers' && (
                <OfferManager offers={offers} onRefresh={fetchOffers} />
              )}
              {activePage === 'students' && (
                <StudentsTable students={students} onRefresh={fetchStudents} />
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
};

export default OwnerDashboard;
