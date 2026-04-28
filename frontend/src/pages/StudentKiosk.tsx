import React, { useState, useEffect, useCallback, useRef, Component } from 'react';

// ── Error boundary so Ballpit WebGL failures never crash the kiosk UI ─────────
class BallpitBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: Error) { console.warn('Ballpit caught by error boundary:', err.message); }
  render() { return this.state.failed ? null : this.props.children; }
}
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store/store';
import { logout as logoutAction } from '../store/slices/authSlice';
import { setItems, updateItem } from '../store/slices/menuSlice';
import { addItem, removeItem, updateQuantity, clearCart, selectCartCount } from '../store/slices/cartSlice';
import * as menuService from '../services/menu.service';
import * as authService from '../services/auth.service';
import { subscribeToTable, unsubscribe } from '../services/supabase';
import socketService from '../services/socket.service';
import MenuGrid from '../components/student/MenuGrid';
import Cart from '../components/student/Cart';
import Checkout from '../components/student/Checkout';
import { useToast } from '../components/common/Toast';
import type { MenuItem, Order } from '../types';
import api from '../services/api';
// @ts-ignore — JSX component without types
import Orb from '../components/student/Orb';

// ─── Offer Banner ─────────────────────────────────────────────────────────────

interface ActiveOffer {
  id: number;
  title: string;
  description: string;
  discount_percentage: number | null;
  discount_amount: number | null;
  min_order_amount: number | null;
  valid_until: string;
}

