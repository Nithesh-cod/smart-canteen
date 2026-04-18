import React, { useMemo } from 'react';
import type { MenuItem as MenuItemType, CartItem } from '../../types';
import MenuItem from './MenuItem';

interface MenuGridProps {
  items: MenuItemType[];
  favorites: number[];
  onAddToCart: (item: MenuItemType) => void;
  onDecrement: (itemId: number) => void;
  onToggleFavorite: (itemId: number) => void;
  cartItems: CartItem[];
  loading: boolean;
  selectedCategory: string;
  searchQuery: string;
  onCategoryChange: (cat: string) => void;
  onSearchChange: (q: string) => void;
}

// Category emoji map — fallback for unknown categories
const CATEGORY_EMOJI: Record<string, string> = {
  all:          '🍽️',
  favorites:    '❤️',
  starters:     '🍢',
  mains:        '🍛',
  'main course':'🍛',
  desserts:     '🍮',
  beverages:    '☕',
  snacks:       '🍟',
  breakfast:    '🥞',
  combo:        '🎁',
  specials:     '⭐',
  other:        '🍴',
};

function catEmoji(cat: string): string {
  return CATEGORY_EMOJI[cat.toLowerCase()] ?? '🍴';
}

const MenuGrid: React.FC<MenuGridProps> = ({
  items,
  favorites,
  onAddToCart,
  onDecrement,
  onToggleFavorite,
  cartItems,
  loading,
  selectedCategory,
  searchQuery,
  onCategoryChange,
  onSearchChange,
}) => {
  // ── Dynamic category pills derived from real menu items ──────────────────
  // Always starts with "All", ends with "Favorites"; middle pills are unique
  // categories found in the actual data (preserving first-seen casing).
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const mid: Array<{ id: string; label: string; emoji: string }> = [];
    for (const item of items) {
      const key = item.category.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        mid.push({ id: item.category, label: item.category, emoji: catEmoji(item.category) });
      }
    }
    return [
      { id: 'all',       label: 'All',       emoji: '🍽️' },
      ...mid,
      { id: 'favorites', label: 'Favorites', emoji: '❤️' },
    ];
  }, [items]);

  // ── Filtered items ────────────────────────────────────────────────────────
  const filteredItems = useMemo((): MenuItemType[] => {
    let filtered = [...items];

    if (selectedCategory === 'favorites') {
      filtered = filtered.filter((item) => favorites.includes(item.id));
    } else if (selectedCategory !== 'all') {
      filtered = filtered.filter(
        (item) => item.category.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [items, selectedCategory, favorites, searchQuery]);

  return (
    <div style={{ width: '100%' }}>
      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <span
          style={{
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '1.1rem',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          🔍
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search menu..."
          style={{
            width: '100%',
            padding: '14px 18px 14px 46px',
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: '#ffffff',
            fontSize: '1rem',
            fontFamily: 'Rajdhani, sans-serif',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.3s, box-shadow 0.3s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,245,255,0.5)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(0,245,255,0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </div>

      {/* ── Category pills (dynamic) ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          marginBottom: 28,
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {categories.map((cat) => {
          const isActive = selectedCategory.toLowerCase() === cat.id.toLowerCase();
          return (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              style={{
                flexShrink: 0,
                padding: '8px 18px',
                borderRadius: 50,
                border: isActive
                  ? '1px solid #00f5ff'
                  : '1px solid rgba(255,255,255,0.1)',
                background: isActive ? 'rgba(0,245,255,0.15)' : 'rgba(255,255,255,0.03)',
                color: isActive ? '#00f5ff' : 'rgba(255,255,255,0.7)',
                fontSize: '0.9rem',
                fontFamily: 'Rajdhani, sans-serif',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
                backdropFilter: 'blur(10px)',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = 'rgba(0,245,255,0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                }
              }}
            >
              {cat.emoji} {cat.label}
            </button>
          );
        })}
      </div>

      {/* ── Loading skeletons ─────────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 25 }}>
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 16,
                overflow: 'hidden',
                height: 340,
                position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
              }} />
              <div style={{ height: 160, background: 'rgba(255,255,255,0.04)' }} />
              <div style={{ padding: 16 }}>
                <div style={{ height: 20, background: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 10, width: '70%' }} />
                <div style={{ height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 8, width: '90%' }} />
                <div style={{ height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 20, width: '60%' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ height: 24, background: 'rgba(0,245,255,0.08)', borderRadius: 6, width: '30%' }} />
                  <div style={{ height: 36, background: 'rgba(255,255,255,0.06)', borderRadius: 8, width: '35%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!loading && filteredItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.5)' }}>
          <div style={{ fontSize: '4rem', marginBottom: 16 }}>🍽️</div>
          <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.2rem', letterSpacing: '1px' }}>
            No items found
          </p>
          {searchQuery && (
            <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.9rem', marginTop: 8, color: 'rgba(255,255,255,0.3)' }}>
              Try a different search term
            </p>
          )}
          {selectedCategory === 'favorites' && favorites.length === 0 && !searchQuery && (
            <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.9rem', marginTop: 8, color: 'rgba(255,255,255,0.3)' }}>
              No favorites yet — tap ❤️ on any item!
            </p>
          )}
        </div>
      )}

      {/* ── Items grid ────────────────────────────────────────────────────── */}
      {!loading && filteredItems.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 25 }}>
          {filteredItems.map((item, idx) => {
            const cartItem = cartItems.find((ci) => ci.id === item.id);
            const cartQuantity = cartItem ? cartItem.quantity : 0;
            const isFavorite = favorites.includes(item.id);
            const delay = `${Math.min(idx, 11) * 0.06}s`;

            return (
              <div key={item.id} style={{ animation: `cardEntry 0.45s ease ${delay} both` }}>
                <MenuItem
                  item={item}
                  isFavorite={isFavorite}
                  onAddToCart={onAddToCart}
                  onDecrement={onDecrement}
                  onToggleFavorite={onToggleFavorite}
                  cartQuantity={cartQuantity}
                />
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
        @keyframes cardEntry {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default MenuGrid;
