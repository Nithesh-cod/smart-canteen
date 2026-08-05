import React, { useState } from 'react';
import type { MenuItem as MenuItemType } from '../../types';

/**
 * DataCrystal — the kiosk menu card. Redesigned (Warm-Glass) from the old
 * notched HUD "crystal" into a clean, modern food-app card: photo on top,
 * soft rounded frosted-glass body, veg dot, rating, bold coral price, and an
 * ADD button that becomes a quantity stepper. Same props as before.
 */
interface DataCrystalProps {
  item: MenuItemType;
  isFavorite: boolean;
  onAddToCart: (item: MenuItemType) => void;
  onDecrement: (itemId: number) => void;
  onToggleFavorite: (itemId: number) => void;
  cartQuantity: number;
}

const CATEGORY_EMOJI: Record<string, string> = {
  starters: '🍢', mains: '🍛', desserts: '🍰', beverages: '🥤', snacks: '🍟',
};
const emojiFor = (cat?: string) => CATEGORY_EMOJI[(cat || '').toLowerCase()] || '🍽️';

const css = `
@keyframes wg-card-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.wg-card {
  position: relative; display: flex; flex-direction: column;
  background: rgba(255,255,255,0.05);
  -webkit-backdrop-filter: blur(20px) saturate(140%); backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid rgba(255,200,180,0.14);
  border-radius: 22px; overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.32);
  transition: transform .28s cubic-bezier(.34,1.4,.5,1), box-shadow .28s, border-color .28s;
  animation: wg-card-in .4s ease both;
}
.wg-card:hover { transform: translateY(-6px); border-color: rgba(255,90,95,0.4); box-shadow: 0 18px 44px rgba(255,90,95,0.18); }
.wg-photo { position: relative; height: 140px; background-size: cover; background-position: center;
  display: grid; place-items: center; }
.wg-photo .fb { font-size: 54px; filter: drop-shadow(0 6px 14px rgba(0,0,0,.4)); }
.wg-photo::after { content:''; position:absolute; inset:0; background: linear-gradient(180deg, transparent 40%, rgba(20,10,9,0.55) 100%); }
.wg-fav { position:absolute; top:10px; right:10px; z-index:2; width:34px; height:34px; border:none;
  border-radius:50%; background: rgba(20,10,9,0.45); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  cursor:pointer; font-size:16px; display:grid; place-items:center; transition: transform .2s; }
.wg-fav:hover { transform: scale(1.15); }
.wg-veg { position:absolute; top:10px; left:10px; z-index:2; width:18px; height:18px; border-radius:5px;
  background: rgba(20,10,9,0.5); border:1.5px solid; display:grid; place-items:center; }
.wg-veg i { width:8px; height:8px; border-radius:50%; display:block; }
.wg-body { padding: 13px 15px 15px; display:flex; flex-direction:column; gap:7px; flex:1; }
.wg-name { font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#fff7f2; line-height:1.2; }
.wg-meta { display:flex; align-items:center; gap:10px; font-size:12px; color:rgba(255,242,235,0.6); font-family:'Inter',sans-serif; }
.wg-row { display:flex; align-items:center; justify-content:space-between; margin-top:auto; padding-top:4px; }
.wg-price { font-family:'Sora',sans-serif; font-weight:800; font-size:18px; color:#ff7a5c; }
.wg-add { border:none; cursor:pointer; font-family:'Sora',sans-serif; font-weight:700; font-size:13px; color:#fff;
  padding:9px 18px; border-radius:12px; background: linear-gradient(135deg,#ff5a5f,#ff9e3d);
  box-shadow: 0 6px 16px rgba(255,90,95,0.4); transition: transform .15s, box-shadow .2s; letter-spacing:.3px; }
.wg-add:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(255,90,95,0.5); }
.wg-step { display:flex; align-items:center; gap:2px; border-radius:12px; overflow:hidden;
  border:1px solid rgba(255,90,95,0.5); background: rgba(255,90,95,0.12); }
.wg-step button { border:none; background:transparent; color:#ff7a5c; font-size:17px; font-weight:800; width:34px; height:34px; cursor:pointer; }
.wg-step span { min-width:26px; text-align:center; font-family:'Sora',sans-serif; font-weight:700; color:#fff7f2; font-size:14px; }
.wg-sold { position:absolute; inset:0; z-index:3; display:grid; place-items:center; background:rgba(16,7,6,0.66);
  -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px); }
.wg-sold span { font-family:'Sora',sans-serif; font-weight:800; color:#ffb4a0; letter-spacing:1px; font-size:13px;
  border:1px solid rgba(255,180,160,0.5); padding:6px 14px; border-radius:20px; }
`;

const DataCrystal: React.FC<DataCrystalProps> = ({ item, isFavorite, onAddToCart, onDecrement, onToggleFavorite, cartQuantity }) => {
  const [imgOk, setImgOk] = useState(true);
  const soldOut = item.is_available === false || item.stock_quantity === 0;
  const veg = item.is_vegetarian !== false;
  const vegColor = veg ? '#4caf50' : '#e2483d';

  return (
    <>
      <style>{css}</style>
      <div className="wg-card">
        {/* Photo */}
        <div
          className="wg-photo"
          style={item.image_url && imgOk ? { backgroundImage: `url(${item.image_url})` } : { background: 'linear-gradient(135deg, rgba(255,90,95,0.22), rgba(255,158,61,0.22))' }}
        >
          {item.image_url && imgOk && (
            <img src={item.image_url} alt="" onError={() => setImgOk(false)} style={{ display: 'none' }} />
          )}
          {(!item.image_url || !imgOk) && <span className="fb">{emojiFor(item.category)}</span>}

          <span className="wg-veg" style={{ borderColor: vegColor }}><i style={{ background: vegColor }} /></span>
          <button className="wg-fav" onClick={() => onToggleFavorite(item.id)} aria-label="Favorite">
            {isFavorite ? '❤️' : '🤍'}
          </button>

          {soldOut && <div className="wg-sold"><span>SOLD OUT</span></div>}
        </div>

        {/* Body */}
        <div className="wg-body">
          <div className="wg-name">{item.name}</div>
          <div className="wg-meta">
            {item.rating != null && <span>★ {Number(item.rating).toFixed(1)}</span>}
            {item.preparation_time != null && <span>· {item.preparation_time} min</span>}
          </div>
          <div className="wg-row">
            <span className="wg-price">₹{Number(item.price).toFixed(0)}</span>
            {soldOut ? (
              <span style={{ color: 'rgba(255,242,235,0.4)', fontSize: 13, fontFamily: 'Inter,sans-serif' }}>Unavailable</span>
            ) : cartQuantity > 0 ? (
              <div className="wg-step">
                <button onClick={() => onDecrement(item.id)}>−</button>
                <span>{cartQuantity}</span>
                <button onClick={() => onAddToCart(item)}>+</button>
              </div>
            ) : (
              <button className="wg-add" onClick={() => onAddToCart(item)}>ADD +</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DataCrystal;
