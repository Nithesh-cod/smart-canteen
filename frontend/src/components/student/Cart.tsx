import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store/store';
import {
  removeItem,
  updateQuantity,
  setPointsToRedeem,
  selectCartTotal,
  selectFinalTotal,
} from '../../store/slices/cartSlice';
import Modal from '../common/Modal';
import type { MenuItem } from '../../types';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
  studentPoints: number;
  /** Full menu items array — used to enforce stock limits inside the cart. */
  menuItems: MenuItem[];
}

const Cart: React.FC<CartProps> = ({ isOpen, onClose, onCheckout, studentPoints, menuItems }) => {
  const dispatch = useDispatch();
  const cartItems  = useSelector((state: RootState) => state.cart.items);
  const cartTotal  = useSelector(selectCartTotal);
  const finalTotal = useSelector(selectFinalTotal);
  const pointsToRedeem = useSelector((state: RootState) => state.cart.pointsToRedeem);

  // 1 pt = ₹0.10; backend caps discount at 50% of order total
  const actualPointsSavings = pointsToRedeem * 0.10;
  const pointsEarned = Math.floor(finalTotal * 0.1);

  // ── Quantity handlers ──────────────────────────────────────────────────────

  const handleDecrement = (id: number, currentQty: number) => {
    if (currentQty <= 1) {
      dispatch(removeItem(id));
    } else {
      dispatch(updateQuantity({ id, quantity: currentQty - 1 }));
    }
  };

  const handleIncrement = (id: number, currentQty: number) => {
    // Stock guard — look up the live stock from the menu store
    const menuItem = menuItems.find((m) => m.id === id);
    const stock = menuItem?.stock_quantity;
    if (stock !== undefined && stock !== null && stock !== -1 && currentQty >= stock) {
      // Silently block — the button will be visually disabled anyway
      return;
    }
    dispatch(updateQuantity({ id, quantity: currentQty + 1 }));
  };

  // ── Points handlers ────────────────────────────────────────────────────────

  const handleRedeemPoints = () => {
    // Mirror backend rule: max 50% of cart total, 1 pt = ₹0.10
    const maxDiscountRs  = cartTotal * 0.5;
    const studentValueRs = studentPoints * 0.10;
    const actualDiscountRs = Math.min(studentValueRs, maxDiscountRs);
    // Convert back to whole points (round up so value stays ≤ cap)
    const pointsToUse = Math.min(Math.ceil(actualDiscountRs / 0.10), studentPoints);
    dispatch(setPointsToRedeem(pointsToUse));
  };

  const handleRemovePoints = () => {
    dispatch(setPointsToRedeem(0));
  };

  // ── Pre-compute capped savings for display ─────────────────────────────────
  const maxPossibleSavingsRs = cartTotal * 0.5;
  const studentValueRs = studentPoints * 0.10;
  const displaySavings = Math.min(studentValueRs, maxPossibleSavingsRs);
  const displayPoints  = Math.min(Math.ceil(displaySavings / 0.10), studentPoints);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🛒 Your Cart" maxWidth="620px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Cart items ─────────────────────────────────────────────────── */}
        {cartItems.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 20px',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'Rajdhani, sans-serif', fontSize: '1.1rem',
          }}>
            Your cart is empty! 🛒
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cartItems.map((item) => {
              // Look up live stock to decide whether + is allowed
              const menuItem = menuItems.find((m) => m.id === item.id);
              const stock = menuItem?.stock_quantity;
              const atStockLimit =
                stock !== undefined && stock !== null && stock !== -1 && item.quantity >= stock;

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12, transition: 'border-color 0.2s',
                  }}
                >
                  {/* Thumbnail */}
                  {item.image_url && (
                    <img
                      src={item.image_url} alt={item.name}
                      style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {item.is_vegetarian && <span style={{ fontSize: '0.8rem' }}>🟢</span>}
                      <span style={{
                        fontFamily: 'Rajdhani, sans-serif', fontWeight: 700,
                        fontSize: '1rem', color: '#ffffff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.name}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
                      ₹{item.price.toFixed(2)} × {item.quantity} ={' '}
                      <span style={{ color: '#00f5ff', fontWeight: 600 }}>
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </span>
                    {atStockLimit && (
                      <div style={{ fontSize: '0.72rem', color: '#ffed4e', fontFamily: 'Rajdhani, sans-serif', marginTop: 2 }}>
                        ⚠️ Max {stock} available
                      </div>
                    )}
                  </div>

                  {/* Quantity stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleDecrement(item.id, item.quantity)}
                      style={{
                        width: 30, height: 30, borderRadius: '50%',
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'rgba(255,255,255,0.05)',
                        color: '#ffffff', fontSize: '1rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s', lineHeight: 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,51,102,0.2)';
                        e.currentTarget.style.borderColor = '#ff3366';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      }}
                    >
                      −
                    </button>

                    <span style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: '0.9rem',
                      fontWeight: 700, color: '#ffffff', minWidth: 20, textAlign: 'center',
                    }}>
                      {item.quantity}
                    </span>

                    {/* + button disabled at stock limit */}
                    <button
                      onClick={() => handleIncrement(item.id, item.quantity)}
                      disabled={atStockLimit}
                      title={atStockLimit ? `Only ${stock} available` : undefined}
                      style={{
                        width: 30, height: 30, borderRadius: '50%',
                        border: `1px solid ${atStockLimit ? 'rgba(255,237,78,0.3)' : 'rgba(255,255,255,0.15)'}`,
                        background: atStockLimit ? 'rgba(255,237,78,0.05)' : 'rgba(255,255,255,0.05)',
                        color: atStockLimit ? 'rgba(255,237,78,0.4)' : '#ffffff',
                        fontSize: '1rem',
                        cursor: atStockLimit ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s', lineHeight: 1,
                        opacity: atStockLimit ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!atStockLimit) {
                          e.currentTarget.style.background = 'rgba(0,245,255,0.2)';
                          e.currentTarget.style.borderColor = '#00f5ff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!atStockLimit) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                        }
                      }}
                    >
                      +
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => dispatch(removeItem(item.id))}
                    title="Remove item"
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      border: '1px solid rgba(255,51,102,0.3)',
                      background: 'rgba(255,51,102,0.1)',
                      color: '#ff3366', fontSize: '0.8rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s', flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,51,102,0.25)';
                      e.currentTarget.style.borderColor = '#ff3366';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,51,102,0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255,51,102,0.3)';
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Points section ─────────────────────────────────────────────── */}
        {cartItems.length > 0 && studentPoints > 0 && (
          <div style={{
            padding: '16px',
            background: 'rgba(0,255,136,0.05)',
            border: '1px solid rgba(0,255,136,0.2)',
            borderRadius: 12,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: 10,
            }}>
              <div>
                <div style={{
                  fontFamily: 'Rajdhani, sans-serif', fontWeight: 700,
                  fontSize: '0.95rem', color: '#00ff88', marginBottom: 2,
                }}>
                  💎 Available Points: {studentPoints}
                </div>
                {pointsToRedeem > 0 && (
                  <div style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.85rem', color: 'rgba(0,255,136,0.7)' }}>
                    Redeeming {pointsToRedeem} pts → saves ₹{actualPointsSavings.toFixed(2)}
                  </div>
                )}
              </div>

              {pointsToRedeem > 0 ? (
                <button
                  onClick={handleRemovePoints}
                  style={{
                    padding: '7px 14px', borderRadius: 8,
                    border: '1px solid rgba(255,51,102,0.4)',
                    background: 'rgba(255,51,102,0.1)',
                    color: '#ff3366', fontSize: '0.85rem',
                    fontFamily: 'Rajdhani, sans-serif', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,51,102,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,51,102,0.1)'; }}
                >
                  Remove
                </button>
              ) : studentPoints >= 10 ? (
                <button
                  onClick={handleRedeemPoints}
                  style={{
                    padding: '7px 14px', borderRadius: 8,
                    border: '1px solid rgba(0,255,136,0.4)',
                    background: 'rgba(0,255,136,0.1)',
                    color: '#00ff88', fontSize: '0.85rem',
                    fontFamily: 'Rajdhani, sans-serif', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,255,136,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,255,136,0.1)'; }}
                >
                  {/* Show the actual amount that will be redeemed, capped at 50% */}
                  Use {displayPoints} pts (save ₹{displaySavings.toFixed(2)})
                </button>
              ) : (
                <span style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
                  Need 10+ points to redeem
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Order summary ──────────────────────────────────────────────── */}
        {cartItems.length > 0 && (
          <div style={{
            padding: '16px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'Rajdhani, sans-serif' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem' }}>
                <span>Subtotal</span>
                <span>₹{cartTotal.toFixed(2)}</span>
              </div>

              {pointsToRedeem > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#00ff88', fontSize: '0.95rem' }}>
                  <span>Points Discount ({pointsToRedeem} pts)</span>
                  <span>−₹{actualPointsSavings.toFixed(2)}</span>
                </div>
              )}

              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>Total</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffed4e', fontFamily: 'Orbitron, sans-serif' }}>
                  ₹{finalTotal.toFixed(2)}
                </span>
              </div>

              <div style={{ textAlign: 'center', color: '#00f5ff', fontSize: '0.85rem', marginTop: 4 }}>
                You'll earn {pointsEarned} points! 💎
              </div>
            </div>
          </div>
        )}

        {/* ── Checkout button ────────────────────────────────────────────── */}
        <button
          onClick={onCheckout}
          disabled={cartItems.length === 0}
          style={{
            width: '100%', padding: '15px', borderRadius: 12, border: 'none',
            background: cartItems.length === 0 ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #00ff88, #00c870)',
            color: cartItems.length === 0 ? 'rgba(255,255,255,0.3)' : '#0a0a1a',
            fontSize: '1.05rem', fontFamily: 'Rajdhani, sans-serif', fontWeight: 800,
            cursor: cartItems.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s', letterSpacing: '1px',
            boxShadow: cartItems.length === 0 ? 'none' : '0 0 20px rgba(0,255,136,0.3)',
          }}
          onMouseEnter={(e) => {
            if (cartItems.length > 0) {
              e.currentTarget.style.boxShadow = '0 0 30px rgba(0,255,136,0.5)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (cartItems.length > 0) {
              e.currentTarget.style.boxShadow = '0 0 20px rgba(0,255,136,0.3)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          Proceed to Checkout →
        </button>
      </div>
    </Modal>
  );
};

export default Cart;
