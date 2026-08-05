import React from 'react';

/**
 * CinematicHero — redesigned (Warm-Glass) from the old kinetic sci-fi intro
 * into a clean, warm food-app header: a friendly wordmark, an appetizing
 * tagline, and a subtle cart hint. Same export + props.
 */
interface CinematicHeroProps {
  itemsInOrbit: number;
}

const css = `
@keyframes wg-hero-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.wg-hero { text-align: center; padding: 30px 20px 14px; animation: wg-hero-in .5s ease both; }
.wg-hero .kicker { font-family:'Inter',sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 3px;
  text-transform: uppercase; color: rgba(255,180,150,0.8); margin-bottom: 8px; }
.wg-hero h1 { font-family:'Sora',sans-serif; font-weight: 800; font-size: clamp(30px, 6vw, 52px); line-height: 1.05;
  margin: 0; background: linear-gradient(120deg, #ff5a5f 0%, #ff9e3d 100%); -webkit-background-clip: text;
  background-clip: text; color: transparent; letter-spacing: -0.5px; }
.wg-hero p { font-family:'Inter',sans-serif; font-size: clamp(14px, 2.4vw, 17px); color: rgba(255,242,235,0.7);
  margin: 10px 0 0; }
.wg-hero .cart-hint { display: inline-flex; align-items: center; gap: 7px; margin-top: 14px; padding: 7px 16px;
  border-radius: 30px; background: rgba(255,90,95,0.12); border: 1px solid rgba(255,90,95,0.35);
  color: #ff9e3d; font-family:'Sora',sans-serif; font-weight: 700; font-size: 13px; }
`;

export const CinematicHero: React.FC<CinematicHeroProps> = ({ itemsInOrbit }) => (
  <>
    <style>{css}</style>
    <header className="wg-hero">
      <div className="kicker">🍽️ Campus Canteen</div>
      <h1>Order fresh.<br />Skip the queue.</h1>
      <p>Freshly made, ready in minutes — tap a dish to begin.</p>
      {itemsInOrbit > 0 && (
        <div className="cart-hint">🛒 {itemsInOrbit} item{itemsInOrbit > 1 ? 's' : ''} in your cart</div>
      )}
    </header>
  </>
);

export default CinematicHero;
