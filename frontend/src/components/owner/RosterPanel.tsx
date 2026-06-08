import React, { useMemo, useState } from 'react';
import type { Student } from '../../types';

/**
 * RosterPanel — student admin view rendered as a crystal card grid.
 *
 * Each student is a small crystal card showing:
 *   - Tier badge (Bronze/Silver/Gold/Platinum) with tier-specific colour
 *   - Name + roll number
 *   - Avatar disc with first initial
 *   - Stat grid: points · orders · total spent
 *   - Active-status pill
 *
 * Tier filter chips + search across name, roll, and phone. Cards are sorted
 * by total_spent descending by default so the top customers surface first
 * — a real admin affordance, not just a list.
 */

interface RosterPanelProps {
  students: Student[];
  onRefresh: () => void;
}

const TIER_TONES: Record<string, { color: string; bg: string; border: string }> = {
  Bronze:   { color: '#cd7f32', bg: 'rgba(205,127,50,0.10)',  border: 'rgba(205,127,50,0.45)' },
  Silver:   { color: '#c0c0c0', bg: 'rgba(192,192,192,0.10)', border: 'rgba(192,192,192,0.45)' },
  Gold:     { color: '#ffd700', bg: 'rgba(255,215,0,0.10)',   border: 'rgba(255,215,0,0.45)' },
  Platinum: { color: '#e5e4e2', bg: 'rgba(229,228,226,0.10)', border: 'rgba(229,228,226,0.55)' },
};

const TIERS = ['all', 'Bronze', 'Silver', 'Gold', 'Platinum'] as const;

