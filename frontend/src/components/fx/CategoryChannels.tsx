import React from 'react';

/**
 * CategoryChannels — redesigned (Warm-Glass): a clean rounded search bar plus
 * soft pill category chips, replacing the old HUD "channels". Same props.
 */
interface Channel {
  id: string;
  label: string;
  glyph: string;
  count?: number;
}

interface CategoryChannelsProps {
  channels: Channel[];
  active: string;
  onChange: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

const css = `
.wg-cat { margin: 8px 0 24px; display: flex; flex-direction: column; gap: 14px; }
.wg-search { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 16px;
  background: rgba(255,255,255,0.05); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
  border: 1px solid rgba(255,200,180,0.14); box-shadow: 0 8px 24px rgba(0,0,0,0.25); }
.wg-search span { font-size: 17px; opacity: .7; }
.wg-search input { flex: 1; background: transparent; border: none; outline: none; color: #fff7f2;
  font-family: 'Inter', sans-serif; font-size: 15px; }
.wg-search input::placeholder { color: rgba(255,242,235,0.4); }
.wg-chips { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.wg-chips::-webkit-scrollbar { display: none; }
.wg-chip { flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 30px;
  cursor: pointer; font-family: 'Sora', sans-serif; font-weight: 600; font-size: 13.5px; white-space: nowrap;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,200,180,0.12); color: rgba(255,242,235,0.72);
  transition: all .2s; }
.wg-chip:hover { border-color: rgba(255,90,95,0.4); color: #fff7f2; }
.wg-chip.on { background: linear-gradient(135deg,#ff5a5f,#ff9e3d); border-color: transparent; color: #fff;
  box-shadow: 0 6px 16px rgba(255,90,95,0.38); }
.wg-chip .ct { font-size: 11px; opacity: .85; }
`;

export const CategoryChannels: React.FC<CategoryChannelsProps> = ({
  channels, active, onChange, search, onSearchChange,
}) => (
  <>
    <style>{css}</style>
    <div className="wg-cat">
      <div className="wg-search">
        <span>🔍</span>
        <input
          type="text"
          placeholder="Search dishes…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="wg-chips" role="tablist" aria-label="Categories">
        {channels.map((ch) => (
          <button
            key={ch.id}
            className={`wg-chip ${active === ch.id ? 'on' : ''}`}
            onClick={() => onChange(ch.id)}
            role="tab"
            aria-selected={active === ch.id}
            data-clickable
          >
            <span>{ch.glyph}</span>
            <span>{ch.label}</span>
            {ch.count != null && <span className="ct">{ch.count}</span>}
          </button>
        ))}
      </div>
    </div>
  </>
);

export default CategoryChannels;