const OfferBanner: React.FC<{ offers: ActiveOffer[] }> = ({ offers }) => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (offers.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % offers.length), 4000);
    return () => clearInterval(t);
  }, [offers.length]);

  if (offers.length === 0) return null;

  const offer = offers[idx];
  const discount = offer.discount_percentage
    ? `${offer.discount_percentage}% OFF`
    : offer.discount_amount
    ? `₹${offer.discount_amount} OFF`
    : '';
  const minOrder = offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : '';

  return (
    <div
      className="offer-banner"
      style={{
        background: 'linear-gradient(90deg, rgba(255,0,255,0.12), rgba(0,245,255,0.12), rgba(255,0,255,0.12))',
        border: '1px solid rgba(255,0,255,0.4)',
        borderRadius: 12,
        padding: '10px 18px',
        marginBottom: 18,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        animation: 'offerPulse 3s ease-in-out infinite',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes offerPulse {
          0%, 100% { box-shadow: 0 0 10px rgba(255,0,255,0.2); }
          50% { box-shadow: 0 0 20px rgba(255,0,255,0.4); }
        }
      `}</style>
      <span style={{ fontSize: 'clamp(1rem, 3vw, 1.3rem)' }}>🎁</span>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{
          fontFamily: 'Orbitron, sans-serif',
          fontWeight: 700,
          fontSize: 'clamp(0.65rem, 2vw, 0.75rem)',
          color: '#ff00ff',
          letterSpacing: '0.08em',
        }}>
          {discount && `${discount}${minOrder} · `}{offer.title}
        </div>
        {offer.description && (
          <div style={{
            fontFamily: 'Rajdhani, sans-serif',
            fontSize: 'clamp(0.7rem, 2vw, 0.78rem)',
            color: 'rgba(255,255,255,0.55)',
            marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {offer.description}
          </div>
        )}
      </div>
      {offers.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {offers.map((_, i) => (
            <div
              key={i}
              onClick={() => setIdx(i)}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: i === idx ? '#ff00ff' : 'rgba(255,255,255,0.25)',
                cursor: 'pointer',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};


// ─── Main StudentKiosk Component ──────────────────────────────────────────────

const bgStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0f0a1f 100%)',
  position: 'relative',
};

// Responsive helpers (mobile-first inline styles via JS)
const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 640;

const StudentKiosk: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();

  const menuItems = useSelector((state: RootState) => state.menu.items);
  const menuLoading = useSelector((state: RootState) => state.menu.loading);
  const cartItems = useSelector((state: RootState) => state.cart.items);
  const cartCount = useSelector(selectCartCount);
  const { currentStudent } = useSelector((state: RootState) => state.auth);

  const [favorites, setFavorites] = useState<number[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeOffers, setActiveOffers] = useState<ActiveOffer[]>([]);

  // ── Kiosk is ALWAYS anonymous ─────────────────────────────────────────────
  // Clear any stored token/student on mount so an admin who previously used
  // this browser never leaks into the kiosk UI or gets attached to guest orders.
  useEffect(() => {
    authService.clearAuthData();
    dispatch(logoutAction());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cart bounce animation state
  const [cartBouncing, setCartBouncing] = useState(false);
  const prevCartCount = useRef(cartCount);

  // Trigger bounce when cart count increases
  useEffect(() => {
    if (cartCount > prevCartCount.current) {
      setCartBouncing(true);
      const t = setTimeout(() => setCartBouncing(false), 600);
      prevCartCount.current = cartCount;
      return () => clearTimeout(t);
    }
    prevCartCount.current = cartCount;
  }, [cartCount]);

  // Load active offers on mount
  useEffect(() => {
    api.get('/menu/offers')
      .then(res => { if (res.data?.success) setActiveOffers(res.data.data); })
      .catch(() => {}); // non-fatal
  }, []);

  // Load menu on mount (no login required) + subscribe to live menu changes
  useEffect(() => {
    if (menuItems.length === 0) {
      loadMenu();
    }

    // ── Supabase Realtime: auto-update menu when any row changes ─────────────
    const menuChannel = subscribeToTable('menu_items', ({ eventType, new: row }) => {
      if (eventType === 'UPDATE') {
        const updated = row as Record<string, any>;
        dispatch(updateItem({
          id:             updated.id            as number,
          is_available:   updated.is_available  as boolean,
          stock_quantity: updated.stock_quantity as number | undefined,
          price:          updated.price         as number,
          name:           updated.name          as string,
          image_url:      updated.image_url     as string | undefined,
        }));
      } else {
        // INSERT or DELETE → full refresh
        loadMenu();
      }
    }, 'kiosk:menu_items');

    // ── Socket.IO fallback for stock/availability changes ────────────────────
    // Fires when owner/chef edits a menu item directly (even if Supabase Realtime
    // hasn't been set up yet), or when an order decrements stock.
    const socket = socketService.connect();

    const handleStockUpdate = (data: { id: number; stock_quantity: number; is_available: boolean }) => {
      dispatch(updateItem({
        id:             data.id,
        stock_quantity: data.stock_quantity,
        is_available:   data.is_available,
      }));
    };

    const handleAvailabilityChange = (data: { id: number; is_available: boolean }) => {
      dispatch(updateItem({ id: data.id, is_available: data.is_available }));
    };

    const handleItemUpdated = (data: {
      id: number;
      name?: string;
      price?: number;
      is_available?: boolean;
      stock_quantity?: number;
      image_url?: string;
      category?: string;
      is_vegetarian?: boolean;
    }) => {
      // Full item fields from owner/chef edit — merge into store
      dispatch(updateItem({
        id:             data.id,
        name:           data.name,
        price:          data.price,
        is_available:   data.is_available,
        stock_quantity: data.stock_quantity,
        image_url:      data.image_url,
        category:       data.category,
        is_vegetarian:  data.is_vegetarian,
      }));
    };

    const handleBulkUpdate = () => {
      // Owner bulk-toggled availability — easiest to just refresh
      loadMenu();
    };

    socket.on('menu:stock-updated',       handleStockUpdate);
    socket.on('menu:availability-changed', handleAvailabilityChange);
    socket.on('menu:item-updated',         handleItemUpdated);
    socket.on('menu:bulk-updated',         handleBulkUpdate);

    return () => {
      unsubscribe(menuChannel);
      socket.off('menu:stock-updated',       handleStockUpdate);
      socket.off('menu:availability-changed', handleAvailabilityChange);
      socket.off('menu:item-updated',         handleItemUpdated);
      socket.off('menu:bulk-updated',         handleBulkUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMenu = async () => {
    try {
      const result = await menuService.getAvailable();
      if (result.success && Array.isArray(result.data)) {
        dispatch(setItems(result.data));
      }
    } catch {
      showToast('Failed to load menu. Please refresh.', 'error');
    }
  };

  // Listen for global 401 event — clear student state without page reload
  useEffect(() => {
    const handleUnauth = () => {
      dispatch(logoutAction());
    };
    window.addEventListener('auth:unauthorized', handleUnauth);
    return () => window.removeEventListener('auth:unauthorized', handleUnauth);
  }, [dispatch]);

  const handleAddToCart = useCallback(
    (item: MenuItem) => {
      const existing = cartItems.find((ci) => ci.id === item.id);
      const currentQty = existing?.quantity ?? 0;

      // ── Stock guard ──────────────────────────────────────────────────────
      const stock = item.stock_quantity;
      if (stock !== undefined && stock !== null && stock !== -1) {
        if (currentQty >= stock) {
          showToast(`Only ${stock} available for "${item.name}"`, 'error');
          return;
        }
      }

      if (existing) {
        dispatch(updateQuantity({ id: item.id, quantity: currentQty + 1 }));
      } else {
        dispatch(
          addItem({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
            image_url: item.image_url,
            is_vegetarian: item.is_vegetarian,
          })
        );
      }
      showToast(`${item.name} added to cart! 🛒`, 'success');
    },
    [cartItems, dispatch, showToast]
  );

  /** Decrement quantity in the card stepper; removes the item when it reaches 0. */
  const handleDecrement = useCallback(
    (itemId: number) => {
      const existing = cartItems.find((ci) => ci.id === itemId);
      if (!existing) return;
      if (existing.quantity <= 1) {
        dispatch(removeItem(itemId));
      } else {
        dispatch(updateQuantity({ id: itemId, quantity: existing.quantity - 1 }));
      }
    },
    [cartItems, dispatch]
  );

  const handleToggleFavorite = useCallback((itemId: number) => {
    setFavorites((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  }, []);

  const handleOrderSuccess = useCallback(
    (_order: Order) => {
      // Reset kiosk for the next student — cart only (no auth to clear; kiosk is always anonymous)
      dispatch(clearCart());
      setCheckoutOpen(false);
      setCartOpen(false);
      setSelectedCategory('all');
      setSearchQuery('');
      setFavorites([]);
      showToast('✅ Order placed! Thank you. Kiosk is ready for the next student.', 'success');
    },
    [dispatch, showToast]
  );

  return (
    <div style={bgStyle}>
      {/* ── Orb full-screen background ───────────────────────────────────────── */}
      {/* Dark gradient is the CSS fallback when WebGL is unavailable */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
                    background: 'linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0f0a1f 100%)' }}>
        <BallpitBoundary>
          <Orb
            hue={200}
            hoverIntensity={0.5}
            rotateOnHover={true}
            forceHoverState={false}
            backgroundColor="#0a0a1a"
          />
        </BallpitBoundary>
      </div>

      {/* Sticky header */}
      <header
        className="kiosk-header"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(10,10,26,0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '14px 28px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1
              className="kiosk-title"
              style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: '1.75rem',
                fontWeight: 900,
                background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: 0,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              🍕 SMART CANTEEN
            </h1>
            <p
              className="kiosk-subtitle"
              style={{
                fontSize: '0.7rem',
                letterSpacing: '2.5px',
                color: 'rgba(255,255,255,0.45)',
                fontFamily: 'Rajdhani, sans-serif',
                margin: '3px 0 0 0',
              }}
            >
              CYBER FOOD ORDERING
            </p>
          </div>

          {/* Cart count hint */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {cartCount > 0 && (
              <div
                className="kiosk-cart-hint"
                style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '0.88rem',
                  color: 'rgba(0,245,255,0.75)',
                  letterSpacing: '0.5px',
                  background: 'rgba(0,245,255,0.08)',
                  border: '1px solid rgba(0,245,255,0.2)',
                  borderRadius: 20,
                  padding: '4px 12px',
                }}
              >
                {cartCount} item{cartCount !== 1 ? 's' : ''} in cart
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main
        className="kiosk-main"
        style={{
          padding: '18px 24px',
          maxWidth: 1400,
          margin: '0 auto',
          paddingBottom: 120,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Active offers banner */}
        <OfferBanner offers={activeOffers} />

        {/* Menu grid */}
        <MenuGrid
          items={menuItems}
          favorites={favorites}
          onAddToCart={handleAddToCart}
          onDecrement={handleDecrement}
          onToggleFavorite={handleToggleFavorite}
          cartItems={cartItems}
          loading={menuLoading}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          onCategoryChange={setSelectedCategory}
          onSearchChange={setSearchQuery}
        />
      </main>

      {/* Floating cart button with bounce animation */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes cartBounce {
          0%   { transform: scale(1) translateY(0); }
          30%  { transform: scale(1.25) translateY(-6px); }
          50%  { transform: scale(0.95) translateY(0); }
          70%  { transform: scale(1.1) translateY(-3px); }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes badgePop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.5); }
          100% { transform: scale(1); }
        }
      `}</style>
      <button
        className="kiosk-cart-btn"
        onClick={() => setCartOpen(true)}
        aria-label={`Open cart, ${cartCount} items`}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 22,
          zIndex: 1000,
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(0,245,255,0.12)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '2px solid #00f5ff',
          boxShadow: '0 0 28px rgba(0,245,255,0.45)',
          cursor: 'pointer',
          fontSize: '1.7rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: cartBouncing ? 'cartBounce 0.6s ease' : 'float 3s ease-in-out infinite',
          transition: 'box-shadow 0.3s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 0 45px rgba(0,245,255,0.6)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 0 30px rgba(0,245,255,0.4)';
        }}
      >
        🛒
        {cartCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              background: '#ff3366',
              color: '#fff',
              borderRadius: '50%',
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: 700,
              border: '2px solid #0a0a1a',
              fontFamily: 'Orbitron, sans-serif',
              animation: cartBouncing ? 'badgePop 0.4s ease' : 'none',
            }}
          >
            {cartCount > 99 ? '99+' : cartCount}
          </span>
        )}
      </button>

      {/* Cart modal */}
      <Cart
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        onCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
        studentPoints={currentStudent?.points ?? 0}
        menuItems={menuItems}
      />

      {/* Checkout modal */}
      <Checkout
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={handleOrderSuccess}
        studentId={currentStudent?.id ?? ''}
        studentName={currentStudent?.name ?? ''}
        studentPhone={currentStudent?.phone ?? ''}
      />
    </div>
  );
};

export default StudentKiosk;
