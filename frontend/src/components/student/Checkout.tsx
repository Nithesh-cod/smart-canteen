import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState } from '../../store/store';
import {
  selectCartTotal,
  selectFinalTotal,
  clearCart,
} from '../../store/slices/cartSlice';
import { setCurrentOrder } from '../../store/slices/orderSlice';
import { updateStudent, setCredentials } from '../../store/slices/authSlice';
import * as orderService from '../../services/order.service';
import * as paymentService from '../../services/payment.service';
import { downloadBillPDF, printThermalBill } from '../../services/payment.service';
import * as authService from '../../services/auth.service';
import type { Order } from '../../types';
import Modal from '../common/Modal';

interface CheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (order: Order) => void;
  studentId: string;
  studentName: string;
  studentPhone: string;
}

type CheckoutState = 'info' | 'authenticating' | 'idle' | 'creating' | 'paying' | 'verifying' | 'success' | 'error';

const CONFETTI_COLORS = [
  '#00f5ff',
  '#ff00ff',
  '#ffed4e',
  '#00ff88',
  '#ff3366',
  '#ffffff',
  '#a855f7',
  '#f97316',
];

interface ConfettiParticle {
  id: number;
  color: string;
  left: number;
  delay: number;
  duration: number;
  size: number;
  /** Pre-computed so it never changes between renders (no Math.random in JSX). */
  isRound: boolean;
}

const generateConfetti = (): ConfettiParticle[] =>
  Array.from({ length: 100 }).map((_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 2.5 + Math.random() * 2,
    size: 6 + Math.random() * 8,
    isRound: Math.random() > 0.5,
  }));

