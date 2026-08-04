import React, { useState } from 'react';
import { useTilt } from '../../hooks/useTilt';
import type { MenuItem as MenuItemType } from '../../types';

/**
 * DataCrystal — a menu item rendered as a clipped, layered HUD panel.
 *
 * This is the deliberate replacement for the old rectangular card. Visual
 * language:
 *   - Outer shape: clip-path polygon with a notched top-right corner so it
 *     reads as a hard-edged crystal, not a soft pill.
 *   - Image takes the upper 60% of the body, dimmed by a gradient floor so
 *     the title sits in contrast without a hard divider.
 *   - Category appears top-left as a glowing chip; veg/non-veg dot appears
 *     bottom-right of the image as a "data marker".
 *   - Price is a floating tilted token at the bottom-right that breaks the
 *     card silhouette — feels like a HUD callout, not a label.
 *   - Title + description are stacked with extreme letter-spacing to read
 *     as a system entry rather than a normal product card.
 *   - HOVER: 3D parallax tilt + animated cross-hair reticle materialises
 *     over the centre of the image.
 *
 * Pure CSS + SVG; no new dependencies. Layered z-index handles the float-
 * outside-the-card price token without breaking grid layout.
 */
interface DataCrystalProps {
  item: MenuItemType;
  isFavorite: boolean;
  onAddToCart: (item: MenuItemType) => void;
  onDecrement: (itemId: number) => void;
  onToggleFavorite: (itemId: number) => void;
  cartQuantity: number;
}

