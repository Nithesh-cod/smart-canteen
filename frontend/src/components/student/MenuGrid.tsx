import React, { useMemo } from 'react';
import type { MenuItem as MenuItemType, CartItem } from '../../types';
import DataCrystal from '../fx/DataCrystal';
import CategoryChannels from '../fx/CategoryChannels';

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

const CATEGORY_GLYPH: Record<string, string> = {
  all:          '◯',
  favorites:    '✦',
  starters:     '◭',
  mains:        '◈',
  'main course':'◈',
  desserts:     '✸',
  beverages:    '☖',
  snacks:       '✱',
  breakfast:    '✿',
  combo:        '⬡',
  specials:     '★',
  other:        '◇',
};

function catGlyph(cat: string): string {
  return CATEGORY_GLYPH[cat.toLowerCase()] ?? '◇';
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
  const channels = useMemo(() => {
    const seen = new Set<string>();
    const mid: Array<{ id: string; label: string; glyph: string; count: number }> = [];
    for (const item of items) {
      const key = item.category.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        mid.push({
          id: item.category,
          label: item.category,
          glyph: catGlyph(item.category),
          count: items.filter(i => i.category.toLowerCase() === key).length,
        });
      }
    }
    return [
      { id: 'all', label: 'All Channels', glyph: '◯', count: items.length },
      ...mid,
      { id: 'favorites', label: 'Saved', glyph: '✦', count: favorites.length },
    ];
  }, [items, favorites]);

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
      <CategoryChannels
        channels={channels}
        active={selectedCategory}
        onChange={onCategoryChange}
        search={searchQuery}
        onSearchChange={onSearchChange}
      />

      {/* Loading skeletons — DataCrystal-shaped */}
      {loading && (
        <div className="menu-grid">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(7,16,14,0.6)',
                border: '1px solid rgba(255, 90, 95,0.12)',
                borderRadius: 18,
                overflow: 'hidden',
                height: 320,
                position: 'relative',
                clipPath: 'polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%)',
              }}
            >
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, transparent 0%, rgba(255, 90, 95,0.06) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'crystal-shimmer 1.8s infinite',
              }} />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredItems.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '80px 16px',
          color: 'rgba(255,255,255,0.4)',
        }}>
          <div style={{
            fontFamily: 'Orbitron, monospace',
            fontSize: '3.5rem',
            color: '#ff5a5f',
            opacity: 0.4,
            marginBottom: 18,
            textShadow: '0 0 24px rgba(255, 90, 95,0.4)',
          }}>◯</div>
          <p style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '0.85rem',
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            color: 'rgba(255, 90, 95,0.7)',
          }}>
            NO MATCHES IN CHANNEL
          </p>
          {searchQuery && (
            <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.85rem', marginTop: 8, color: 'rgba(255,255,255,0.3)' }}>
              Refine your query
            </p>
          )}
          {selectedCategory === 'favorites' && favorites.length === 0 && !searchQuery && (
            <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.85rem', marginTop: 8, color: 'rgba(255,255,255,0.3)' }}>
              Mark items with ✦ to save them here
            </p>
          )}
        </div>
      )}

      {/* DataCrystal grid */}
      {!loading && filteredItems.length > 0 && (
        <div className="menu-grid">
          {filteredItems.map((item, idx) => {
            const cartItem = cartItems.find((ci) => ci.id === item.id);
            const cartQuantity = cartItem ? cartItem.quantity : 0;
            const isFavorite = favorites.includes(item.id);
            const delay = `${Math.min(idx, 11) * 0.06}s`;
            return (
              <div key={item.id} style={{ animation: `crystal-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${delay} both` }}>
                <DataCrystal
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
        @keyframes crystal-rise {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes crystal-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200%  0; }
        }
      `}</style>
    </div>
  );
};

export default MenuGrid;
