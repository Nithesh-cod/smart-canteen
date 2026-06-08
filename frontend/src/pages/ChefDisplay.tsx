import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as orderService from '../services/order.service';
import * as menuService from '../services/menu.service';
import socketService from '../services/socket.service';
import { subscribeToTable, unsubscribe } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Order, MenuItem, OrderStatus } from '../types';
import api from '../services/api';
import { useToast } from '../components/common/Toast';

// ─── Stats Row ────────────────────────────────────────────────────────────────

const StatsRow: React.FC<{ orders: Order[]; todayOrders: Order[]; menuItems: MenuItem[] }> = ({ orders, todayOrders }) => {
  const pending   = orders.filter(o => o.status === 'pending').length;
  const preparing = orders.filter(o => o.status === 'preparing').length;
  const ready     = orders.filter(o => o.status === 'ready').length;

  // Revenue: only COMPLETED orders from today (completing an order locks in the sale)
  const today = new Date().toDateString();
  const revenue = todayOrders
    .filter(o => o.status === 'completed' && new Date(o.created_at).toDateString() === today)
    .reduce((sum, o) => sum + Number(o.total_amount), 0);

  // Crystal-language stat tiles — same notched-polygon shape as OwnerStatGrid.
  // Numerical glyphs render as Orbitron monospace with the value padded to
  // 2 digits so single-digit counts don't make the layout dance, and the
  // big number gets a colour-matched glow that matches the tile tone.
  const stats: Array<{
    label: string; value: string; glyph: string; sub: string; tone: string; glow: string;
  }> = [
    { label: 'Pending Queue',  value: String(pending).padStart(2, '0'),   glyph: '◷', sub: 'awaiting accept', tone: '#ffed4e', glow: 'rgba(255,237,78,0.45)' },
    { label: 'On the Line',    value: String(preparing).padStart(2, '0'), glyph: '◈', sub: 'in preparation',  tone: '#00ff88', glow: 'rgba(0,255,136,0.45)' },
    { label: 'Ready for Pickup', value: String(ready).padStart(2, '0'),   glyph: '✦', sub: 'awaiting collect',tone: '#00ff88', glow: 'rgba(0,255,136,0.45)' },
    { label: "Today's Revenue", value: `₹${Math.round(revenue).toLocaleString('en-IN')}`, glyph: '◊', sub: 'sealed today',    tone: '#ffed4e', glow: 'rgba(255,237,78,0.45)' },
  ];

  return (
    <>
      <style>{`
        .chef-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 28px;
        }
        @media (max-width: 880px) {
          .chef-stats-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .chef-stat-tile {
          position: relative;
          padding: 18px 22px 20px;
          background:
            linear-gradient(180deg, rgba(0,255,136,0.04) 0%, transparent 40%),
            linear-gradient(180deg, #0a1816 0%, #07100e 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%);
          overflow: hidden;
          transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
        }
        .chef-stat-tile::before {
          content: ''; position: absolute; top: 0; left: 6%; right: 24%; height: 1px;
          background: linear-gradient(90deg, transparent, var(--chef-stat-glow, rgba(0,255,136,0.5)), transparent);
        }
        .chef-stat-tile:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.12);
          box-shadow: 0 12px 30px rgba(0,255,136,0.1);
        }
        .chef-stat-head {
          display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
        }
        .chef-stat-glyph {
          font-family: 'Orbitron', monospace;
          font-size: 0.95rem; line-height: 1;
        }
        .chef-stat-label {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.6rem;
          letter-spacing: 0.22em;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
        }
        .chef-stat-value {
          font-family: 'Orbitron', monospace;
          font-size: 1.9rem;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0.02em;
        }
        .chef-stat-sub {
          font-family: 'Orbitron', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          margin-top: 6px;
        }
      `}</style>

      <div className="chef-stats-grid">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="chef-stat-tile"
            style={{ ['--chef-stat-glow' as any]: stat.glow }}
          >
            <div className="chef-stat-head">
              <span className="chef-stat-glyph" style={{ color: stat.tone, textShadow: `0 0 8px ${stat.tone}` }}>
                {stat.glyph}
              </span>
              <span className="chef-stat-label">{stat.label}</span>
            </div>
            <div className="chef-stat-value" style={{ color: stat.tone, textShadow: `0 0 22px ${stat.glow}` }}>
              {stat.value}
            </div>
            <div className="chef-stat-sub">{stat.sub}</div>
          </div>
        ))}
      </div>
    </>
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

const STATUS_CONFIG: Record<string, { border: string; glow: string; label: string; glyph: string }> = {
  pending:   { border: '#ffed4e', glow: 'rgba(255,237,78,0.45)',    label: 'PENDING',   glyph: '◷' },
  preparing: { border: '#00ff88', glow: 'rgba(0, 255, 136,0.45)',   label: 'PREPARING', glyph: '◈' },
  ready:     { border: '#00ff88', glow: 'rgba(0,255,136,0.55)',     label: 'READY',     glyph: '✦' },
  completed: { border: 'rgba(255,255,255,0.2)', glow: 'transparent', label: 'DONE',     glyph: '✓' },
  cancelled: { border: '#ff3366', glow: 'rgba(255,51,102,0.45)',    label: 'CANCELLED', glyph: '✕' },
};