const css = `
@keyframes crystal-in {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}
@keyframes reticle-spin {
  to { transform: rotate(360deg); }
}
@keyframes reticle-pulse {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 0.95; }
}
@keyframes price-float {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  50%      { transform: translateY(-3px) rotate(-3deg); }
}

.crystal {
  position: relative;
  /* Proper solid backdrop — was too transparent so the cursor-following
     glow + grid floor bled through and obliterated the BEVERAGES chip on
     bright food images. Now the card is a real surface that sits on top. */
  background:
    linear-gradient(180deg, rgba(255, 90, 95,0.045) 0%, transparent 35%),
    linear-gradient(180deg, #0a1816 0%, #1b0e0c 100%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 18px;
  overflow: hidden;
  /* Notched top-right corner — this is what makes it a crystal and not a card */
  clip-path: polygon(
    0% 0%,
    calc(100% - 28px) 0%,
    100% 28px,
    100% 100%,
    0% 100%
  );
  cursor: default;
  animation: crystal-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
  border: 1px solid rgba(255,255,255,0.06);
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
  display: flex;
  flex-direction: column;
}
.crystal::before {
  /* Tiny inner highlight on the top edge — suggests the surface is
     catching light from above, gives the crystal physical presence. */
  content: '';
  position: absolute;
  top: 0; left: 8%; right: 28%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 90, 95,0.5), transparent);
  pointer-events: none;
  z-index: 2;
}
.crystal.hover {
  border-color: rgba(255, 90, 95,0.4);
  box-shadow:
    0 28px 80px rgba(255, 90, 95,0.18),
    0 6px 18px rgba(0,0,0,0.6),
    inset 0 0 0 1px rgba(255, 90, 95,0.06);
}
.crystal-img {
  position: relative;
  aspect-ratio: 16/11;
  overflow: hidden;
  background: linear-gradient(135deg, #241512, #140a09);
}
.crystal-img img {
  width: 100%; height: 100%;
  object-fit: cover;
  transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), filter 0.35s;
  filter: brightness(0.78) saturate(1.1);
}
.crystal.hover .crystal-img img {
  transform: scale(1.06);
  filter: brightness(0.92) saturate(1.2);
}
.crystal-img::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 50%,
    rgba(7,16,14,0.55) 88%,
    rgba(7,16,14,0.95) 100%
  );
  pointer-events: none;
}
.crystal-cat {
  position: absolute;
  top: 12px; left: 12px;
  z-index: 4;
  font-family: 'Orbitron', monospace;
  font-size: 0.6rem;
  letter-spacing: 0.2em;
  font-weight: 700;
  color: #ff5a5f;
  /* Solid dark backing so the chip reads cleanly on any image — the old
     translucent rgba was getting eaten by bright food photos. */
  background: rgba(7,16,14,0.85);
  border: 1px solid rgba(255, 90, 95,0.5);
  border-radius: 3px;
  padding: 5px 10px;
  text-transform: uppercase;
  text-shadow: 0 0 6px rgba(255, 90, 95,0.6);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.45);
}
.crystal-fav {
  position: absolute;
  top: 12px; right: 38px;
  z-index: 4;
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.2s, border-color 0.2s;
}
.crystal-fav:hover {
  border-color: rgba(255, 90, 95,0.5);
  transform: scale(1.1);
}
.crystal-veg-dot {
  position: absolute;
  bottom: 14px; left: 14px;
  z-index: 4;
  width: 14px; height: 14px;
  border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.6);
}
.crystal-veg-dot::before {
  content: '';
  display: block;
  width: 8px; height: 8px;
  border-radius: 50%;
}
.crystal-veg-dot.veg::before     { background: #ff5a5f; box-shadow: 0 0 6px #ff5a5f; }
.crystal-veg-dot.nonveg::before  { background: #ff3366; box-shadow: 0 0 6px #ff3366; }

.crystal-reticle {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 60px; height: 60px;
  opacity: 0;
  transition: opacity 0.3s;
  pointer-events: none;
  z-index: 3;
}
.crystal.hover .crystal-reticle {
  opacity: 1;
  animation: reticle-spin 8s linear infinite, reticle-pulse 2s ease-in-out infinite;
}

.crystal-body {
  padding: 14px 18px 18px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.crystal-name {
  font-family: 'Rajdhani', sans-serif;
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: 0.04em;
  color: #fff;
  line-height: 1.15;
  text-shadow: 0 1px 8px rgba(0,0,0,0.4);
}
.crystal-desc {
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.78rem;
  color: rgba(255,255,255,0.42);
  line-height: 1.45;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.crystal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  gap: 10px;
}
.crystal-price {
  font-family: 'Orbitron', monospace;
  font-size: 1.35rem;
  font-weight: 900;
  color: #ffed4e;
  text-shadow: 0 0 14px rgba(255,237,78,0.45);
  letter-spacing: 0.02em;
  animation: price-float 4s ease-in-out infinite;
  white-space: nowrap;
}
.crystal-prep {
  font-family: 'Orbitron', monospace;
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  color: rgba(255,255,255,0.4);
  text-transform: uppercase;
  white-space: nowrap;
}

.crystal-cta {
  margin-top: 12px;
  padding: 11px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  font-weight: 800;
  text-transform: uppercase;
  background: linear-gradient(90deg, rgba(255, 90, 95,0.06), rgba(255, 90, 95,0.15), rgba(255, 90, 95,0.06));
  background-size: 200% 100%;
  color: #ff5a5f;
  border: 1px solid rgba(255, 90, 95,0.45);
  transition: background-position 0.6s, box-shadow 0.25s, transform 0.15s;
  text-shadow: 0 0 8px rgba(255, 90, 95,0.6);
}
.crystal-cta:hover {
  background-position: 100% 0;
  box-shadow: 0 0 20px rgba(255, 90, 95,0.4), inset 0 0 12px rgba(255, 90, 95,0.18);
}
.crystal-cta:active { transform: translateY(1px); }
.crystal-cta:disabled {
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.3);
  border-color: rgba(255,255,255,0.1);
  cursor: not-allowed;
  text-shadow: none;
}

.crystal-stepper {
  display: grid;
  grid-template-columns: 1fr 50px 1fr;
  align-items: stretch;
  margin-top: 12px;
  border: 1px solid rgba(255, 90, 95,0.4);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 90, 95,0.06);
}
.crystal-step-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #ff5a5f;
  font-family: 'Orbitron', monospace;
  font-size: 1.2rem;
  font-weight: 800;
  padding: 10px 0;
  transition: background 0.15s;
}
.crystal-step-btn:hover         { background: rgba(255, 90, 95,0.16); }
.crystal-step-btn.dec:hover     { background: rgba(255,51,102,0.15); color: #ff3366; }
.crystal-step-btn:disabled      { opacity: 0.4; cursor: not-allowed; }
.crystal-step-count {
  align-self: center;
  text-align: center;
  color: #fff;
  font-family: 'Orbitron', monospace;
  font-weight: 800;
  font-size: 1rem;
}
.crystal-stock-warn {
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.7rem;
  color: #ff9f43;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 4px;
}
.crystal-out {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.7);
  z-index: 5;
  font-family: 'Orbitron', monospace;
  color: #ff3366;
  letter-spacing: 0.3em;
  font-weight: 800;
  font-size: 0.85rem;
  text-shadow: 0 0 12px rgba(255,51,102,0.7);
}
`;

