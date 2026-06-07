import React from 'react';

/**
 * CategoryChannels — radio-station-style horizontal selector.
 *
 * Replaces the old pill row. Each channel is a glowing icon-chip with:
 *   - A glyph (emoji or unicode) on the left
 *   - Channel name underneath
 *   - An animated horizontal scan-line that lights up only on the active one
 *   - A subtle count badge on the right when items are present
 *
 * Active state slides under the selected channel via a positioned indicator
 * bar so transitions feel continuous rather than discrete (cf. iOS segmented
 * controls).
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
@keyframes channel-scan {
  0%, 100% { transform: translateX(-100%); }
  50%      { transform: translateX(100%); }
}
@keyframes search-glow {
  0%, 100% { box-shadow: 0 0 0 1px rgba(0,255,136,0.18), 0 0 0 0 rgba(0,255,136,0); }
  50%      { box-shadow: 0 0 0 1px rgba(0,255,136,0.4),  0 0 18px 0 rgba(0,255,136,0.18); }
}

.channels-frame {
  position: relative;
  margin: 20px 0 26px;
}
.channels-search {
  position: relative;
  margin-bottom: 16px;
}
.channels-search input {
  width: 100%;
  padding: 14px 18px 14px 50px;
  border-radius: 12px;
  background: rgba(7,16,14,0.6);
  border: 1px solid rgba(0,255,136,0.18);
  color: #fff;
  font-family: 'Rajdhani', sans-serif;
  font-size: 1rem;
  letter-spacing: 0.04em;
  outline: none;
  transition: border-color 0.2s;
  animation: search-glow 4s ease-in-out infinite;
}
.channels-search input::placeholder {
  color: rgba(255,255,255,0.35);
  letter-spacing: 0.1em;
}
.channels-search input:focus {
  border-color: #00ff88;
  animation: none;
  box-shadow: 0 0 0 1px #00ff88, 0 0 22px rgba(0,255,136,0.3);
}
.channels-search-glyph {
  position: absolute;
  top: 50%; left: 18px;
  transform: translateY(-50%);
  color: #00ff88;
  font-family: 'Orbitron', monospace;
  font-size: 1rem;
  pointer-events: none;
  text-shadow: 0 0 8px #00ff88;
}

.channels-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 0 8px;
}
.channels-row::-webkit-scrollbar { display: none; }

.channel {
  position: relative;
  flex-shrink: 0;
  padding: 12px 18px 14px;
  min-width: 110px;
  background: rgba(7,16,14,0.55);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  font-family: 'Rajdhani', sans-serif;
  color: rgba(255,255,255,0.65);
  transition: border-color 0.2s, color 0.2s, background 0.2s, transform 0.2s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.channel:hover {
  border-color: rgba(0,255,136,0.4);
  color: #fff;
}
.channel.active {
  border-color: #00ff88;
  background:
    linear-gradient(180deg, rgba(0,255,136,0.16) 0%, rgba(0,255,136,0.04) 100%);
  color: #00ff88;
  box-shadow: 0 0 18px rgba(0,255,136,0.25);
}
.channel.active::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00ff88, transparent);
  animation: channel-scan 2.2s linear infinite;
}
.channel-glyph {
  font-size: 1.2rem;
  line-height: 1;
}
.channel-label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.channel-count {
  position: absolute;
  top: 6px; right: 8px;
  font-family: 'Orbitron', monospace;
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  color: #ffed4e;
  opacity: 0.85;
}
`;

export const CategoryChannels: React.FC<CategoryChannelsProps> = ({
  channels, active, onChange, search, onSearchChange,
}) => {
  return (
    <>
      <style>{css}</style>
      <div className="channels-frame">
        {/* Search bar with HUD glyph */}
        <div className="channels-search">
          <span className="channels-search-glyph">⌕</span>
          <input
            type="text"
            placeholder="Query the menu…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Channel row */}
        <div className="channels-row" role="tablist" aria-label="Categories">
          {channels.map(ch => (
            <button
              key={ch.id}
              className={`channel ${active === ch.id ? 'active' : ''}`}
              onClick={() => onChange(ch.id)}
              role="tab"
              aria-selected={active === ch.id}
              data-clickable
            >
              <span className="channel-glyph">{ch.glyph}</span>
              <span className="channel-label">{ch.label}</span>
              {ch.count !== undefined && ch.count > 0 && (
                <span className="channel-count">{String(ch.count).padStart(2, '0')}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

export default CategoryChannels;