const Checkout: React.FC<CheckoutProps> = ({
  isOpen,
  onClose,
  onSuccess,
  studentId: _studentId,
  studentName: _studentName,
  studentPhone: _studentPhone,
}) => {
  const dispatch = useDispatch();
  const currentStudent = useSelector((state: RootState) => state.auth.currentStudent);
  const cartItems = useSelector((state: RootState) => state.cart.items);
  const cartTotal = useSelector(selectCartTotal);
  const finalTotal = useSelector(selectFinalTotal);
  const pointsToRedeem = useSelector((state: RootState) => state.cart.pointsToRedeem);

  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [error, setError] = useState<string>('');
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [confettiParticles] = useState<ConfettiParticle[]>(generateConfetti);
  const [billPrinted, setBillPrinted] = useState<boolean | null>(null);

  // Guest info (collected when student is not logged in)
  const [guestInfo, setGuestInfo] = useState({ name: '', roll: '', phone: '' });
  const wasOpenRef = useRef(false);

  // Reset state every time the modal is freshly opened
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setCheckoutState(currentStudent ? 'idle' : 'info');
      setError('');
      setGuestInfo({ name: '', roll: '', phone: '' });
      setCompletedOrder(null);
      setBillPrinted(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]); // intentionally NOT including currentStudent

  // Derive name/phone from Redux (after possible guest auth)
  const studentName = currentStudent?.name ?? '';
  const studentPhone = currentStudent?.phone ?? '';

  // 1 pt = ₹0.10  →  pointsDiscount in rupees (e.g. 15 pts = ₹1.50)
  const pointsDiscount = pointsToRedeem * 0.10;
  const pointsEarned = Math.floor(finalTotal * 0.1);

  const isBlocking =
    checkoutState === 'paying' ||
    checkoutState === 'verifying' ||
    checkoutState === 'authenticating' ||
    checkoutState === 'success';

  const handleClose = () => {
    if (!isBlocking) {
      onClose();
    }
  };

  const handlePay = async () => {
    setCheckoutState('creating');
    setError('');

    try {
      const orderResult = await orderService.create(
        cartItems.map((i) => ({ menu_item_id: i.id, quantity: i.quantity })),
        pointsToRedeem
      );

      if (!orderResult.success || !orderResult.data) {
        setCheckoutState('error');
        setError(orderResult.message || 'Failed to create order. Please try again.');
        return;
      }

      // Backend returns { order: {...}, points_earned, points_used, discount_applied }
      // The actual Order object is nested under .order
      const rawData = orderResult.data as any;
      const order: Order = rawData?.order ?? rawData;

      if (!order?.id) {
        setCheckoutState('error');
        setError('Failed to create order: invalid response from server.');
        return;
      }

      dispatch(setCurrentOrder(order));
      setCompletedOrder(order);

      // Hide the checkout modal so the Razorpay iframe is fully visible
      setCheckoutState('paying');

      await paymentService.initiateRazorpayPayment({
        orderId: order.id,
        amount: order.total_amount,
        studentName,
        studentPhone,
        onSuccess: (paymentData: any) => {
          setCheckoutState('success');

          // Snapshot cart BEFORE clearing — the bill needs item details.
          // (Defensive: even though JS closures preserve the old reference,
          // an explicit snapshot makes the intent unambiguous.)
          const cartSnapshot = cartItems.map(i => ({
            name: i.name,
            qty: i.quantity,
            price: i.price,
          }));
          const subtotalSnapshot = cartTotal;

          dispatch(clearCart());

          // Use updated points/tier from server response if available
          if (paymentData?.student_points !== undefined) {
            dispatch(updateStudent({
              points: paymentData.student_points,
              ...(paymentData.student_tier && { tier: paymentData.student_tier }),
            }));
          }

          // ── Bill handling ──────────────────────────────────────────────
          if (paymentData?.bill_printed === true) {
            // Thermal printer sent the receipt
            setBillPrinted(true);
          } else if (paymentData?.bill_pdf) {
            // Printer offline → auto-download PDF
            setBillPrinted(false);
            downloadBillPDF(
              paymentData.bill_pdf,
              `bill-${order.order_number}.pdf`
            );
          } else {
            setBillPrinted(null); // unknown / not available
          }

          // ── Client-side thermal bill popup (always) ────────────────────
          // 1 pt = ₹0.10  →  multiply by 0.10 to get rupee value
          const pointsUsed = order.points_used ?? 0;
          try {
            printThermalBill({
              orderNumber: order.order_number,
              orderId: order.id,
              createdAt: order.created_at,
              studentName: studentName,
              studentRoll: currentStudent?.roll_number ?? '',
              items: cartSnapshot,
              subtotal: subtotalSnapshot,
              pointsUsed,
              pointsDiscount: pointsUsed * 0.10,
              totalAmount: order.total_amount,
              paymentMethod: 'Razorpay (UPI/Card)',
              pointsEarned: order.points_earned ?? 0,
            });
          } catch {
            // Print popup may be blocked — silently ignore
          }
        },
        onFailure: (err: { message?: string }) => {
          setCheckoutState('error');
          setError(err.message || 'Payment failed. Please try again.');
        },
      });
    } catch (err: unknown) {
      setCheckoutState('error');
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(msg);
    }
  };

  const handleTryAgain = () => {
    setCheckoutState(currentStudent ? 'idle' : 'info');
    setError('');
  };

  // ── Guest info handler ──────────────────────────────────────────────────────
  const handleGuestInfo = async () => {
    const { name, roll, phone } = guestInfo;
    if (!name.trim() || !roll.trim() || !phone.trim()) {
      setError('Please fill in your name, roll number, and phone number.');
      return;
    }
    setCheckoutState('authenticating');
    setError('');
    try {
      // ── Step 1: Try login (existing student) ────────────────────────────
      // A 404 from the server means "no account yet" — not a fatal error.
      // A 401 would be intercepted by axios and fire auth:unauthorized, but
      // the backend now returns 404 for missing users, so axios just throws
      // a regular error here and we fall through to signup.
      let authData: { token: string; student: import('../../types').Student } | null = null;

      try {
        const loginResult = await authService.login(roll.trim());
        if (loginResult.success && loginResult.data) {
          authData = loginResult.data;
        }
      } catch {
        // 404 / network error → treat as "user not found", continue to signup
        authData = null;
      }

      // ── Step 2: Auto-register if not found ──────────────────────────────
      if (!authData) {
        const signupResult = await authService.signup({
          name: name.trim(),
          roll_number: roll.trim(),
          phone: phone.trim(),
        });
        if (!signupResult.success || !signupResult.data) {
          setError(signupResult.message || 'Could not create account. Please check your details.');
          setCheckoutState('info');
          return;
        }
        authData = signupResult.data;
      }

      // ── Step 3: Persist and proceed ─────────────────────────────────────
      authService.saveAuthData(authData.token, authData.student);
      dispatch(setCredentials({ student: authData.student, token: authData.token }));
      setCheckoutState('idle');
    } catch (err: unknown) {
      // Catch signup errors (e.g. duplicate phone, network failure)
      const serverMsg = (err as any)?.response?.data?.message;
      setError(serverMsg || 'Could not authenticate. Please check your details and try again.');
      setCheckoutState('info');
    }
  };

  const handleContinueShopping = () => {
    if (completedOrder) {
      onSuccess(completedOrder);
    }
    onClose();
  };

  const renderSpinner = () => (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        border: '3px solid rgba(0,245,255,0.2)',
        borderTop: '3px solid #00f5ff',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto',
      }}
    />
  );

  const renderIdleContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Order summary */}
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h3
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '2px',
            marginBottom: 14,
            textTransform: 'uppercase',
          }}
        >
          Order Summary
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {cartItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'Rajdhani, sans-serif',
                fontSize: '0.95rem',
                color: 'rgba(255,255,255,0.75)',
              }}
            >
              <span>
                {item.name}{' '}
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>× {item.quantity}</span>
              </span>
              <span>₹{(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div
          style={{
            height: 1,
            background: 'rgba(255,255,255,0.08)',
            marginBottom: 12,
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontFamily: 'Rajdhani, sans-serif',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '0.9rem',
            }}
          >
            <span>Subtotal</span>
            <span>₹{cartTotal.toFixed(2)}</span>
          </div>

          {pointsToRedeem > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#00ff88',
                fontSize: '0.9rem',
              }}
            >
              <span>Points Discount ({pointsToRedeem} pts)</span>
              <span>−₹{pointsDiscount.toFixed(2)}</span>
            </div>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 4,
            }}
          >
            <span
              style={{
                fontFamily: 'Rajdhani, sans-serif',
                fontWeight: 700,
                fontSize: '1rem',
                color: '#ffffff',
              }}
            >
              Total
            </span>
            <span
              style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '1.5rem',
                fontWeight: 900,
                color: '#ffed4e',
              }}
            >
              ₹{finalTotal.toFixed(2)}
            </span>
          </div>

          <div
            style={{
              textAlign: 'center',
              color: '#00f5ff',
              fontSize: '0.82rem',
              fontFamily: 'Rajdhani, sans-serif',
              marginTop: 2,
            }}
          >
            You'll earn {pointsEarned} points on this order 💎
          </div>
        </div>
      </div>

      {/* Pay button */}
      <button
        onClick={handlePay}
        disabled={cartItems.length === 0}
        style={{
          width: '100%',
          padding: '18px',
          borderRadius: 14,
          border: 'none',
          background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
          color: '#ffffff',
          fontSize: '1.15rem',
          fontFamily: 'Orbitron, sans-serif',
          fontWeight: 900,
          cursor: 'pointer',
          letterSpacing: '1px',
          boxShadow: '0 0 30px rgba(0,245,255,0.35), 0 0 60px rgba(255,0,255,0.2)',
          transition: 'all 0.3s',
          textShadow: '0 0 10px rgba(0,0,0,0.5)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow =
            '0 0 40px rgba(0,245,255,0.5), 0 0 80px rgba(255,0,255,0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow =
            '0 0 30px rgba(0,245,255,0.35), 0 0 60px rgba(255,0,255,0.2)';
        }}
      >
        💳 Pay ₹{finalTotal.toFixed(2)} via Razorpay
      </button>
    </div>
  );

  const renderLoadingContent = (message: string) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        padding: '40px 20px',
      }}
    >
      {renderSpinner()}
      <p
        style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '1.1rem',
          color: 'rgba(255,255,255,0.7)',
          letterSpacing: '1px',
        }}
      >
        {message}
      </p>
    </div>
  );

  const renderSuccessContent = () => (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: '32px 20px',
        textAlign: 'center',
      }}
    >
      {/* Confetti */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        {confettiParticles.map((p) => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              top: '-10px',
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.isRound ? '50%' : '2px',
              animation: `confettiFall ${p.duration}s ${p.delay}s ease-in infinite`,
              opacity: 0.9,
            }}
          />
        ))}
      </div>

      {/* Green checkmark */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'rgba(0,255,136,0.15)',
          border: '3px solid #00ff88',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2.5rem',
          animation: 'scaleIn 0.5s ease-out forwards',
          boxShadow: '0 0 30px rgba(0,255,136,0.4)',
        }}
      >
        ✓
      </div>

      <h2
        style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: '1.4rem',
          fontWeight: 900,
          color: '#00ff88',
          textShadow: '0 0 20px rgba(0,255,136,0.5)',
        }}
      >
        Payment Successful! 🎉
      </h2>

      {completedOrder && (
        <>
          <div
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '1rem',
              color: 'rgba(255,255,255,0.7)',
              letterSpacing: '1px',
            }}
          >
            Order{' '}
            <span style={{ color: '#00f5ff', fontWeight: 700 }}>
              #{completedOrder.order_number}
            </span>
          </div>

          <div
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '1.3rem',
              fontWeight: 700,
              color: '#ffffff',
            }}
          >
            Total: ₹{completedOrder.total_amount.toFixed(2)}
          </div>

          <div
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '1.05rem',
              color: '#ffed4e',
              fontWeight: 700,
              textShadow: '0 0 10px rgba(255,237,78,0.4)',
            }}
          >
            Earned {completedOrder.points_earned} points! 💎
          </div>

          {/* Bill status */}
          <div
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '0.9rem',
              color: billPrinted === true
                ? '#00ff88'
                : billPrinted === false
                ? '#00f5ff'
                : 'rgba(255,255,255,0.45)',
              background: billPrinted === true
                ? 'rgba(0,255,136,0.08)'
                : billPrinted === false
                ? 'rgba(0,245,255,0.08)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${
                billPrinted === true ? 'rgba(0,255,136,0.3)'
                : billPrinted === false ? 'rgba(0,245,255,0.3)'
                : 'rgba(255,255,255,0.1)'
              }`,
              borderRadius: 10,
              padding: '8px 18px',
              zIndex: 1,
              position: 'relative',
            }}
          >
            {billPrinted === true  && '🖨️  Bill printed at counter'}
            {billPrinted === false && '📄  Bill downloaded as PDF'}
            {billPrinted === null  && '📋  Bill not available'}
          </div>
        </>
      )}

      <button
        onClick={handleContinueShopping}
        style={{
          marginTop: 8,
          padding: '13px 32px',
          borderRadius: 12,
          border: '1px solid #00f5ff',
          background: 'rgba(0,245,255,0.1)',
          color: '#00f5ff',
          fontSize: '1rem',
          fontFamily: 'Rajdhani, sans-serif',
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '1px',
          transition: 'all 0.3s',
          zIndex: 1,
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0,245,255,0.2)';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(0,245,255,0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0,245,255,0.1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Continue Shopping
      </button>
    </div>
  );

  const renderErrorContent = () => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: '32px 20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(255,51,102,0.15)',
          border: '3px solid #ff3366',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          color: '#ff3366',
          boxShadow: '0 0 30px rgba(255,51,102,0.3)',
        }}
      >
        ✕
      </div>

      <h3
        style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: '1.1rem',
          color: '#ff3366',
        }}
      >
        Payment Failed
      </h3>

      <p
        style={{
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '0.95rem',
          color: 'rgba(255,255,255,0.6)',
          maxWidth: 360,
          lineHeight: 1.5,
        }}
      >
        {error || 'Something went wrong. Please try again.'}
      </p>

      <button
        onClick={handleTryAgain}
        style={{
          padding: '12px 28px',
          borderRadius: 10,
          border: '1px solid #00f5ff',
          background: 'rgba(0,245,255,0.1)',
          color: '#00f5ff',
          fontSize: '1rem',
          fontFamily: 'Rajdhani, sans-serif',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s',
          letterSpacing: '0.5px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(0,245,255,0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(0,245,255,0.1)';
        }}
      >
        Try Again
      </button>
    </div>
  );

  const renderInfoContent = () => {
    const inputStyle: React.CSSProperties = {
      width: '100%',
      padding: '12px 16px',
      borderRadius: '10px',
      border: '1px solid rgba(0,245,255,0.3)',
      background: 'rgba(255,255,255,0.04)',
      color: '#fff',
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '1rem',
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    };
    const labelStyle: React.CSSProperties = {
      fontFamily: 'Rajdhani, sans-serif',
      fontSize: '0.78rem',
      fontWeight: 700,
      color: 'rgba(255,255,255,0.5)',
      letterSpacing: '1.5px',
      textTransform: 'uppercase',
      display: 'block',
      marginBottom: 5,
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 6 }}>👤</div>
          <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '1rem', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>
            Enter your details to place an order.<br />
            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)' }}>Returning? Your points will be loaded automatically.</span>
          </p>
        </div>

        <div>
          <label style={labelStyle}>Full Name</label>
          <input
            type="text"
            placeholder="e.g. Arjun Sharma"
            value={guestInfo.name}
            onChange={e => setGuestInfo(g => ({ ...g, name: e.target.value }))}
            onFocus={e => { e.currentTarget.style.borderColor = '#00f5ff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,245,255,0.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,245,255,0.3)'; e.currentTarget.style.boxShadow = 'none'; }}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Roll Number</label>
          <input
            type="text"
            placeholder="e.g. 21CS101"
            value={guestInfo.roll}
            onChange={e => setGuestInfo(g => ({ ...g, roll: e.target.value }))}
            onFocus={e => { e.currentTarget.style.borderColor = '#00f5ff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,245,255,0.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,245,255,0.3)'; e.currentTarget.style.boxShadow = 'none'; }}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Phone Number</label>
          <input
            type="tel"
            placeholder="e.g. 9876543210"
            value={guestInfo.phone}
            onChange={e => setGuestInfo(g => ({ ...g, phone: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleGuestInfo()}
            onFocus={e => { e.currentTarget.style.borderColor = '#00f5ff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,245,255,0.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(0,245,255,0.3)'; e.currentTarget.style.boxShadow = 'none'; }}
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(255,51,102,0.1)',
            border: '1px solid rgba(255,51,102,0.4)',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#ff3366',
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: '0.9rem',
          }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleGuestInfo}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 14,
            border: 'none',
            background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
            color: '#fff',
            fontSize: '1.05rem',
            fontFamily: 'Orbitron, sans-serif',
            fontWeight: 900,
            cursor: 'pointer',
            letterSpacing: '1px',
            boxShadow: '0 0 25px rgba(0,245,255,0.3)',
            transition: 'all 0.3s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(0,245,255,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 0 25px rgba(0,245,255,0.3)'; }}
        >
          Continue to Checkout →
        </button>
      </div>
    );
  };

  const renderContent = () => {
    switch (checkoutState) {
      case 'info':
        return renderInfoContent();
      case 'authenticating':
        return renderLoadingContent('Verifying identity...');
      case 'idle':
        return renderIdleContent();
      case 'creating':
        return renderLoadingContent('Creating order...');
      case 'paying':
        return renderLoadingContent('Opening payment gateway...');
      case 'verifying':
        return renderLoadingContent('Verifying payment...');
      case 'success':
        return renderSuccessContent();
      case 'error':
        return renderErrorContent();
    }
  };

  // While Razorpay is open ('paying' state), unmount our modal so the Razorpay
  // iframe is fully visible and interactive. It re-mounts on success / error.
  const modalVisible = isOpen && checkoutState !== 'paying';

  return (
    <>
      <Modal
        isOpen={modalVisible}
        onClose={handleClose}
        title={checkoutState === 'info' || checkoutState === 'authenticating' ? '👤 Who\'s Ordering?' : '💳 Checkout'}
        maxWidth="560px"
      >
        {renderContent()}
      </Modal>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes scaleIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes confettiFall {
          0% {
            transform: translateY(-10px) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(520px) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
};

export default Checkout;