const Reticle: React.FC = () => (
  <svg viewBox="0 0 60 60" className="crystal-reticle">
    <circle cx="30" cy="30" r="22" stroke="#ff5a5f" strokeWidth="1" fill="none" opacity="0.5" />
    <circle cx="30" cy="30" r="14" stroke="#ff5a5f" strokeWidth="1.5" fill="none" />
    <line x1="30" y1="2"  x2="30" y2="12" stroke="#ff5a5f" strokeWidth="1.5" />
    <line x1="30" y1="48" x2="30" y2="58" stroke="#ff5a5f" strokeWidth="1.5" />
    <line x1="2"  y1="30" x2="12" y2="30" stroke="#ff5a5f" strokeWidth="1.5" />
    <line x1="48" y1="30" x2="58" y2="30" stroke="#ff5a5f" strokeWidth="1.5" />
    <circle cx="30" cy="30" r="2" fill="#ff5a5f" />
  </svg>
);

export const DataCrystal: React.FC<DataCrystalProps> = ({
  item,
  isFavorite,
  onAddToCart,
  onDecrement,
  onToggleFavorite,
  cartQuantity,
}) => {
  const [hovered, setHovered] = useState(false);
  const tiltRef = useTilt<HTMLDivElement>(10, 1.02);

  const stock = item.stock_quantity;
  const outOfStock = stock !== null && stock !== undefined && stock !== -1 && stock === 0;
  const isAvailable = item.is_available && !outOfStock;
  const atStockLimit = stock !== null && stock !== undefined && stock !== -1 && cartQuantity >= stock;
  const lowStock = stock !== null && stock !== undefined && stock !== -1 && stock > 0 && stock <= 5;

  return (
    <>
      <style>{css}</style>
      <div
        ref={tiltRef}
        className={`crystal ${hovered ? 'hover' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Image area */}
        <div className="crystal-img">
          {item.category && (
            <div className="crystal-cat">{item.category}</div>
          )}
          <button
            className="crystal-fav"
            onClick={() => onToggleFavorite(item.id)}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label="Toggle favorite"
          >
            {isFavorite ? '❤' : '♡'}
          </button>
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '3rem', opacity: 0.6,
            }}>🍽️</div>
          )}
          <div className={`crystal-veg-dot ${item.is_vegetarian ? 'veg' : 'nonveg'}`} />
          <Reticle />
          {outOfStock && <div className="crystal-out">OUT OF STOCK</div>}
        </div>

        {/* Body */}
        <div className="crystal-body">
          <div className="crystal-name">{item.name}</div>
          {item.description && <p className="crystal-desc">{item.description}</p>}
          <div className="crystal-foot">
            <div className="crystal-price">₹{item.price}</div>
            <div className="crystal-prep">⏱ {item.preparation_time ?? 10}m</div>
          </div>
          {lowStock && (
            <div className="crystal-stock-warn">⚠ Only {stock} left</div>
          )}

          {/* CTA — either Add or stepper */}
          {cartQuantity > 0 && isAvailable ? (
            <div className="crystal-stepper">
              <button
                className="crystal-step-btn dec"
                onClick={() => onDecrement(item.id)}
                aria-label="Decrease"
              >−</button>
              <div className="crystal-step-count">{cartQuantity}</div>
              <button
                className="crystal-step-btn"
                onClick={() => !atStockLimit && onAddToCart(item)}
                disabled={atStockLimit}
                aria-label="Increase"
                title={atStockLimit ? `Max ${stock}` : undefined}
              >+</button>
            </div>
          ) : (
            <button
              className="crystal-cta"
              onClick={() => isAvailable && onAddToCart(item)}
              disabled={!isAvailable}
            >
              {outOfStock ? '◯ unavailable' : isAvailable ? '⊕ Acquire' : '◯ Offline'}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default DataCrystal;
