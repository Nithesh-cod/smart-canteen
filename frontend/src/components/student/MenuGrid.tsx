import React, { useMemo } from 'react';
import type { MenuItem as MenuItemType, CartItem } from '../../types';
import DataCrystal from '../fx/DataCrystal';
import CategoryChannels from '../fx/CategoryChannels';
import { LoadingGrid, EmptyState, NoResultsState } from '../common/states';

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
  all:          '🍽️',
  favorites:    '❤️',
  starters:     '🍢',
  mains:        '🍛',
  'main course':'🍛',
  desserts:     '🍰',
  beverages:    '🥤',
  snacks:       '🍟',
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
      { id: 'all', label: 'All Items', glyph: '🍽️', count: items.length },
      ...mid,
      { id: 'favorites', label: 'Favorites', glyph: '❤️', count: favorites.length },
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

      {/* ── Loading ─────────────────────────────────────────────────────────
          Card-shaped skeletons, not a spinner: they show what is coming and
          hold the layout so nothing jumps when the dishes land. */}
      {loading && <LoadingGrid count={8} />}

      {/* ── Empty / no-results ──────────────────────────────────────────────
          Three genuinely different situations that used to share one "No
          dishes found" message, leaving the reader without the one thing that
          would help: what to do next.
            • a search that matched nothing  → clear the search
            • an empty favourites list       → how to add one
            • a category with nothing in it  → nothing to do but look elsewhere
      */}
      {!loading && filteredItems.length === 0 && (
        <div style={{ padding: '48px 16px' }}>
          {searchQuery ? (
            <NoResultsState
              query={searchQuery}
              onClear={() => onSearchChange('')}
              suggestion="Try a shorter word — or browse a category instead."
            />
          ) : selectedCategory === 'favorites' && favorites.length === 0 ? (
            <EmptyState
              glyph="❤️"
              title="No favourites yet"
              body="Tap the heart on any dish and it'll be waiting here next time."
              actions={[{ label: 'Browse all dishes', onClick: () => onCategoryChange('all'), ghost: true }]}
            />
          ) : (
            <EmptyState
              glyph="🍽️"
              title="Nothing on the menu here"
              body="This category is empty right now. The kitchen updates the menu through the day, so check back shortly."
              actions={[{ label: 'See all dishes', onClick: () => onCategoryChange('all'), ghost: true }]}
            />
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
