import { createSlice, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { CartItem, CartState } from '../../types';
import { RootState } from '../store';

const initialState: CartState = {
  items: [],
  pointsToRedeem: 0,
  discount: 0,
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    /**
     * Add an item to the cart. If it already exists, increment its quantity.
     */
    addItem(state, action: PayloadAction<CartItem>) {
      const existing = state.items.find((i) => i.id === action.payload.id);
      if (existing) {
        existing.quantity += action.payload.quantity;
      } else {
        state.items.push({ ...action.payload });
      }
    },

    /**
     * Remove an item from the cart by its menu item ID.
     */
    removeItem(state, action: PayloadAction<number>) {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },

    /**
     * Set an item's quantity. Removes the item if quantity drops to 0 or below.
     */
    updateQuantity(
      state,
      action: PayloadAction<{ id: number; quantity: number }>
    ) {
      const { id, quantity } = action.payload;
      if (quantity <= 0) {
        state.items = state.items.filter((i) => i.id !== id);
      } else {
        const item = state.items.find((i) => i.id === id);
        if (item) {
          item.quantity = quantity;
        }
      }
    },

    /**
     * Empty the cart and reset points/discount.
     */
    clearCart(state) {
      state.items = [];
      state.pointsToRedeem = 0;
      state.discount = 0;
    },

    /**
     * Set how many loyalty points the student wants to redeem.
     */
    setPointsToRedeem(state, action: PayloadAction<number>) {
      state.pointsToRedeem = action.payload;
    },

    /**
     * Apply a flat discount amount (e.g. from a promo code).
     */
    applyDiscount(state, action: PayloadAction<number>) {
      state.discount = action.payload;
    },
  },
});

export const {
  addItem,
  removeItem,
  updateQuantity,
  clearCart,
  setPointsToRedeem,
  applyDiscount,
} = cartSlice.actions;

// ─── Selectors ────────────────────────────────────────────────────────────────

const selectCartItems = (state: RootState) => state.cart.items;
const selectDiscount = (state: RootState) => state.cart.discount;
const selectPointsToRedeem = (state: RootState) => state.cart.pointsToRedeem;

/** Sum of (price × quantity) for all cart items. */
export const selectCartTotal = createSelector([selectCartItems], (items) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

/** Total number of individual units in the cart. */
export const selectCartCount = createSelector([selectCartItems], (items) =>
  items.reduce((sum, item) => sum + item.quantity, 0)
);

/**
 * Final amount after subtracting points redemption value (1 pt = ₹0.10)
 * and any flat discount. Floored at 0.
 */
export const selectFinalTotal = createSelector(
  [selectCartTotal, selectDiscount, selectPointsToRedeem],
  (total, discount, points) => {
    const pointsValue = points * 0.1;
    return Math.max(0, total - pointsValue - discount);
  }
);

export default cartSlice.reducer;
