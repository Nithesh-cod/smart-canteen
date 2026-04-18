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
import { CartItem } from '../types';

export const useCart = () => {
  const dispatch = useDispatch<AppDispatch>();

  const items = useSelector((state: RootState) => state.cart.items);
  const pointsToRedeem = useSelector((state: RootState) => state.cart.pointsToRedeem);
  const discount = useSelector((state: RootState) => state.cart.discount);
  const total = useSelector(selectCartTotal);
  const count = useSelector(selectCartCount);
  const finalTotal = useSelector(selectFinalTotal);

  const addToCart = (item: CartItem) => {
    dispatch(addItem(item));
  };

  const removeFromCart = (id: number) => {
    dispatch(removeItem(id));
  };

  const updateItemQuantity = (id: number, quantity: number) => {
    dispatch(updateQuantity({ id, quantity }));
  };

  const emptyCart = () => {
    dispatch(clearCart());
  };

  const setPoints = (points: number) => {
    dispatch(setPointsToRedeem(points));
  };

  const setDiscount = (amount: number) => {
    dispatch(applyDiscount(amount));
  };

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
    setPointsToRedeem: setPoints,
    applyDiscount: setDiscount,
  };
};
