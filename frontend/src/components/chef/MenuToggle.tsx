import React, { useState } from 'react';
import type { MenuItem } from '../../types';

interface MenuToggleProps {
  items: MenuItem[];
  onToggle: (itemId: number, currentAvailability: boolean) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  starters: 'Starters',
  mains: 'Mains',
  desserts: 'Desserts',
  beverages: 'Beverages',
};

const CATEGORY_ORDER = ['starters', 'mains', 'desserts', 'beverages'];

const MenuToggle: React.FC<MenuToggleProps> = ({ items, onToggle }) => {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const groupedItems = CATEGORY_ORDER.reduce<Record<string, MenuItem[]>>((acc, cat) => {
    const catItems = items.filter(item => item.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {});

  // Also add any category not in our predefined order
  items.forEach(item => {
    if (!CATEGORY_ORDER.includes(item.category)) {
      if (!groupedItems[item.category]) groupedItems[item.category] = [];
      if (!groupedItems[item.category].find(i => i.id === item.id)) {
        groupedItems[item.category].push(item);
      }
    }
  });

  if (items.length === 0) return null;

  return (
    <>
      <style>{`
        .menu-toggle-bar::-webkit-scrollbar {
          height: 4px;
        }
        .menu-toggle-bar::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.03);
        }
        .menu-toggle-bar::-webkit-scrollbar-thumb {
          background: rgba(0,245,255,0.3);
          border-radius: 2px;
        }
        @keyframes chipAppear {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'rgba(10,10,26,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(0,245,255,0.3)',
        boxShadow: '0 -4px 30px rgba(0,245,255,0.1)',
        padding: '12px 40px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          overflowX: 'auto',
        }}
          className="menu-toggle-bar"
        >
          {/* Label */}
          <div style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#00f5ff',
              boxShadow: '0 0 8px #00f5ff',
              animation: 'none',
            }} />
            <span style={{
              fontFamily: 'Orbitron, monospace',
              fontSize: '11px',
              color: '#00f5ff',
              letterSpacing: '2px',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
              textShadow: '0 0 10px rgba(0,245,255,0.6)',
            }}>
              Menu Availability
            </span>
          </div>

          {/* Divider */}
          <div style={{
            width: '1px',
            height: '32px',
            background: 'rgba(0,245,255,0.2)',
            flexShrink: 0,
          }} />

          {/* Category groups */}
          {Object.entries(groupedItems).map(([category, catItems], catIdx) => (
            <div key={category} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {/* Category label */}
              <span style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                fontWeight: '600',
                whiteSpace: 'nowrap',
              }}>
                {CATEGORY_LABELS[category] || category}
              </span>

              {/* Item chips */}
              {catItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => onToggle(item.id, item.is_available)}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  title={item.is_available ? 'Click to mark unavailable' : 'Click to mark available'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    border: item.is_available
                      ? '1px solid rgba(0,255,136,0.5)'
                      : '1px solid rgba(255,51,102,0.5)',
                    background: item.is_available
                      ? hoveredId === item.id
                        ? 'rgba(0,255,136,0.25)'
                        : 'rgba(0,255,136,0.12)'
                      : hoveredId === item.id
                        ? 'rgba(255,51,102,0.25)'
                        : 'rgba(255,51,102,0.12)',
                    color: item.is_available ? '#00ff88' : '#ff3366',
                    fontSize: '12px',
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.5px',
                    boxShadow: item.is_available
                      ? hoveredId === item.id ? '0 0 12px rgba(0,255,136,0.4)' : 'none'
                      : hoveredId === item.id ? '0 0 12px rgba(255,51,102,0.4)' : 'none',
                    transform: hoveredId === item.id ? 'translateY(-1px)' : 'none',
                    animation: 'chipAppear 0.3s ease',
                  }}
                >
                  <span style={{ fontSize: '11px' }}>
                    {item.is_available ? '✅' : '❌'}
                  </span>
                  <span>{item.name}</span>
                  {item.is_vegetarian && (
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#00ff88',
                      display: 'inline-block',
                      flexShrink: 0,
                    }} />
                  )}
                </button>
              ))}

              {/* Category divider */}
              {catIdx < Object.entries(groupedItems).length - 1 && (
                <div style={{
                  width: '1px',
                  height: '24px',
                  background: 'rgba(255,255,255,0.1)',
                  flexShrink: 0,
                  marginLeft: '4px',
                }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default MenuToggle;
