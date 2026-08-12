import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import {
  addItem,
  removeItem,
  updateQuantity,
  clearCart,
  setPointsToRedeem,
  applyDiscount,
  selectCartTotal,
  selectCartCount,
  selectFinalTotal,
} from '../store/slices/cartSlice';
import { setItemAvailability } from '../store/slices/menuSlice';
import * as cartService from '../services/cart.service';
import { CartItem } from '../types';

// ============================================================================
// useCart — server-backed cart
// ============================================================================
// Quantity changes now reserve real stock. Each mutation is applied to Redux
// FIRST so the UI stays instant, then confirmed with the server; if the server
// refuses (someone else took the last one), the optimistic change is rolled
// back and the caller is told why.
//
// Every call sends the cart's TOTAL quantity for that item rather than a
// delta. Deltas are unsafe here: a retry after a timeout would hold the units
// twice, and on a kiosk over patchy campus wifi that is a routine event, not
// an edge case.
// ============================================================================

export interface CartMutationResult {
  ok: boolean;
  /** Present when the server refused — safe to show to the shopper. */
  message?: string;
}

const OK: CartMutationResult = { ok: true };

export const useCart = () => {
  const dispatch = useDispatch<AppDispatch>();

  const items = useSelector((state: RootState) => state.cart.items);
  const pointsToRedeem = useSelector((state: RootState) => state.cart.pointsToRedeem);
  const discount = useSelector((state: RootState) => state.cart.discount);
  const total = useSelector(selectCartTotal);
  const count = useSelector(selectCartCount);
  const finalTotal = useSelector(selectFinalTotal);

  /**
   * Reserve `quantity` of `id`, rolling the local cart back to
   * `previousQuantity` if the server says there isn't enough left.
   */
  const syncQuantity = useCallback(
    async (id: number, quantity: number, previousQuantity: number): Promise<CartMutationResult> => {
      try {
        const res = await cartService.setItem(id, quantity);

        // Keep the shopper's view of "N left" current either way.
        dispatch(setItemAvailability({ id, available: res.available }));

        if (!res.ok) {
          // Roll back to what was actually held before this attempt.
          if (previousQuantity > 0) {
            dispatch(updateQuantity({ id, quantity: previousQuantity }));
          } else {
            dispatch(removeItem(id));
          }
          return { ok: false, message: res.message ?? 'That item just sold out.' };
        }
        return OK;
      } catch {
        // Network/server failure: the local cart is left as the shopper set it
        // and the hold simply never happened. Checkout re-validates against
        // the server, so this cannot oversell — it only means the reservation
        // isn't protecting them yet.
        return {
          ok: false,
          message: 'Could not reserve that item — check your connection.',
        };
      }
    },
    [dispatch],
  );

  const addToCart = useCallback(
    async (item: CartItem): Promise<CartMutationResult> => {
      const existing = items.find((i) => i.id === item.id);
      const previous = existing?.quantity ?? 0;
      const next = previous + item.quantity;

      dispatch(addItem(item));
      return syncQuantity(item.id, next, previous);
    },
    [dispatch, items, syncQuantity],
  );

  const removeFromCart = useCallback(
    async (id: number): Promise<CartMutationResult> => {
      const previous = items.find((i) => i.id === id)?.quantity ?? 0;
      dispatch(removeItem(id));
      // Releasing must not fail the shopper's action — if the server call
      // drops, the hold expires on its own within the TTL window.
      await syncQuantity(id, 0, previous);
      return OK;
    },
    [dispatch, items, syncQuantity],
  );

  const updateItemQuantity = useCallback(
    async (id: number, quantity: number): Promise<CartMutationResult> => {
      const previous = items.find((i) => i.id === id)?.quantity ?? 0;
      dispatch(updateQuantity({ id, quantity }));
      if (quantity <= 0) {
        await syncQuantity(id, 0, previous);
        return OK;
      }
      return syncQuantity(id, quantity, previous);
    },
    [dispatch, items, syncQuantity],
  );

  const emptyCart = useCallback(async (): Promise<void> => {
    dispatch(clearCart());
    await cartService.clear();
  }, [dispatch]);

  /**
   * Clear local cart state WITHOUT releasing holds — used straight after a
   * successful checkout, where the server has already converted those holds
   * into a sale. Calling the normal clear here would ask the server to return
   * stock the customer is walking away with.
   */
  const clearAfterCheckout = useCallback((): void => {
    dispatch(clearCart());
  }, [dispatch]);

  const setPoints = useCallback((points: number) => {
    dispatch(setPointsToRedeem(points));
  }, [dispatch]);

  const setDiscount = useCallback((amount: number) => {
    dispatch(applyDiscount(amount));
  }, [dispatch]);

  return {
    items,
    total,
    count,
    finalTotal,
    pointsToRedeem,
    discount,
    addToCart,
    removeFromCart,
    updateQuantity: updateItemQuantity,
    clearCart: emptyCart,
    clearAfterCheckout,
    setPointsToRedeem: setPoints,
    applyDiscount: setDiscount,
  };
};
