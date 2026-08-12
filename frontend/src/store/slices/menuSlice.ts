import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { MenuItem, MenuState } from '../../types';
import { RootState } from '../store';

const initialState: MenuState = {
  items: [],
  loading: false,
  error: null,
  selectedCategory: 'all',
  searchQuery: '',
  availability: {},
};

const menuSlice = createSlice({
  name: 'menu',
  initialState,
  reducers: {
    setItems(state, action: PayloadAction<MenuItem[]>) {
      state.items = action.payload;
    },

    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },

    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.loading = false;
    },

    setCategory(state, action: PayloadAction<string>) {
      state.selectedCategory = action.payload;
    },

    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },

    updateItemAvailability(
      state,
      action: PayloadAction<{ id: number; is_available: boolean }>
    ) {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) {
        item.is_available = action.payload.is_available;
      }
    },

    /** Merge any fields from a partial MenuItem into the matching store item. */
    updateItem(state, action: PayloadAction<Partial<MenuItem> & { id: number }>) {
      const idx = state.items.findIndex((i) => i.id === action.payload.id);
      if (idx !== -1) {
        state.items[idx] = { ...state.items[idx], ...action.payload };
      }
    },

    // ── Live availability ────────────────────────────────────────────────────
    // Separate from `stock_quantity` on purpose. stock_quantity is what the
    // kitchen physically has; `availability` is what a shopper can actually
    // still add — on-hand minus everything sitting in other people's carts
    // right now. Showing stock_quantity as "left" would promise units that are
    // already reserved and fail the customer at checkout.

    /** Replace the whole availability map (initial load / reconnect). */
    setAvailability(state, action: PayloadAction<Record<number, number>>) {
      state.availability = action.payload;
    },

    /** Apply one live change pushed from the server. */
    setItemAvailability(
      state,
      action: PayloadAction<{ id: number; available: number }>
    ) {
      if (!state.availability) state.availability = {};
      state.availability[action.payload.id] = action.payload.available;
    },
  },
});

export const {
  setItems,
  setLoading,
  setError,
  setCategory,
  setSearchQuery,
  updateItemAvailability,
  updateItem,
  setAvailability,
  setItemAvailability,
} = menuSlice.actions;

/** Live availability map: menu item id → units a shopper can still add. */
export const selectAvailability = (state: RootState) =>
  state.menu.availability ?? {};

// ─── Selectors ────────────────────────────────────────────────────────────────

const selectAllItems = (state: RootState) => state.menu.items;
const selectCategory = (state: RootState) => state.menu.selectedCategory;
const selectQuery = (state: RootState) => state.menu.searchQuery;

/**
 * Memoised selector that filters menu items by selected category and search query.
 */
export const selectFilteredItems = createSelector(
  [selectAllItems, selectCategory, selectQuery],
  (items, category, query) => {
    let filtered = items;

    if (category && category !== 'all') {
      filtered = filtered.filter((item) => item.category === category);
    }

    if (query && query.trim().length > 0) {
      const lower = query.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(lower) ||
          (item.description ?? '').toLowerCase().includes(lower)
      );
    }

    return filtered;
  }
);

export default menuSlice.reducer;