export const RosterPanel: React.FC<RosterPanelProps> = ({ students, onRefresh }) => {
  const safe = Array.isArray(students) ? students : [];
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<typeof TIERS[number]>('all');
  const [refreshing, setRefreshing] = useState(false);

  const tierCounts = useMemo(() => {
    const c: Record<string, number> = { all: safe.length };
    for (const s of safe) c[s.tier] = (c[s.tier] ?? 0) + 1;
    return c;
  }, [safe]);

  const filtered = useMemo(() => {
    let arr = tier === 'all' ? safe : safe.filter(s => s.tier === tier);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.roll_number.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
      );
    }
    return [...arr].sort((a, b) => (Number(b.total_spent) || 0) - (Number(a.total_spent) || 0));
  }, [safe, search, tier]);

  const totals = useMemo(() => {
    let totalSpent = 0;
    let totalOrders = 0;
    let totalPoints = 0;
    for (const s of safe) {
      totalSpent  += Number(s.total_spent) || 0;
      totalOrders += Number(s.total_orders) || 0;
      totalPoints += Number(s.points) || 0;
    }
    return { totalSpent, totalOrders, totalPoints };
  }, [safe]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  return (
    <div className="roster-wrap">
      <style>{css}</style>

      <div className="roster-head">
        <div className="roster-title-row">
          <span className="roster-glyph">◯</span>
          <span className="roster-title">Roster · {safe.length} accounts</span>
          <span className="roster-totals">
            ₹{Math.round(totals.totalSpent).toLocaleString('en-IN')} lifetime ·
            {' '}{totals.totalOrders.toLocaleString('en-IN')} orders ·
            {' '}{totals.totalPoints.toLocaleString('en-IN')} pts in circulation
          </span>
        </div>
        <div className="roster-actions">
          <div className="roster-search">
            <span className="roster-search-glyph">⌕</span>
            <input
              type="text"
              placeholder="Filter by name, roll, or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="roster-refresh" onClick={handleRefresh} disabled={refreshing} data-clickable>
            {refreshing ? '◌ Refreshing' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="roster-tier-row">
        {TIERS.map((t) => (
          <button
            key={t}
            className={`tier-chip ${tier === t ? 'active' : ''}`}
            onClick={() => setTier(t)}
            data-clickable
            style={tier === t && t !== 'all'
              ? { color: TIER_TONES[t].color, borderColor: TIER_TONES[t].border, background: TIER_TONES[t].bg }
              : undefined
            }
          >
            {t === 'all' ? 'All' : t}
            <span className="tier-chip-count">{String(tierCounts[t] ?? 0).padStart(2, '0')}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="roster-empty">
          <div className="roster-empty-glyph">◯</div>
          <div className="roster-empty-title">
            {safe.length === 0 ? 'Roster is empty' : 'No accounts match this slice'}
          </div>
          <div className="roster-empty-sub">
            {safe.length === 0 ? 'First customer to sign up will appear here' : 'Try a broader filter'}
          </div>
        </div>
      ) : (
        <div className="roster-grid">
          {filtered.map((s) => {
            const tone = TIER_TONES[s.tier] ?? TIER_TONES.Bronze;
            const initial = (s.name || '?').trim().charAt(0).toUpperCase();
            return (
              <article key={s.id} className="roster-card" data-clickable>
                <div className="roster-card-head">
                  <div className="roster-avatar" style={{ color: tone.color, borderColor: tone.border, background: tone.bg }}>
                    {initial}
                  </div>
                  <div className="roster-card-id">
                    <div className="roster-name">{s.name || '—'}</div>
                    <div className="roster-roll">{s.roll_number}</div>
                  </div>
                  <div
                    className="roster-tier"
                    style={{ color: tone.color, borderColor: tone.border, background: tone.bg }}
                  >
                    ✦ {s.tier}
                  </div>
                </div>

                <div className="roster-card-stats">
                  <Stat label="Spent"  value={`₹${Math.round(Number(s.total_spent) || 0).toLocaleString('en-IN')}`} tone="#ffed4e" />
                  <Stat label="Orders" value={String(Number(s.total_orders) || 0)}                                  tone="#00ff88" />
                  <Stat label="Points" value={String(Number(s.points) || 0)}                                       tone="#00d166" />
                </div>

                <div className="roster-card-foot">
                  <span className="roster-phone">📡 {s.phone || '—'}</span>
                  <span className={`roster-status ${s.is_active ? 'active' : 'inactive'}`}>
                    {s.is_active ? '● Active' : '○ Inactive'}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="roster-stat">
      <div className="roster-stat-label">{label}</div>
      <div className="roster-stat-value" style={{ color: tone, textShadow: `0 0 10px ${tone}66` }}>{value}</div>
    </div>
  );
}

const css = `
.roster-wrap { position: relative; }

.roster-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 14px; flex-wrap: wrap; margin-bottom: 18px;
}
.roster-title-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.roster-glyph {
  font-family: 'Orbitron', monospace; font-size: 1.15rem;
  color: #00ff88; text-shadow: 0 0 10px #00ff88;
}
.roster-title {
  font-family: 'Orbitron', sans-serif; font-size: 0.78rem;
  letter-spacing: 0.32em; text-transform: uppercase;
  color: rgba(255,255,255,0.6);
}
.roster-totals {
  font-family: 'Orbitron', monospace; font-size: 0.7rem;
  color: rgba(255,255,255,0.4); letter-spacing: 0.08em;
}
.roster-actions { display: flex; align-items: center; gap: 10px; }
.roster-search { position: relative; }
.roster-search input {
  padding: 9px 14px 9px 32px; font-family: 'Rajdhani', sans-serif; font-size: 0.9rem;
  color: #fff; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; outline: none; width: 280px; transition: border-color 0.2s, box-shadow 0.2s;
}
.roster-search input:focus { border-color: rgba(0,255,136,0.5); box-shadow: 0 0 14px rgba(0,255,136,0.18); }
.roster-search-glyph {
  position: absolute; top: 50%; left: 12px; transform: translateY(-50%);
  color: #00ff88; font-family: 'Orbitron', monospace; pointer-events: none;
}
.roster-refresh {
  padding: 9px 16px; font-family: 'Orbitron', sans-serif; font-size: 0.7rem;
  letter-spacing: 0.18em; text-transform: uppercase; color: #00ff88;
  background: rgba(0,255,136,0.07); border: 1px solid rgba(0,255,136,0.4);
  border-radius: 8px; cursor: pointer;
}
.roster-refresh:hover { background: rgba(0,255,136,0.15); }
.roster-refresh:disabled { opacity: 0.6; cursor: progress; }

.roster-tier-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.tier-chip {
  padding: 7px 14px; font-family: 'Orbitron', sans-serif; font-size: 0.66rem;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 100px; cursor: pointer;
  transition: all 0.18s; display: flex; align-items: center; gap: 8px;
}
.tier-chip:hover { color: #fff; border-color: rgba(0,255,136,0.4); }
.tier-chip.active:not([style]) {
  color: #00ff88;
  background: rgba(0,255,136,0.1);
  border-color: rgba(0,255,136,0.5);
  box-shadow: 0 0 14px rgba(0,255,136,0.18);
}
.tier-chip-count {
  font-size: 0.6rem; color: rgba(255,237,78,0.85);
  background: rgba(0,0,0,0.25); border-radius: 100px; padding: 1px 6px;
}

.roster-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.roster-card {
  position: relative; padding: 18px 20px 18px;
  background:
    linear-gradient(180deg, rgba(0,255,136,0.04) 0%, transparent 35%),
    linear-gradient(180deg, #0a1816 0%, #07100e 100%);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 14px;
  clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%);
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.roster-card::before {
  content: ''; position: absolute; top: 0; left: 6%; right: 24%; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0,255,136,0.5), transparent);
}
.roster-card:hover {
  border-color: rgba(0,255,136,0.35);
  transform: translateY(-2px);
  box-shadow: 0 14px 32px rgba(0,255,136,0.12);
}

.roster-card-head {
  display: grid; grid-template-columns: 44px 1fr auto;
  align-items: center; gap: 12px;
}
.roster-avatar {
  width: 44px; height: 44px; border-radius: 50%;
  border: 1.5px solid; display: flex; align-items: center; justify-content: center;
  font-family: 'Orbitron', sans-serif; font-weight: 800; font-size: 1.1rem;
}
.roster-card-id { min-width: 0; }
.roster-name {
  font-family: 'Rajdhani', sans-serif; font-weight: 700;
  font-size: 1.02rem; color: #fff; line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.roster-roll {
  font-family: 'Orbitron', monospace; font-size: 0.72rem;
  color: rgba(255,255,255,0.45); margin-top: 2px;
}
.roster-tier {
  font-family: 'Orbitron', monospace; font-size: 0.6rem;
  letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700;
  padding: 4px 9px; border-radius: 100px; border: 1px solid;
}

.roster-card-stats {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 10px; margin: 14px 0 14px;
  padding: 12px 14px; background: rgba(0,0,0,0.25);
  border: 1px solid rgba(255,255,255,0.04); border-radius: 10px;
}
.roster-stat { display: flex; flex-direction: column; gap: 4px; }
.roster-stat-label {
  font-family: 'Orbitron', monospace; font-size: 0.6rem;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.4);
}
.roster-stat-value {
  font-family: 'Orbitron', monospace; font-size: 0.95rem; font-weight: 800;
}

.roster-card-foot {
  display: flex; align-items: center; justify-content: space-between;
  font-family: 'Rajdhani', sans-serif; font-size: 0.78rem;
  color: rgba(255,255,255,0.45);
}
.roster-phone { letter-spacing: 0.04em; }
.roster-status {
  font-family: 'Orbitron', monospace; font-size: 0.62rem;
  letter-spacing: 0.15em; text-transform: uppercase;
}
.roster-status.active   { color: #00ff88; }
.roster-status.inactive { color: rgba(255,159,67,0.85); }

.roster-empty {
  padding: 60px 20px; text-align: center; color: rgba(255,255,255,0.4);
}
.roster-empty-glyph {
  font-family: 'Orbitron', monospace; font-size: 3rem;
  color: rgba(0,255,136,0.4); text-shadow: 0 0 14px rgba(0,255,136,0.35);
  margin-bottom: 14px;
}
.roster-empty-title {
  font-family: 'Orbitron', sans-serif; font-size: 0.85rem;
  letter-spacing: 0.32em; text-transform: uppercase;
  color: rgba(0,255,136,0.7); margin-bottom: 6px;
}
.roster-empty-sub {
  font-family: 'Rajdhani', sans-serif; font-size: 0.85rem;
  color: rgba(255,255,255,0.4); letter-spacing: 0.06em;
}
`;

export default RosterPanel;
