import React, { useState } from 'react';
import type { MenuItem as MenuItemType } from '../../types';

interface MenuItemProps {
  item: MenuItemType;
  isFavorite: boolean;
  onAddToCart: (item: MenuItemType) => void;
  /** Called when the − button is pressed inside the quantity stepper. */
  onDecrement: (itemId: number) => void;
  onToggleFavorite: (itemId: number) => void;
  cartQuantity: number;
}

const itemCss = `
@keyframes card-float-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes img-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
`;

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span style={{ fontSize: '0.85rem', letterSpacing: '1px' }}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(empty)}
    </span>
  );
}

export const MenuItem: React.FC<MenuItemProps> = ({
  item,
  isFavorite,
  onAddToCart,
  onDecrement,
  onToggleFavorite,
  cartQuantity,
}) => {
  const [hovered, setHovered] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [favAnim, setFavAnim] = useState(false);

  // ── Stock helpers ────────────────────────────────────────────────────────
  const stockQty = item.stock_quantity;
  const outOfStock =
    stockQty !== null && stockQty !== undefined && stockQty !== -1 && stockQty === 0;
  const isAvailable = item.is_available && !outOfStock;
  /** true when cartQuantity has reached the tracked stock limit */
  const atStockLimit =
    stockQty !== null &&
    stockQty !== undefined &&
    stockQty !== -1 &&
    cartQuantity >= stockQty;

  const handleFav = () => {
    setFavAnim(true);
    setTimeout(() => setFavAnim(false), 300);
    onToggleFavorite(item.id);
  };

  return (
    <>
      <style>{itemCss}</style>
      <div
        className="menu-item-card"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: 'rgba(255,255,255,0.03)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${hovered ? 'rgba(0,245,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '16px',
          overflow: 'hidden',
          position: 'relative',
          transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
          boxShadow: hovered
            ? '0 8px 32px rgba(0,245,255,0.15), 0 4px 16px rgba(0,0,0,0.4)'
            : '0 2px 12px rgba(0,0,0,0.3)',
          transition: 'all 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          animation: 'card-float-in 0.4s ease both',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'default',
        }}
      >
        {/* Favorite button */}
        <button
          onClick={handleFav}
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            zIndex: 5,
            width: '36px', height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem',
            transition: 'all 0.2s',
            transform: favAnim ? 'scale(1.4)' : 'scale(1)',
          }}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <span style={{ filter: isFavorite ? 'none' : 'grayscale(1) opacity(0.6)' }}>
            {isFavorite ? '❤️' : '🤍'}
          </span>
        </button>

        {/* Veg / Non-veg badge */}
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 5,
          width: '20px', height: '20px',
          borderRadius: '4px',
          border: `2px solid ${item.is_vegetarian ? '#00ff88' : '#ff3366'}`,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: '10px', height: '10px',
            borderRadius: '50%',
            background: item.is_vegetarian ? '#00ff88' : '#ff3366',
          }} />
        </div>

        {/* Image */}
        <div className="menu-item-img" style={{
          height: '180px',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #1a0a2e, #0a0a1a)',
          position: 'relative',
        }}>
          {!imgLoaded && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%)',
              backgroundSize: '800px 100%',
              animation: 'img-shimmer 1.5s infinite',
            }} />
          )}
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              onLoad={() => setImgLoaded(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'transform 0.35s ease',
                transform: hovered ? 'scale(1.07)' : 'scale(1)',
                opacity: imgLoaded ? 1 : 0,
              }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '3.5rem',
              background: 'linear-gradient(135deg, rgba(0,245,255,0.05), rgba(255,0,255,0.05))',
            }}>
              🍽️
            </div>
          )}

          {/* Out of stock overlay */}
          {outOfStock && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.65)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 3,
            }}>
              <span style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '0.75rem', fontWeight: 700,
                color: '#ff3366', letterSpacing: '2px',
                background: 'rgba(255,51,102,0.15)',
                border: '1px solid rgba(255,51,102,0.5)',
                padding: '5px 12px', borderRadius: '6px',
              }}>
                OUT OF STOCK
              </span>
            </div>
          )}

          {/* Category tag */}
          {item.category && (
            <div style={{
              position: 'absolute',
              bottom: '8px', left: '10px',
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px',
              padding: '2px 8px',
              color: 'rgba(255,255,255,0.65)',
              fontSize: '0.68rem',
              fontFamily: "'Orbitron', sans-serif",
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              {item.category}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="menu-item-body" style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Name */}
          <div className="menu-item-name" style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#fff',
            lineHeight: 1.2,
            letterSpacing: '0.02em',
          }}>
            {item.name}
          </div>

          {/* Rating + prep time */}
          <div className="menu-item-rating-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <StarRating rating={Number(item.rating ?? 0)} />
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginLeft: '2px' }}>
                ({Number(item.rating ?? 0).toFixed(1)})
              </span>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', fontFamily: "'Rajdhani', sans-serif" }}>
              ⏱️ {item.preparation_time ?? 10} mins
            </span>
          </div>

          {/* Description */}
          {item.description && (
            <p className="menu-item-desc" style={{
              color: 'rgba(255,255,255,0.45)',
              fontSize: '0.82rem',
              lineHeight: 1.4,
              margin: 0,
              fontFamily: "'Rajdhani', sans-serif",
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {item.description}
            </p>
          )}

          {/* Price */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: 'auto' }}>
            <span className="menu-item-price" style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '1.3rem',
              fontWeight: 800,
              color: '#ffed4e',
            }}>
              ₹{item.price}
            </span>
          </div>

          {/* Stock badge — shown only when tracked and > 0 */}
          {stockQty !== null && stockQty !== undefined && stockQty !== -1 && stockQty > 0 && (
            <div style={{
              fontSize: '0.72rem',
              color: stockQty <= 5 ? '#ff9f43' : 'rgba(255,255,255,0.4)',
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 600,
            }}>
              {stockQty <= 5 ? `⚠️ Only ${stockQty} left!` : `${stockQty} available`}
            </div>
          )}

          {/* Cart controls */}
          <div style={{ marginTop: '4px' }}>
            {cartQuantity > 0 && isAvailable ? (
              // ── Quantity stepper ──────────────────────────────────────────
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(0,245,255,0.07)',
                border: `1px solid ${atStockLimit ? 'rgba(255,237,78,0.5)' : 'rgba(0,245,255,0.35)'}`,
                borderRadius: '10px',
                overflow: 'hidden',
              }}>
                {/* − button: properly decrements */}
                <button
                  onClick={() => onDecrement(item.id)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    border: 'none',
                    background: 'transparent',
                    color: '#00f5ff',
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    fontFamily: "'Orbitron', sans-serif",
                    fontWeight: 700,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,51,102,0.15)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  −
                </button>

                <span style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontWeight: 800,
                  color: '#fff',
                  fontSize: '1rem',
                  minWidth: '28px',
                  textAlign: 'center',
                }}>
                  {cartQuantity}
                </span>

                {/* + button: disabled at stock limit */}
                <button
                  onClick={() => !atStockLimit && onAddToCart(item)}
                  disabled={atStockLimit}
                  title={atStockLimit ? `Max ${stockQty} available` : undefined}
                  style={{
                    flex: 1,
                    padding: '10px',
                    border: 'none',
                    background: 'transparent',
                    color: atStockLimit ? 'rgba(255,237,78,0.5)' : '#00f5ff',
                    fontSize: '1.1rem',
                    cursor: atStockLimit ? 'not-allowed' : 'pointer',
                    fontFamily: "'Orbitron', sans-serif",
                    fontWeight: 700,
                    transition: 'background 0.15s',
                    opacity: atStockLimit ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!atStockLimit) e.currentTarget.style.background = 'rgba(0,245,255,0.12)';
                  }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  +
                </button>
              </div>
            ) : (
              // ── Add to Cart button ────────────────────────────────────────
              <button
                onClick={() => isAvailable && onAddToCart(item)}
                disabled={!isAvailable}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '10px',
                  border: isAvailable
                    ? '1px solid rgba(0,245,255,0.5)'
                    : '1px solid rgba(255,255,255,0.1)',
                  background: isAvailable ? 'rgba(0,245,255,0.06)' : 'rgba(255,255,255,0.04)',
                  color: isAvailable ? '#00f5ff' : 'rgba(255,255,255,0.3)',
                  cursor: isAvailable ? 'pointer' : 'not-allowed',
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  transition: 'all 0.2s',
                  textTransform: 'uppercase',
                }}
                onMouseEnter={(e) => {
                  if (isAvailable) {
                    e.currentTarget.style.background = 'rgba(0,245,255,0.14)';
                    e.currentTarget.style.boxShadow = '0 0 14px rgba(0,245,255,0.25)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isAvailable
                    ? 'rgba(0,245,255,0.06)'
                    : 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {outOfStock ? '❌ Out of Stock' : isAvailable ? '🛒 Add to Cart' : '⛔ Unavailable'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default MenuItem;
