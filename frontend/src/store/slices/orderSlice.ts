import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Order, OrderState, OrderStatus } from '../../types';

const initialState: OrderState = {
  currentOrder: null,
  orders: [],
  loading: false,
  error: null,
};

const orderSlice = createSlice({
  name: 'order',
  initialState,
  reducers: {
    setCurrentOrder(state, action: PayloadAction<Order | null>) {
      state.currentOrder = action.payload;
    },

    setOrders(state, action: PayloadAction<Order[]>) {
      state.orders = action.payload;
    },

    /**
     * Update the status of an existing order in the list (and currentOrder if it matches).
     */
    updateOrderStatus(
      state,
      action: PayloadAction<{ id: number; status: OrderStatus }>
    ) {
      const { id, status } = action.payload;
      const order = state.orders.find((o) => o.id === id);
      if (order) {
        order.status = status;
      }
      if (state.currentOrder?.id === id) {
        state.currentOrder.status = status;
      }
    },

    /**
     * Prepend a newly created order to the orders list.
     */
    addOrder(state, action: PayloadAction<Order>) {
      state.orders.unshift(action.payload);
    },

    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },

    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.loading = false;
    },
  },
});

export const {
  setCurrentOrder,
  setOrders,
  updateOrderStatus,
  addOrder,
  setLoading,
  setError,
} = orderSlice.actions;
export default orderSlice.reducer;
