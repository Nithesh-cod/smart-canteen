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

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <span style={{
          position: 'absolute', left: 14, top: '50%',
          transform: 'translateY(-50%)', fontSize: '1rem',
          pointerEvents: 'none', zIndex: 1,
        }}>
          🔍
        </span>
        <input
          type="text"
          className="menu-search-input"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search menu..."
          style={{
            width: '100%',
            padding: '13px 16px 13px 42px',
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: '#ffffff',
            fontSize: '0.95rem',
            fontFamily: 'Rajdhani, sans-serif',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.25s, box-shadow 0.25s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(0,245,255,0.5)';
            e.currentTarget.style.boxShadow = '0 0 16px rgba(0,245,255,0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </div>

      {/* ── Category pills ────────────────────────────────────────────────── */}
      <div
        className="menu-cat-pills"
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          marginBottom: 22,
          paddingBottom: 4,
          scrollbarWidth: 'none',
        }}
      >
        {categories.map((cat) => {
          const isActive = selectedCategory.toLowerCase() === cat.id.toLowerCase();
          return (
            <button
              key={cat.id}
              className="menu-cat-pill"
              onClick={() => onCategoryChange(cat.id)}
              style={{
                flexShrink: 0,
                padding: '7px 16px',
                borderRadius: 50,
                border: isActive ? '1px solid #00f5ff' : '1px solid rgba(255,255,255,0.12)',
                background: isActive ? 'rgba(0,245,255,0.14)' : 'rgba(255,255,255,0.03)',
                color: isActive ? '#00f5ff' : 'rgba(255,255,255,0.65)',
                fontSize: '0.85rem',
                fontFamily: 'Rajdhani, sans-serif',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s',
                backdropFilter: 'blur(10px)',
                letterSpacing: '0.3px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'rgba(0,245,255,0.35)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
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
        <div className="menu-grid">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                overflow: 'hidden',
                height: 300,
                position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
              }} />
              <div style={{ height: 140, background: 'rgba(255,255,255,0.04)' }} />
              <div style={{ padding: 14 }}>
                <div style={{ height: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 5, marginBottom: 8, width: '70%' }} />
                <div style={{ height: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 5, marginBottom: 6, width: '90%' }} />
                <div style={{ height: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 5, marginBottom: 18, width: '55%' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ height: 20, background: 'rgba(0,245,255,0.08)', borderRadius: 5, width: '28%' }} />
                  <div style={{ height: 32, background: 'rgba(255,255,255,0.06)', borderRadius: 7, width: '35%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!loading && filteredItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 16px', color: 'rgba(255,255,255,0.45)' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: 14 }}>🍽️</div>
          <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem', letterSpacing: '1px' }}>
            No items found
          </p>
          {searchQuery && (
            <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.85rem', marginTop: 8, color: 'rgba(255,255,255,0.3)' }}>
              Try a different search term
            </p>
          )}
          {selectedCategory === 'favorites' && favorites.length === 0 && !searchQuery && (
            <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.85rem', marginTop: 8, color: 'rgba(255,255,255,0.3)' }}>
              No favorites yet — tap ❤️ on any item!
            </p>
          )}
        </div>
      )}

      {/* ── Items grid ────────────────────────────────────────────────────── */}
      {!loading && filteredItems.length > 0 && (
        <div className="menu-grid">
          {filteredItems.map((item, idx) => {
            const cartItem = cartItems.find((ci) => ci.id === item.id);
            const cartQuantity = cartItem ? cartItem.quantity : 0;
            const isFavorite = favorites.includes(item.id);
            const delay = `${Math.min(idx, 11) * 0.05}s`;
            return (
              <div key={item.id} style={{ animation: `cardEntry 0.4s ease ${delay} both` }}>
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
        @keyframes cardEntry {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        /* hide pill scrollbar */
        .menu-cat-pills::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default MenuGrid;