const ChefOrderCard: React.FC<{
  order: Order;
  onStatusUpdate: (id: number, status: OrderStatus) => void;
  onSpeak?: (order: Order) => void;
  isSpeaking?: boolean;
}> = ({ order, onStatusUpdate, onSpeak, isSpeaking }) => {
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
        @keyframes chef-card-rise {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chef-card-newpulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.55; transform: scale(0.92); }
        }
        @keyframes chef-card-readyglow {
          0%, 100% { box-shadow: 0 0 22px rgba(0,255,136,0.22), inset 0 0 0 1px rgba(0,255,136,0.18); }
          50%      { box-shadow: 0 0 52px rgba(0,255,136,0.45), inset 0 0 0 1px rgba(0,255,136,0.45); }
        }
      `}</style>
      <div style={{
        position: 'relative',
        padding: '16px 18px 18px',
        marginBottom: 14,
        background:
          `linear-gradient(180deg, ${cfg.border}10 0%, transparent 35%), linear-gradient(180deg, #0a1816 0%, #07100e 100%)`,
        border: `1px solid ${cfg.border}55`,
        borderRadius: 16,
        clipPath: 'polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%)',
        animation: isReady
          ? 'chef-card-rise 0.45s cubic-bezier(0.16, 1, 0.3, 1) both, chef-card-readyglow 2.4s ease-in-out infinite'
          : 'chef-card-rise 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        boxShadow: isNew
          ? `0 12px 36px ${cfg.border}33, inset 0 0 0 1px ${cfg.border}40`
          : isReady ? undefined : `0 6px 18px rgba(0,0,0,0.5)`,
        overflow: 'hidden',
        transition: 'box-shadow 0.3s ease',
      }}>
        {/* Top-edge HUD highlight — same crystal language as the kiosk cards */}
        <div style={{
          position: 'absolute', top: 0, left: '6%', right: '24%', height: 1,
          background: `linear-gradient(90deg, transparent, ${cfg.border}, transparent)`,
        }} />

        {isNew && (
          <div style={{
            position: 'absolute', top: 12, right: 16,
            background: '#ffed4e', color: '#050a0c',
            fontSize: '0.55rem', fontFamily: 'Orbitron, monospace', fontWeight: 800,
            padding: '3px 7px', borderRadius: 3, letterSpacing: '0.2em',
            animation: 'chef-card-newpulse 1.2s ease-in-out infinite',
            textShadow: 'none',
          }}>NEW</div>
        )}

        {/* Header — status glyph + order number + relative time */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12,
        }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'Orbitron, monospace', fontSize: '0.78rem', fontWeight: 700,
            color: cfg.border, letterSpacing: '0.15em',
            textShadow: `0 0 10px ${cfg.border}88`,
          }}>
            <span style={{ fontSize: '0.95rem' }}>{cfg.glyph}</span>
            #{order.order_number}
          </span>
          <span style={{
            fontFamily: 'Orbitron, monospace', fontSize: '0.65rem',
            color: isOld ? '#ff3366' : 'rgba(255,255,255,0.45)',
            fontWeight: isOld ? 700 : 500,
            letterSpacing: '0.12em',
          }}>
            {isOld ? '⚠ ' : ''}{timeText}
          </span>
        </div>

        {/* Student info */}
        {(order.student_name || order.student_roll) && (
          <div style={{
            fontFamily: 'Rajdhani, sans-serif',
            color: 'rgba(255,255,255,0.78)',
            marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: '0.92rem',
          }}>
            <span style={{ color: cfg.border, fontFamily: 'Orbitron, monospace', fontSize: '0.85rem' }}>◯</span>
            <span style={{ fontWeight: 600 }}>{order.student_name}</span>
            {order.student_roll && (
              <span style={{
                fontFamily: 'Orbitron, monospace',
                color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem',
                letterSpacing: '0.06em',
              }}>· {order.student_roll}</span>
            )}
          </div>
        )}

        {/* Items list */}
        <div style={{
          background: 'rgba(0,0,0,0.32)',
          borderRadius: 10,
          padding: '10px 12px',
          marginBottom: 14,
          border: '1px solid rgba(255,255,255,0.04)',
        }}>
          {order.items && order.items.length > 0 ? order.items.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '5px 0',
              borderBottom: idx < (order.items?.length ?? 0) - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
            }}>
              <span style={{
                fontFamily: 'Rajdhani, sans-serif', fontSize: '0.92rem',
                color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: 7,
              }}>
                <span style={{
                  color: cfg.border, fontWeight: 800, fontFamily: 'Orbitron, monospace',
                  fontSize: '0.78rem', textShadow: `0 0 8px ${cfg.border}66`,
                  background: `${cfg.border}14`,
                  padding: '2px 6px', borderRadius: 4, minWidth: 26, textAlign: 'center',
                }}>×{item.quantity}</span>
                {item.item_name}
              </span>
              <span style={{
                fontFamily: 'Orbitron, monospace', fontSize: '0.72rem',
                color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em',
              }}>
                ₹{(item.price * item.quantity).toFixed(0)}
              </span>
            </div>
          )) : (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Rajdhani, sans-serif' }}>No item details</span>
          )}
        </div>

        {/* Total row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 14, paddingTop: 4,
        }}>
          <span style={{
            fontFamily: 'Orbitron, monospace', fontSize: '0.6rem',
            color: 'rgba(255,255,255,0.4)', letterSpacing: '0.22em', textTransform: 'uppercase',
          }}>Total Due</span>
          <span style={{
            fontFamily: 'Orbitron, monospace', fontSize: '1rem',
            color: '#ffed4e', fontWeight: 800,
            textShadow: '0 0 14px rgba(255,237,78,0.5)',
            letterSpacing: '0.02em',
          }}>
            ₹{Number(order.total_amount).toFixed(0)}
          </span>
        </div>

        {/* Action buttons per status — Orbitron caps + glyphs to match the
            crystal language used everywhere else. */}
        {order.status === 'pending' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionBtn
              label="⊕ Accept"
              color="#00ff88"
              onClick={() => onStatusUpdate(order.id, 'preparing')}
            />
            <ActionBtn
              label="⊖ Reject"
              color="#ff3366"
              onClick={() => onStatusUpdate(order.id, 'cancelled')}
            />
          </div>
        )}
        {order.status === 'preparing' && (
          <ActionBtn
            label="✦ Mark Ready"
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

        {/* Speak order button */}
        {onSpeak && (
          <button
            onClick={() => onSpeak(order)}
            disabled={isSpeaking}
            title="Read order aloud"
            style={{
              marginTop: '10px',
              width: '100%',
              padding: '8px',
              background: isSpeaking ? 'rgba(255,165,0,0.15)' : 'rgba(255,237,78,0.07)',
              border: `1px solid ${isSpeaking ? 'rgba(255,165,0,0.5)' : 'rgba(255,237,78,0.3)'}`,
              borderRadius: '9px',
              color: isSpeaking ? '#ffa500' : '#ffed4e',
              fontSize: '12px',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: '700',
              letterSpacing: '1px',
              cursor: isSpeaking ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {isSpeaking ? (
              <>
                <span style={{ display: 'inline-block', animation: 'speakPulse 0.6s ease-in-out infinite' }}>🔊</span>
                SPEAKING...
              </>
            ) : (
              <>🔊 READ ALOUD</>
            )}
          </button>
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
  // Round-7 palette swap collapsed the cyan vs green ternaries — both branches
  // now resolve to the same unified green RGB triplet.
  const rgb = color === '#00ff88' ? '0,255,136' : color === '#ff3366' ? '255,51,102' : '255,255,255';
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

// ─── Today's Food Grid ────────────────────────────────────────────────────────

interface AggItem {
  name: string;
  quantity: number;
  revenue: number;
  imageUrl: string | null;
}

const TodayFoodGrid: React.FC<{ todayOrders: Order[]; menuItems: MenuItem[] }> = ({ todayOrders, menuItems }) => {
  const today = new Date().toDateString();
  const todayAll   = todayOrders.filter(o => new Date(o.created_at).toDateString() === today);
  const completed  = todayAll.filter(o => o.status === 'completed');

  // image lookup from menu
  const imgMap = new Map<number, string | null>();
  menuItems.forEach(m => imgMap.set(m.id, m.image_url ?? null));

  // Aggregate items from ALL today's orders
  const itemMap = new Map<string, AggItem>();
  for (const order of todayAll) {
    for (const item of (order.items ?? [])) {
      const existing = itemMap.get(item.item_name) ?? { name: item.item_name, quantity: 0, revenue: 0, imageUrl: imgMap.get(item.menu_item_id ?? -1) ?? null };
      itemMap.set(item.item_name, {
        ...existing,
        quantity: existing.quantity + item.quantity,
        revenue:  existing.revenue  + item.price * item.quantity,
      });
    }
  }

  const aggItems   = Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity);
  const totalRev   = completed.reduce((s, o) => s + Number(o.total_amount), 0);
  const totalItems = aggItems.reduce((s, i) => s + i.quantity, 0);

  if (aggItems.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.3)' }}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>🍽️</div>
        <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 13, letterSpacing: 3, color: 'rgba(255,255,255,0.25)' }}>NO ORDERS YET TODAY</div>
      </div>
    );
  }

  const summaryStats = [
    { label: 'Total Orders',  value: todayAll.length,     color: '#00ff88', icon: '📋' },
    { label: 'Completed',     value: completed.length,    color: '#00ff88', icon: '✅' },
    { label: 'Items Sold',    value: totalItems,          color: '#00d166', icon: '🍽️' },
    { label: "Today's Revenue", value: `₹${totalRev.toLocaleString('en-IN')}`, color: '#ffed4e', icon: '💰' },
  ];

  return (
    <>
      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {summaryStats.map(s => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)',
            border: `1px solid ${s.color}33`, borderRadius: 16, padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: `0 0 18px ${s.color}0d`,
          }}>
            <span style={{ fontSize: 26 }}>{s.icon}</span>
            <div>
              <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 20, fontWeight: 900, color: s.color, lineHeight: 1, textShadow: `0 0 12px ${s.color}66` }}>{s.value}</div>
              <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: 3 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Section label */}
      <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 11, color: 'rgba(0, 255, 136,0.5)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 16 }}>
        🍽️ Items Ordered Today — sorted by popularity
      </div>

      {/* Food grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 16, marginBottom: 40 }}>
        {aggItems.map((item, idx) => (
          <div key={item.name} style={{
            background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)',
            border: `1px solid ${idx === 0 ? 'rgba(255,237,78,0.45)' : 'rgba(0, 255, 136,0.12)'}`,
            borderRadius: 16, overflow: 'hidden', position: 'relative',
            boxShadow: idx === 0 ? '0 0 24px rgba(255,237,78,0.12)' : '0 2px 12px rgba(0,0,0,0.3)',
            animation: `fadeInUp 0.4s ease ${Math.min(idx, 12) * 0.04}s both`,
            transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
          >
            {idx === 0 && (
              <div style={{
                position: 'absolute', top: 8, right: 8, zIndex: 2,
                background: '#ffed4e', color: '#050a0c',
                fontSize: 8, fontFamily: 'Orbitron, monospace', fontWeight: 700,
                padding: '2px 7px', borderRadius: 4, letterSpacing: 1,
              }}>🏆 TOP</div>
            )}
            {/* Rank badge */}
            <div style={{
              position: 'absolute', top: 8, left: 8, zIndex: 2,
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
              borderRadius: 6, padding: '2px 8px',
              fontFamily: 'Orbitron, monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700,
            }}>#{idx + 1}</div>

            {/* Image */}
            <div style={{ height: 125, background: 'rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {item.imageUrl
                ? <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 44 }}>🍽️</span>
              }
            </div>

            {/* Info */}
            <div style={{ padding: '12px 13px 14px' }}>
              <div style={{
                fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 14,
                color: '#fff', marginBottom: 10, lineHeight: 1.25,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>{item.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                  background: 'rgba(0, 255, 136,0.1)', border: '1px solid rgba(0, 255, 136,0.35)',
                  borderRadius: 20, padding: '3px 10px',
                  fontFamily: 'Orbitron, monospace', fontSize: 11, fontWeight: 700, color: '#00ff88',
                }}>×{item.quantity}</div>
                <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 11, fontWeight: 700, color: '#ffed4e' }}>
                  ₹{item.revenue.toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Completed orders list */}
      {completed.length > 0 && (
        <>
          <div style={{ fontFamily: 'Orbitron, monospace', fontSize: 11, color: 'rgba(0,255,136,0.5)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 }}>
            ✅ Completed Orders Today ({completed.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...completed].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(order => (
              <div key={order.id} style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,255,136,0.15)',
                borderLeft: '3px solid #00ff88', borderRadius: 12, padding: '12px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Orbitron, monospace', fontSize: 12, color: '#00ff88', fontWeight: 700 }}>
                    #{order.order_number}
                  </span>
                  {order.student_name && (
                    <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
                      👤 {order.student_name}
                    </span>
                  )}
                  <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.3)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(order.items ?? []).map(i => `${i.quantity}× ${i.item_name}`).join('  ·  ')}
                  </span>
                </div>
                <span style={{ fontFamily: 'Orbitron, monospace', fontSize: 13, color: '#ffed4e', fontWeight: 700 }}>
                  ₹{Number(order.total_amount).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
};

// ─── Order Queue ──────────────────────────────────────────────────────────────

const COLUMNS: Array<{ status: OrderStatus; label: string; color: string; glow: string }> = [
  { status: 'pending',   label: 'Pending',   color: '#ffed4e', glow: 'rgba(255,237,78,0.12)' },
  { status: 'preparing', label: 'Preparing', color: '#00ff88', glow: 'rgba(0, 255, 136,0.12)' },
  { status: 'ready',     label: 'Ready',     color: '#00ff88', glow: 'rgba(0,255,136,0.12)' },
];

const OrdersTab: React.FC<{
  orders: Order[];
  onStatusUpdate: (id: number, s: OrderStatus) => void;
  onSpeak: (order: Order) => void;
  speakingOrderId: number | null;
}> = ({ orders, onStatusUpdate, onSpeak, speakingOrderId }) => (
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
          <div key={col.status} style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
            {/* Column header — crystal pill with glyph + live count */}
            <div style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 16,
              padding: '12px 18px',
              background:
                `linear-gradient(180deg, ${col.color}10 0%, transparent 60%), rgba(7,16,14,0.65)`,
              border: `1px solid ${col.color}44`,
              borderRadius: 12,
              clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
              boxShadow: `0 0 18px ${col.glow}, inset 0 0 0 1px ${col.color}10`,
            }}>
              <div style={{
                position: 'absolute', top: 0, left: '6%', right: '20%', height: 1,
                background: `linear-gradient(90deg, transparent, ${col.color}, transparent)`,
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  fontFamily: 'Orbitron, monospace', fontSize: '0.95rem',
                  color: col.color, textShadow: `0 0 8px ${col.color}`,
                }}>
                  {col.status === 'pending' ? '◷' : col.status === 'preparing' ? '◈' : '✦'}
                </span>
                <span style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: '0.72rem', fontWeight: 700,
                  color: col.color, letterSpacing: '0.28em', textTransform: 'uppercase',
                }}>
                  {col.label}
                </span>
              </div>
              <div style={{
                fontFamily: 'Orbitron, monospace', fontSize: '0.85rem', fontWeight: 800,
                color: col.color, padding: '4px 14px',
                background: `${col.color}1a`, border: `1px solid ${col.color}55`,
                borderRadius: 100, textShadow: `0 0 8px ${col.color}55`,
                minWidth: 40, textAlign: 'center',
              }}>
                {String(colOrders.length).padStart(2, '0')}
              </div>
            </div>

            {/* Column body — crystal-styled card list */}
            <div className="queue-col" style={{
              flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 380px)',
              paddingRight: 4, paddingTop: 2,
            }}>
              {colOrders.length > 0 ? colOrders.map(order => (
                <ChefOrderCard
                  key={order.id}
                  order={order}
                  onStatusUpdate={onStatusUpdate}
                  onSpeak={onSpeak}
                  isSpeaking={speakingOrderId === order.id}
                />
              )) : (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '46px 20px',
                  background: 'rgba(7,16,14,0.4)',
                  border: `1px dashed ${col.color}33`,
                  borderRadius: 14,
                  clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)',
                }}>
                  <div style={{
                    fontFamily: 'Orbitron, monospace', fontSize: '2.2rem',
                    color: `${col.color}55`, marginBottom: 10,
                    textShadow: `0 0 16px ${col.color}33`,
                  }}>
                    ◯
                  </div>
                  <span style={{
                    fontFamily: 'Orbitron, sans-serif', fontSize: '0.68rem',
                    color: `${col.color}99`, letterSpacing: '0.28em', textTransform: 'uppercase',
                  }}>
                    Queue Clear
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
  const { showToast } = useToast();

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
      showToast(`Could not update availability for ${item.name} — try again`, 'error');
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
        .chef-cat-card {
          position: relative;
          background:
            linear-gradient(180deg, rgba(0,255,136,0.04) 0%, transparent 35%),
            linear-gradient(180deg, #0a1816 0%, #07100e 100%);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%);
          overflow: hidden;
          transition: border-color 0.22s, transform 0.22s, box-shadow 0.22s;
        }
        .chef-cat-card::before {
          content: ''; position: absolute; top: 0; left: 6%; right: 24%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0,255,136,0.5), transparent);
          z-index: 4;
        }
        .chef-cat-card:hover {
          border-color: rgba(0,255,136,0.4);
          transform: translateY(-2px);
          box-shadow: 0 16px 36px rgba(0,255,136,0.12);
        }
        .menu-edit-input {
          background: rgba(0,0,0,0.32) !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          color: #fff;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .menu-edit-input:focus {
          border-color: rgba(0,255,136,0.5) !important;
          box-shadow: 0 0 0 2px rgba(0,255,136,0.15) !important;
        }
        .chef-cat-field-label {
          font-family: 'Orbitron', sans-serif;
          font-size: 0.58rem;
          letter-spacing: 0.22em;
          color: rgba(255,255,255,0.42);
          text-transform: uppercase;
        }
        /* Toggle switch styles */
        .toggle-switch { position:relative; display:inline-block; width:44px; height:24px; cursor:pointer; }
        .toggle-switch input { opacity:0; width:0; height:0; }
        .toggle-slider {
          position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0;
          background: rgba(255,159,67,0.25); border-radius:24px; transition:.3s;
          border: 1px solid rgba(255,159,67,0.5);
        }
        .toggle-slider:before {
          position:absolute; content:''; height:18px; width:18px; left:2px; bottom:2px;
          background:#ff9f43; border-radius:50%; transition:.3s;
          box-shadow: 0 0 6px rgba(255,159,67,0.65);
        }
        input:checked + .toggle-slider { background: rgba(0,255,136,0.25); border-color: rgba(0,255,136,0.6); }
        input:checked + .toggle-slider:before {
          transform:translateX(20px); background:#00ff88;
          box-shadow: 0 0 10px #00ff88;
        }
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
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 18,
      }}>
        {editItems.map((item, idx) => (
          <div
            key={item.id}
            className="chef-cat-card"
            style={{
              display: 'flex', flexDirection: 'column',
              animation: `fadeInUp 0.4s ease ${Math.min(idx, 11) * 0.04}s both`,
            }}
            data-clickable
          >
            {/* Image — same notched language as the kiosk DataCrystal */}
            <div style={{
              height: 150, position: 'relative', overflow: 'hidden',
              background: 'linear-gradient(135deg, #0a1614, #050a0c)',
              cursor: 'pointer',
            }} title="Update the image URL below to swap this picture">
              {item.image_url ? (
                <img
                  src={item.editImageUrl || item.image_url}
                  alt={item.name}
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    opacity: item.is_available ? 0.95 : 0.35,
                    transition: 'opacity 0.25s, transform 0.4s',
                  }}
                />
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', fontFamily: 'Orbitron, monospace', fontSize: '3rem',
                  color: 'rgba(0,255,136,0.4)',
                  opacity: item.is_available ? 1 : 0.4,
                }}>⬡</div>
              )}
              {/* Bottom shade so the dish name + ₹ chip always read */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, transparent 55%, rgba(7,16,14,0.85) 100%)',
                pointerEvents: 'none',
              }} />
              {/* ID corner pill */}
              <div style={{
                position: 'absolute', top: 10, left: 10, zIndex: 2,
                fontFamily: 'Orbitron, monospace', fontSize: '0.58rem',
                letterSpacing: '0.18em', color: '#00ff88',
                background: 'rgba(7,16,14,0.85)',
                border: '1px solid rgba(0,255,136,0.5)',
                borderRadius: 3, padding: '4px 9px', textTransform: 'uppercase',
                textShadow: '0 0 6px rgba(0,255,136,0.6)',
                backdropFilter: 'blur(6px)',
              }}>
                #{item.id}
              </div>
              {/* Hover "Edit image" overlay */}
              <div
                style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(7,16,14,0.7)', opacity: 0, transition: 'opacity 0.2s',
                  zIndex: 3,
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
              >
                <span style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: '0.62rem',
                  color: '#00ff88', fontWeight: 700, letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  background: 'rgba(0,255,136,0.12)', padding: '6px 14px',
                  borderRadius: 6, border: '1px solid rgba(0,255,136,0.5)',
                  textShadow: '0 0 6px rgba(0,255,136,0.6)',
                }}>
                  ⌧ Swap Image
                </span>
              </div>
              {/* OFFLINE band */}
              {!item.is_available && (
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(7,16,14,0.55)', pointerEvents: 'none', zIndex: 4,
                }}>
                  <span style={{
                    fontFamily: 'Orbitron, monospace', fontSize: '0.7rem',
                    color: '#ff9f43', letterSpacing: '0.32em', fontWeight: 800,
                    textShadow: '0 0 8px rgba(255,159,67,0.7)',
                    background: 'rgba(7,16,14,0.85)',
                    border: '1px solid rgba(255,159,67,0.55)',
                    borderRadius: 6, padding: '4px 14px', textTransform: 'uppercase',
                  }}>
                    Offline
                  </span>
                </div>
              )}
            </div>

            {/* Fields */}
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="chef-cat-field-label">Name</span>
                <input
                  type="text"
                  className="menu-edit-input"
                  value={item.editName}
                  onChange={e => updateField(item.id, 'editName', e.target.value)}
                  style={{
                    padding: '9px 12px', borderRadius: 8,
                    fontFamily: 'Rajdhani, sans-serif', fontSize: '0.95rem',
                    fontWeight: 600, boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span className="chef-cat-field-label">Price (₹)</span>
                  <input
                    type="number"
                    className="menu-edit-input"
                    value={item.editPrice}
                    onChange={e => updateField(item.id, 'editPrice', e.target.value)}
                    style={{
                      padding: '9px 12px', borderRadius: 8,
                      color: '#ffed4e', fontFamily: 'Orbitron, monospace',
                      fontSize: '0.95rem', fontWeight: 800,
                      letterSpacing: '0.02em', boxSizing: 'border-box',
                      textShadow: '0 0 8px rgba(255,237,78,0.3)',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span className="chef-cat-field-label">Stock</span>
                  <input
                    type="number"
                    className="menu-edit-input"
                    value={item.editStock}
                    onChange={e => updateField(item.id, 'editStock', e.target.value)}
                    min="-1"
                    placeholder="-1 = ∞"
                    title="-1 means unlimited stock"
                    style={{
                      padding: '9px 12px', borderRadius: 8,
                      color: item.editStock === '-1' ? 'rgba(255,255,255,0.4)' : '#00ff88',
                      fontFamily: 'Orbitron, monospace', fontSize: '0.92rem',
                      fontWeight: 700, boxSizing: 'border-box',
                      textShadow: item.editStock === '-1' ? 'none' : '0 0 8px rgba(0,255,136,0.35)',
                    }}
                  />
                </div>
              </div>

              {/* Stock readout */}
              <div style={{
                fontFamily: 'Orbitron, monospace', fontSize: '0.62rem',
                color: 'rgba(255,255,255,0.4)', letterSpacing: '0.18em',
                textTransform: 'uppercase', marginTop: -4,
              }}>
                {item.editStock === '-1' ? '∞ Unlimited stock' :
                 item.editStock === '0'  ? '◯ Out of stock' :
                 `${item.editStock} units remaining`}
              </div>

              {/* Image URL */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span className="chef-cat-field-label">Image URL</span>
                <input
                  type="url"
                  className="menu-edit-input"
                  value={item.editImageUrl}
                  onChange={e => updateField(item.id, 'editImageUrl', e.target.value)}
                  placeholder="https://…"
                  style={{
                    padding: '9px 12px', borderRadius: 8,
                    fontFamily: 'Rajdhani, sans-serif', fontSize: '0.82rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Availability toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 10,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{
                    fontFamily: 'Orbitron, monospace', fontSize: '0.62rem',
                    color: item.is_available ? '#00ff88' : '#ff9f43',
                    fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
                    textShadow: item.is_available
                      ? '0 0 6px rgba(0,255,136,0.45)'
                      : '0 0 6px rgba(255,159,67,0.45)',
                  }}>
                    {item.is_available ? '● Online' : '○ Offline'}
                  </span>
                  <span style={{
                    fontFamily: 'Rajdhani, sans-serif', fontSize: '0.7rem',
                    color: 'rgba(255,255,255,0.4)',
                  }}>
                    {item.is_available ? 'visible on the kiosk' : 'hidden from customers'}
                  </span>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={item.is_available} onChange={() => handleToggle(item)} />
                  <span className="toggle-slider" />
                </label>
              </div>

              {/* Save + Delete */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleSave(item)}
                  disabled={item.saving}
                  data-clickable
                  style={{
                    flex: 1, padding: '10px 12px',
                    background: 'linear-gradient(90deg, rgba(0,255,136,0.06), rgba(0,255,136,0.18), rgba(0,255,136,0.06))',
                    backgroundSize: '200% 100%',
                    border: '1px solid rgba(0,255,136,0.45)',
                    borderRadius: 9, color: '#00ff88',
                    fontFamily: 'Orbitron, sans-serif', fontWeight: 800, fontSize: '0.7rem',
                    cursor: item.saving ? 'not-allowed' : 'pointer',
                    letterSpacing: '0.22em', textTransform: 'uppercase',
                    opacity: item.saving ? 0.6 : 1,
                    transition: 'background-position 0.5s, box-shadow 0.2s',
                    textShadow: '0 0 8px rgba(0,255,136,0.55)',
                  }}
                  onMouseEnter={e => {
                    if (!item.saving) {
                      (e.currentTarget as HTMLButtonElement).style.backgroundPosition = '100% 0';
                      (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 18px rgba(0,255,136,0.32)';
                    }
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundPosition = '0 0';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                  }}
                >
                  {item.saving ? '◌ Saving' : '✓ Save'}
                </button>
                <button
                  onClick={() => setDeleteTarget(item)}
                  data-clickable
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(255,51,102,0.08)', border: '1px solid rgba(255,51,102,0.4)',
                    borderRadius: 9, color: '#ff3366',
                    fontFamily: 'Orbitron, sans-serif', fontWeight: 800, fontSize: '0.78rem',
                    cursor: 'pointer', letterSpacing: '0.22em', transition: 'background 0.2s',
                  }}
                >
                  ⊖
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
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'today' | 'menu'>('orders');
  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── TTS State ───────────────────────────────────────────────────────────────
  const [ttsEnabled, setTtsEnabled]     = useState(true);
  const [ttsLang, setTtsLang]           = useState('en-IN');
  const [ttsLangOpen, setTtsLangOpen]   = useState(false);
  const [speakingOrderId, setSpeakingOrderId] = useState<number | null>(null);
  const ttsQueueRef = useRef<SpeechSynthesisUtterance[]>([]);
  const ttsDropdownRef = useRef<HTMLDivElement | null>(null);

  const TTS_LANGUAGES = [
    { code: 'en-IN', label: 'English',   flag: '🇬🇧' },
    { code: 'hi-IN', label: 'Hindi',     flag: '🇮🇳' },
    { code: 'ta-IN', label: 'Tamil',     flag: '🌺' },
    { code: 'te-IN', label: 'Telugu',    flag: '🌸' },
    { code: 'ml-IN', label: 'Malayalam', flag: '🌴' },
    { code: 'kn-IN', label: 'Kannada',   flag: '🏔️' },
    { code: 'bn-IN', label: 'Bengali',   flag: '🌿' },
    { code: 'mr-IN', label: 'Marathi',   flag: '🦁' },
  ] as const;

  const currentLangLabel = TTS_LANGUAGES.find(l => l.code === ttsLang);

  // Close language dropdown on outside click
  useEffect(() => {
    if (!ttsLangOpen) return;
    const handler = (e: MouseEvent) => {
      if (ttsDropdownRef.current && !ttsDropdownRef.current.contains(e.target as Node)) {
        setTtsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ttsLangOpen]);

  // Build a natural-language order summary in English (Claude will translate it)
  const buildOrderSummary = useCallback((order: Order): string => {
    const items = (order.items ?? [])
      .map(i => `${i.quantity} ${i.item_name}`)
      .join(', ');
    const total = Number(order.total_amount).toFixed(0);
    const student = order.student_name ? ` for ${order.student_name}` : '';
    return `New order number ${order.order_number}${student}. Items: ${items}. Total: ${total} rupees.`;
  }, []);

  // Core speak function: translate if needed → SpeechSynthesis
  const speakOrder = useCallback(async (order: Order) => {
    if (!ttsEnabled) return;
    if (!('speechSynthesis' in window)) {
      console.warn('[TTS] SpeechSynthesis not supported in this browser.');
      return;
    }

    setSpeakingOrderId(order.id);
    window.speechSynthesis.cancel(); // stop any ongoing speech

    const englishText = buildOrderSummary(order);
    let textToSpeak = englishText;

    // Translate if not English
    if (ttsLang !== 'en-IN') {
      try {
        const resp = await api.post('/ai/translate', { text: englishText, targetLangCode: ttsLang });
        if (resp.data?.success && resp.data?.data?.translatedText) {
          textToSpeak = resp.data.data.translatedText;
        }
      } catch (err) {
        console.warn('[TTS] Translation failed, falling back to English:', err);
      }
    }

    const utter = new SpeechSynthesisUtterance(textToSpeak);
    utter.lang = ttsLang;
    utter.rate = 0.75;   // slower → more intelligible for kitchen staff
    utter.pitch = 1.0;
    utter.volume = 1.0;

    // Async voice loading — getVoices() may return [] on first call in Chrome
    // until the 'voiceschanged' event fires.
    const loadVoices = (): Promise<SpeechSynthesisVoice[]> =>
      new Promise(resolve => {
        const v = window.speechSynthesis.getVoices();
        if (v.length > 0) { resolve(v); return; }
        const handler = () => resolve(window.speechSynthesis.getVoices());
        window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
        // Safety timeout — resolve with whatever is available after 1 s
        setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
      });

    const voices = await loadVoices();
    // Pick the best matching voice for the target language.
    // Deliberately NO English fallback — if we fall back to an English voice while
    // the text is in Tamil/Hindi script, the TTS engine produces silence or
    // unreadable output.  Leaving utter.voice unset lets the browser choose the
    // best available voice for utter.lang automatically.
    const matchedVoice =
      voices.find(v => v.lang === ttsLang) ||
      voices.find(v => v.lang.startsWith(ttsLang.split('-')[0]));
    if (matchedVoice) utter.voice = matchedVoice;
    // utter.lang is always set (above) so the browser still picks the right
    // synthesiser even when matchedVoice is undefined.

    utter.onend = () => setSpeakingOrderId(null);
    utter.onerror = () => setSpeakingOrderId(null);

    window.speechSynthesis.speak(utter);
  }, [ttsEnabled, ttsLang, buildOrderSummary]);

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

  // Fetch ALL of today's orders (including completed) for the food-grid tab
  const fetchTodayOrders = useCallback(async () => {
    try {
      const data = await orderService.getAll({ limit: 300 });
      const list: Order[] = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.data?.orders)
          ? (data as any).data.orders
          : Array.isArray((data as any)?.data)
            ? (data as any).data
            : [];
      const todayStr = new Date().toDateString();
      setTodayOrders(list.filter(o => new Date(o.created_at).toDateString() === todayStr));
    } catch (err) {
      console.error('Failed to fetch today orders:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchOrders(), fetchMenuItems(), fetchTodayOrders()]);
      setLoading(false);
    };
    init();

    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    // Polling fallback — refresh active orders + today's stats every 20s
    const pollInterval = setInterval(() => { fetchOrders(); fetchTodayOrders(); }, 20_000);

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
        // Auto-announce new order in chef's preferred language
        speakOrder(newOrder);
      });
      // Backend emits `order:updated` to the kitchen room with a partial
      // payload (orderId / status / orderNumber). Look up by id locally and
      // patch the status — don't replace the entire order with the partial.
      socketService.on('order:updated', (data: { orderId: number; status: OrderStatus }) => {
        if (!data || data.orderId === undefined) return;
        setOrders(prev => {
          if (['completed', 'cancelled'].includes(data.status)) {
            return prev.filter(o => o.id !== data.orderId);
          }
          return prev.map(o => o.id === data.orderId ? { ...o, status: data.status } : o);
        });
        // Keep today's grid in sync whenever an order status changes
        fetchTodayOrders();
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
        // TTS is triggered by the socket:order:created event (which has full data);
        // Supabase Realtime INSERT is a backup signal — only beep here to avoid double-speech.
        fetchOrders();
        fetchTodayOrders();
        playNotificationBeep();
      } else if (eventType === 'UPDATE') {
        const updated = row as any;
        if (['completed', 'cancelled'].includes(updated.status)) {
          setOrders(prev => prev.filter(o => o.id !== updated.id));
          fetchTodayOrders(); // update food grid when order completes
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
      socketService.off('order:updated');
      socketService.off('order:cancelled');
      socketService.off('menu:availability-changed');
      socketService.off('menu:stock-updated');
      socketService.off('menu:item-updated');
      unsubscribe(ordersChannel);
      unsubscribe(menuChannel);
    };
  }, [fetchOrders, fetchMenuItems, fetchTodayOrders, playNotificationBeep, speakOrder]);

  const handleStatusUpdate = useCallback(async (orderId: number, status: OrderStatus) => {
    setOrders(prev => {
      if (['completed', 'cancelled'].includes(status)) {
        return prev.filter(o => o.id !== orderId);
      }
      return prev.map(o => o.id === orderId ? { ...o, status } : o);
    });
    try {
      await orderService.updateStatus(orderId, status);
      // Refresh food grid whenever an order status changes (esp. completed)
      fetchTodayOrders();
    } catch (err) {
      console.error('Failed to update status:', err);
      fetchOrders();
    }
  }, [fetchOrders, fetchTodayOrders]);

  const totalActive = orders.filter(o => ['pending', 'preparing'].includes(o.status)).length;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: linear-gradient(135deg, #050a0c, #0a1614, #07100e); min-height: 100vh; font-family: 'Rajdhani', sans-serif; }
        @keyframes scanline { 0%{background-position:0 0} 100%{background-position:0 100vh} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes slideInDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes speakPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.3)} }

        /* class names — layout overridden by index.css media queries */
      `}</style>

      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #050a0c, #0a1614, #07100e)', position: 'relative' }}>
        {/* Grid overlay */}
        <div style={{
          position: 'fixed', inset: 0,
          backgroundImage: 'linear-gradient(rgba(0, 255, 136,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 136,0.02) 1px, transparent 1px)',
          backgroundSize: '40px 40px', pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Header — crystal-language version of the chef station bar */}
        <header className="chef-header" style={{
          position: 'sticky', top: 0, zIndex: 50, height: '84px',
          background:
            'linear-gradient(180deg, rgba(0,255,136,0.025) 0%, transparent 100%), rgba(7,16,14,0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(0, 255, 136,0.18)',
          boxShadow: '0 4px 30px rgba(0, 255, 136,0.06)',
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
          padding: '0 40px', animation: 'slideInDown 0.5s ease',
        }}>
          {/* LEFT — Kitchen Command HUD title block */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{
              fontFamily: 'Orbitron, monospace', fontSize: '22px', color: '#00ff88',
              textShadow: '0 0 12px #00ff88', lineHeight: 1,
            }}>◈</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 22, height: 1, background: 'linear-gradient(90deg, transparent, #00ff88)' }} />
                <h1 style={{
                  fontFamily: 'Orbitron, monospace', fontSize: '20px', fontWeight: 900,
                  background: 'linear-gradient(90deg, #ffffff 0%, #00ff88 80%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text', letterSpacing: '0.32em', lineHeight: 1, margin: 0,
                  textShadow: '0 0 18px rgba(0,255,136,0.25)',
                }}>KITCHEN COMMAND</h1>
              </div>
              <div style={{
                fontFamily: 'Orbitron, monospace', fontSize: '10px',
                color: 'rgba(0,255,136,0.55)', letterSpacing: '0.35em',
                marginTop: 4, marginLeft: 32, textTransform: 'uppercase',
              }}>
                Chef Station · Live Manifest
              </div>
            </div>
          </div>

          {/* CENTRE — Active orders crystal pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{
              position: 'relative',
              background:
                'linear-gradient(180deg, rgba(255,237,78,0.06) 0%, transparent 80%), rgba(7,16,14,0.65)',
              border: '1px solid rgba(255,237,78,0.4)',
              borderRadius: '12px', padding: '10px 26px',
              display: 'flex', alignItems: 'center', gap: '12px',
              clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)',
              boxShadow: '0 0 22px rgba(255,237,78,0.18), inset 0 0 0 1px rgba(255,237,78,0.05)',
            }}>
              <span style={{
                fontFamily: 'Orbitron, monospace', fontSize: '26px', fontWeight: 900, color: '#ffed4e',
                lineHeight: 1, textShadow: '0 0 18px rgba(255,237,78,0.7)',
              }}>{String(totalActive).padStart(2, '0')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{
                  fontFamily: 'Orbitron, monospace', fontSize: '9px',
                  color: 'rgba(255,237,78,0.75)', letterSpacing: '0.28em', textTransform: 'uppercase',
                }}>Active Orders</span>
                <span style={{
                  fontFamily: 'Orbitron, monospace', fontSize: '8px',
                  color: 'rgba(255,255,255,0.4)', letterSpacing: '0.18em',
                }}>in the queue</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'flex-end' }}>

            {/* ── TTS Language selector ─────────────────────────────────────── */}
            <div ref={ttsDropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setTtsLangOpen(o => !o)}
                title="Choose announcement language"
                style={{
                  background: ttsEnabled ? 'rgba(255,237,78,0.08)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${ttsEnabled ? 'rgba(255,237,78,0.35)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: '10px', padding: '6px 12px',
                  color: ttsEnabled ? '#ffed4e' : 'rgba(255,255,255,0.3)',
                  cursor: 'pointer', fontSize: '13px',
                  fontFamily: 'Rajdhani, sans-serif', fontWeight: '700',
                  letterSpacing: '0.5px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: '16px' }}>{currentLangLabel?.flag ?? '🌐'}</span>
                {currentLangLabel?.label ?? 'English'}
                <span style={{ fontSize: '10px', opacity: 0.6 }}>▼</span>
              </button>

              {ttsLangOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'rgba(10,6,24,0.97)',
                  backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,237,78,0.25)',
                  borderRadius: '14px', padding: '8px',
                  zIndex: 200, minWidth: '170px',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                  animation: 'fadeInUp 0.15s ease',
                }}>
                  {TTS_LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => { setTtsLang(lang.code); setTtsLangOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '9px 12px',
                        background: ttsLang === lang.code ? 'rgba(255,237,78,0.12)' : 'transparent',
                        border: 'none', borderRadius: '9px',
                        color: ttsLang === lang.code ? '#ffed4e' : 'rgba(255,255,255,0.7)',
                        fontFamily: 'Rajdhani, sans-serif', fontSize: '14px', fontWeight: '600',
                        cursor: 'pointer', textAlign: 'left', letterSpacing: '0.5px',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => { if (ttsLang !== lang.code) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={e => { if (ttsLang !== lang.code) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <span style={{ fontSize: '18px' }}>{lang.flag}</span>
                      <span>{lang.label}</span>
                      {ttsLang === lang.code && <span style={{ marginLeft: 'auto', color: '#ffed4e' }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── TTS on/off toggle ─────────────────────────────────────────── */}
            <button
              onClick={() => { setTtsEnabled(s => !s); if (speakingOrderId) { window.speechSynthesis?.cancel(); setSpeakingOrderId(null); } }}
              title={ttsEnabled ? 'Voice ON — click to mute' : 'Voice OFF — click to enable'}
              style={{
                background: ttsEnabled ? 'rgba(255,237,78,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${ttsEnabled ? 'rgba(255,237,78,0.35)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '8px', padding: '6px 12px',
                color: ttsEnabled ? '#ffed4e' : 'rgba(255,255,255,0.3)',
                cursor: 'pointer', fontSize: '16px', transition: 'all 0.2s',
              }}
            >
              {ttsEnabled ? (speakingOrderId ? '🔊' : '📢') : '🔇'}
            </button>

            {/* ── Beep sound toggle ─────────────────────────────────────────── */}
            <button onClick={() => setSoundEnabled(s => !s)} title={soundEnabled ? 'Disable beep' : 'Enable beep'} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '6px 12px',
              color: soundEnabled ? '#00ff88' : 'rgba(255,255,255,0.3)',
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 22 }}>
              <div style={{
                position: 'relative', width: 72, height: 72,
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  border: '2px solid rgba(0,255,136,0.12)',
                  borderTop: '2px solid #00ff88',
                  borderRadius: '50%',
                  animation: 'spin 1.2s linear infinite',
                  filter: 'drop-shadow(0 0 10px rgba(0,255,136,0.45))',
                }} />
                <div style={{
                  position: 'absolute', inset: 12,
                  border: '2px solid rgba(0,255,136,0.18)',
                  borderBottom: '2px solid #00ff88',
                  borderRadius: '50%',
                  animation: 'spin 1.8s linear infinite reverse',
                }} />
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Orbitron, monospace', fontSize: '1.1rem',
                  color: '#00ff88', textShadow: '0 0 10px #00ff88',
                }}>◈</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: '0.85rem',
                  color: '#00ff88', letterSpacing: '0.42em',
                  textShadow: '0 0 12px rgba(0,255,136,0.45)',
                }}>SYNCING KITCHEN</div>
                <div style={{
                  fontFamily: 'Orbitron, monospace', fontSize: '0.62rem',
                  color: 'rgba(255,255,255,0.35)', letterSpacing: '0.28em',
                  marginTop: 6, textTransform: 'uppercase',
                }}>Loading orders + manifest</div>
              </div>
            </div>
          ) : (
            <>
              {/* Stats Row */}
              <StatsRow orders={orders} todayOrders={todayOrders} menuItems={menuItems} />

              {/* Tab bar — segmented HUD pill matching the Revenue period chips */}
              <div style={{
                display: 'flex',
                gap: 4,
                marginBottom: 26,
                background: 'rgba(0,0,0,0.28)',
                borderRadius: 100,
                padding: 5,
                border: '1px solid rgba(255,255,255,0.06)',
                width: 'fit-content',
                flexWrap: 'wrap',
              }}>
                {([
                  { id: 'orders', glyph: '▤', label: 'Manifest' },
                  { id: 'today',  glyph: '◐', label: "Today's Log" },
                  { id: 'menu',   glyph: '⬡', label: 'Catalog' },
                ] as const).map(tab => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      data-clickable
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '9px 20px',
                        background: active ? 'rgba(0,255,136,0.15)' : 'transparent',
                        border: 'none',
                        borderRadius: 100,
                        color: active ? '#00ff88' : 'rgba(255,255,255,0.5)',
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        letterSpacing: '0.22em',
                        textTransform: 'uppercase',
                        transition: 'background 0.2s, color 0.2s, box-shadow 0.2s',
                        boxShadow: active ? '0 0 16px rgba(0,255,136,0.28)' : 'none',
                        whiteSpace: 'nowrap',
                        textShadow: active ? '0 0 8px rgba(0,255,136,0.6)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
                      }}
                    >
                      <span style={{ fontFamily: 'Orbitron, monospace', fontSize: '0.9rem' }}>{tab.glyph}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === 'orders' && (
                <OrdersTab
                  orders={orders}
                  onStatusUpdate={handleStatusUpdate}
                  onSpeak={speakOrder}
                  speakingOrderId={speakingOrderId}
                />
              )}
              {activeTab === 'today' && (
                <TodayFoodGrid todayOrders={todayOrders} menuItems={menuItems} />
              )}
              {activeTab === 'menu' && (
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
