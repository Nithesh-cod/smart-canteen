import React from 'react';
import type { DashboardStats, Order } from '../../types';

interface DashboardProps {
  stats: DashboardStats;
}

const medalEmoji = (rank: number): string => {
  switch (rank) {
    case 0: return '🥇';
    case 1: return '🥈';
    case 2: return '🥉';
    case 3: return '4️⃣';
    case 4: return '5️⃣';
    default: return `${rank + 1}.`;
  }
};

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
  switch (tier.toLowerCase()) {
    case 'bronze':   return '#cd7f32';
    case 'silver':   return '#c0c0c0';
    case 'gold':     return '#ffd700';
    case 'platinum': return '#e5e4e2';
    default:         return '#c0c0c0';
  }
};

function hexToRgbStr(hex: string): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r},${g},${b}`;
}

const formatTime = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return dateStr;
  }
};

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20,
  padding: 25,
};

const Dashboard: React.FC<DashboardProps> = ({ stats }) => {
  const {
    todayRevenue,
    weekRevenue,
    monthRevenue,
    todayOrders,
    pendingOrders,
    topItems,
    recentOrders,
    tierDistribution,
  } = stats;

  const kpiCards = [
    {
      label: "Today's Revenue",
      value: `₹${Number(todayRevenue).toLocaleString('en-IN')}`,
      sub: `${todayOrders} orders`,
    },
    {
      label: 'This Week',
      value: `₹${Number(weekRevenue).toLocaleString('en-IN')}`,
      sub: `${pendingOrders} pending`,
    },
    {
      label: 'This Month',
      value: `₹${Number(monthRevenue).toLocaleString('en-IN')}`,
      sub: 'total revenue',
    },
  ];

  const tierOrder = ['bronze', 'silver', 'gold', 'platinum'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 25 }}>

      {/* KPI Cards */}
      <div
        className="owner-kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 20,
        }}
      >
        {kpiCards.map((card) => (
          <div
            key={card.label}
            style={{
              ...glassCard,
              borderLeft: '4px solid #00f5ff',
              transition: 'transform 0.3s, box-shadow 0.3s',
              cursor: 'default',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-5px)';
              (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 40px rgba(0,245,255,0.15)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
            }}
          >
            <div
              style={{
                fontSize: '0.78rem',
                color: 'rgba(255,255,255,0.55)',
                fontFamily: 'Rajdhani, sans-serif',
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 900,
                color: '#ffed4e',
                fontFamily: 'Orbitron, sans-serif',
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              {card.value}
            </div>
            <div
              style={{
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.45)',
                fontFamily: 'Rajdhani, sans-serif',
              }}
            >
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Middle Two Columns */}
      <div className="owner-mid-row" style={{ display: 'flex', gap: 25 }}>

        {/* Top Items */}
        <div style={{ ...glassCard, flex: 1 }}>
          <h3
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '1rem',
              fontWeight: 700,
              color: '#00f5ff',
              marginBottom: 20,
              marginTop: 0,
            }}
          >
            🏆 Top Selling Items
          </h3>
          {(topItems || []).slice(0, 5).map((item, idx, arr) => (
            <div
              key={`${item.item_name ?? idx}-${idx}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.2rem', minWidth: 28 }}>{medalEmoji(idx)}</span>
                <span
                  style={{
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: '0.95rem',
                  }}
                >
                  {item.item_name}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    background: 'rgba(0,245,255,0.12)',
                    border: '1px solid rgba(0,245,255,0.3)',
                    color: '#00f5ff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 20,
                    fontFamily: 'Rajdhani, sans-serif',
                  }}
                >
                  {item.order_count} orders
                </span>
                <span
                  style={{
                    fontSize: '0.82rem',
                    color: '#00ff88',
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 700,
                  }}
                >
                  ₹{Number(item.total_revenue).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          ))}
          {(!topItems || topItems.length === 0) && (
            <div
              style={{
                color: 'rgba(255,255,255,0.35)',
                fontFamily: 'Rajdhani, sans-serif',
                textAlign: 'center',
                padding: '20px 0',
              }}
            >
              No data yet
            </div>
          )}
        </div>

        {/* Tier Distribution */}
        <div style={{ ...glassCard, flex: 1 }}>
          <h3
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '1rem',
              fontWeight: 700,
              color: '#00f5ff',
              marginBottom: 20,
              marginTop: 0,
            }}
          >
            👥 Student Tiers
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 14,
            }}
          >
            {tierOrder.map((tier) => {
              const found = (tierDistribution || []).find(
                (t) => t.tier.toLowerCase() === tier
              );
              const count = found ? found.student_count : 0;
              const color = tierColor(tier);
              return (
                <div
                  key={tier}
                  style={{
                    background: `rgba(${hexToRgbStr(color)},0.08)`,
                    border: `1px solid ${color}40`,
                    borderRadius: 14,
                    padding: '16px 18px',
                    transition: 'transform 0.2s',
                    cursor: 'default',
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLDivElement).style.transform = 'scale(1.03)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLDivElement).style.transform = 'scale(1)')
                  }
                >
                  <div
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'Orbitron, sans-serif',
                      fontWeight: 700,
                      color,
                      textTransform: 'uppercase',
                      letterSpacing: 1.5,
                      marginBottom: 8,
                    }}
                  >
                    {tier}
                  </div>
                  <div
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 900,
                      color,
                      fontFamily: 'Orbitron, sans-serif',
                      lineHeight: 1,
                    }}
                  >
                    {count}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'rgba(255,255,255,0.4)',
                      fontFamily: 'Rajdhani, sans-serif',
                      marginTop: 4,
                    }}
                  >
                    students
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div style={{ ...glassCard }}>
        <h3
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '1rem',
            fontWeight: 700,
            color: '#00f5ff',
            marginBottom: 20,
            marginTop: 0,
          }}
        >
          📋 Recent Orders
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: 'Rajdhani, sans-serif',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['Order #', 'Student', 'Amount', 'Status', 'Time'].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      fontSize: '0.75rem',
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
              {(recentOrders || []).slice(0, 10).map((order: Order) => {
                const sc = statusColor(order.status);
                return (
                  <tr
                    key={order.id}
                    style={{ transition: 'background 0.2s', cursor: 'default' }}
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
                        padding: '13px 14px',
                        color: '#00f5ff',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      {order.order_number}
                    </td>
                    <td
                      style={{
                        padding: '13px 14px',
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: '0.9rem',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div>{order.student_name || '—'}</div>
                      {order.student_roll && (
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                          {order.student_roll}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '13px 14px',
                        color: '#ffed4e',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      ₹{Number(order.total_amount).toLocaleString('en-IN')}
                    </td>
                    <td
                      style={{
                        padding: '13px 14px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
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
                          letterSpacing: 0.5,
                        }}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '13px 14px',
                        color: 'rgba(255,255,255,0.45)',
                        fontSize: '0.85rem',
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
          {(!recentOrders || recentOrders.length === 0) && (
            <div
              style={{
                textAlign: 'center',
                padding: '30px 0',
                color: 'rgba(255,255,255,0.35)',
                fontFamily: 'Rajdhani, sans-serif',
              }}
            >
              No recent orders
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
