import React, { useState, useMemo } from 'react';
import type { MenuItem } from '../../types';
import api from '../../services/api';
import { useToast } from '../common/Toast';

/**
 * CatalogPanel — replaces the inline MenuManagement block with a real
 * crystal-grid menu admin.
 *
 * Layout:
 *   - HUD header: ⬡ glyph + "Catalog" title + live item count
 *   - Search field + "+ New entry" CTA
 *   - 3-column responsive grid of crystal cards, one per menu item
 *
 * Each card shows the item image (or a ⬡ placeholder), name, category chip,
 * price in yellow Orbitron, stock readout, and three actions:
 *   - Online / Offline toggle (live status pill)
 *   - ✎ edit  — opens the same panel form prefilled
 *   - ⊖ delete — confirms then deletes
 *
 * The add/edit form is a slide-in panel on the right (not a centred modal)
 * so the user can keep the grid visible while editing — a real workflow
 * affordance, not a faux-glass dialog.
 */

interface CatalogPanelProps {
  items: MenuItem[];
  onRefresh: () => void;
}

interface FormData {
  name: string;
  category: string;
  price: string;
  description: string;
  is_vegetarian: boolean;
  preparation_time: string;
  stock_quantity: string;
  image_url: string;
}

const defaultForm = (): FormData => ({
  name: '',
  category: 'mains',
  price: '',
  description: '',
  is_vegetarian: true,
  preparation_time: '10',
  stock_quantity: '-1',
  image_url: '',
});

export const CatalogPanel: React.FC<CatalogPanelProps> = ({ items, onRefresh }) => {
  const safe = Array.isArray(items) ? items : [];
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return safe;
    const q = search.trim().toLowerCase();
    return safe.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
    );
  }, [safe, search]);

  const counts = useMemo(() => {
    let online = 0;
    let offline = 0;
    for (const i of safe) (i.is_available ? online++ : offline++);
    return { total: safe.length, online, offline };
  }, [safe]);

  const openNew = () => {
    setEditing(null);
    setForm(defaultForm());
    setOpen(true);
  };
  const openEdit = (it: MenuItem) => {
    setEditing(it);
    setForm({
      name: it.name,
      category: it.category,
      price: String(it.price),
      description: it.description ?? '',
      is_vegetarian: it.is_vegetarian,
      preparation_time: String(it.preparation_time ?? 10),
      stock_quantity: String(it.stock_quantity ?? -1),
      image_url: it.image_url ?? '',
    });
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditing(null);
    setForm(defaultForm());
  };

  const save = async () => {
    if (!form.name.trim() || !form.price) {
      showToast('Name and price are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const stockVal = parseInt(form.stock_quantity);
      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || 'other',
        price: parseFloat(form.price),
        description: form.description.trim(),
        is_vegetarian: form.is_vegetarian,
        preparation_time: parseInt(form.preparation_time) || 10,
        stock_quantity: isNaN(stockVal) ? -1 : stockVal,
        image_url: form.image_url.trim() || undefined,
      };
      if (editing) {
        await api.put(`/menu/${editing.id}`, payload);
        showToast('Item updated', 'success');
      } else {
        await api.post('/menu', payload);
        showToast('Item added', 'success');
      }
      close();
      onRefresh();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (it: MenuItem) => {
    setTogglingId(it.id);
    try {
      await api.patch(`/menu/${it.id}/availability`, { is_available: !it.is_available });
      onRefresh();
    } catch {
      showToast('Toggle failed', 'error');
    } finally {
      setTogglingId(null);
    }
  };

  const remove = async (it: MenuItem) => {
    if (!confirm(`Delete "${it.name}"? This cannot be undone.`)) return;
    setDeletingId(it.id);
    try {
      await api.delete(`/menu/${it.id}`);
      showToast('Item deleted', 'success');
      onRefresh();
    } catch {
      showToast('Delete failed', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="catalog-wrap">
      <style>{css}</style>

      <div className="catalog-head">
        <div className="catalog-title-row">
          <span className="catalog-glyph">⬡</span>
          <span className="catalog-title">Catalog · {counts.total} entries</span>
          <span className="catalog-mini-pill green">{counts.online} online</span>
          <span className="catalog-mini-pill grey">{counts.offline} offline</span>
        </div>
        <div className="catalog-actions">
          <div className="catalog-search">
            <span className="catalog-search-glyph">⌕</span>
            <input
              type="text"
              placeholder="Filter by name or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="catalog-new" onClick={openNew} data-clickable>
            ⊕ New entry
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="catalog-empty">
          <div className="catalog-empty-glyph">⬡</div>
          <div className="catalog-empty-title">
            {safe.length === 0 ? 'Catalog is empty' : 'No entries match the filter'}
          </div>
          <div className="catalog-empty-sub">
            {safe.length === 0 ? 'Add the first dish to start serving' : 'Refine the query to find an entry'}
          </div>
        </div>
      ) : (
        <div className="catalog-grid">
          {filtered.map((it) => (
            <article
              key={it.id}
              className={`catalog-card ${!it.is_available ? 'offline' : ''}`}
              data-clickable
            >
              <div className="catalog-img">
                {it.image_url ? (
                  <img src={it.image_url} alt={it.name} />
                ) : (
                  <div className="catalog-img-fallback">⬡</div>
                )}
                <div className="catalog-cat">{it.category}</div>
                <div className={`catalog-veg ${it.is_vegetarian ? 'veg' : 'nonveg'}`} />
                {!it.is_available && <div className="catalog-offline">OFFLINE</div>}
              </div>

              <div className="catalog-body">
                <div className="catalog-name">{it.name}</div>
                <div className="catalog-meta">
                  <div className="catalog-price">₹{it.price}</div>
                  <div className="catalog-prep">⏱ {it.preparation_time ?? 10}m</div>
                </div>
                <div className="catalog-stock">
                  {it.stock_quantity === -1 || it.stock_quantity === null || it.stock_quantity === undefined
                    ? '∞ unlimited stock'
                    : it.stock_quantity === 0
                    ? '◯ out of stock'
                    : `${it.stock_quantity} in stock`}
                </div>

                <div className="catalog-card-actions">
                  <button
                    className={`catalog-toggle ${it.is_available ? 'on' : 'off'}`}
                    onClick={() => toggle(it)}
                    disabled={togglingId === it.id}
                    data-clickable
                  >
                    {togglingId === it.id ? '◌' : it.is_available ? '● Online' : '○ Offline'}
                  </button>
                  <button className="catalog-edit" onClick={() => openEdit(it)} data-clickable>
                    ✎ Edit
                  </button>
                  <button
                    className="catalog-delete"
                    onClick={() => remove(it)}
                    disabled={deletingId === it.id}
                    data-clickable
                  >
                    {deletingId === it.id ? '◌' : '⊖'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Slide-in form panel */}
      {open && (
        <>
          <div className="catalog-form-backdrop" onClick={close} />
          <aside className="catalog-form">
            <header className="catalog-form-head">
              <div className="catalog-form-title">
                {editing ? '✎ Editing entry' : '⊕ New entry'}
              </div>
              <button className="catalog-form-close" onClick={close} data-clickable>✕</button>
            </header>
            <div className="catalog-form-body">
              <Field label="Name">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Paneer Tikka" />
              </Field>
              <div className="catalog-form-row">
                <Field label="Category">
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="mains" />
                </Field>
                <Field label="Price (₹)">
                  <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="120" type="number" />
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="One short line — shown on the kiosk card"
                />
              </Field>
              <Field label="Image URL">
                <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
              </Field>
              <div className="catalog-form-row">
                <Field label="Prep time (min)">
                  <input value={form.preparation_time} onChange={(e) => setForm({ ...form, preparation_time: e.target.value })} type="number" />
                </Field>
                <Field label="Stock (-1 = ∞)">
                  <input value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} type="number" />
                </Field>
              </div>
              <div className="catalog-form-vegrow">
                <label className="catalog-form-veg">
                  <input
                    type="checkbox"
                    checked={form.is_vegetarian}
                    onChange={(e) => setForm({ ...form, is_vegetarian: e.target.checked })}
                  />
                  <span>Vegetarian dish</span>
                </label>
              </div>

              <button
                className="catalog-form-save"
                onClick={save}
                disabled={saving}
                data-clickable
              >
                {saving ? '◌ Saving…' : editing ? '✓ Save changes' : '⊕ Create entry'}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="catalog-field">
      <span className="catalog-field-label">{label}</span>
      {children}
    </div>
  );
}

const css = `
.catalog-wrap { position: relative; }
.catalog-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap; margin-bottom: 22px;
}
.catalog-title-row {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
}
.catalog-glyph {
  font-family: 'Orbitron', monospace; font-size: 1.15rem;
  color: #ff5a5f; text-shadow: 0 0 10px #ff5a5f;
}
.catalog-title {
  font-family: 'Orbitron', sans-serif; font-size: 0.78rem;
  letter-spacing: 0.32em; text-transform: uppercase;
  color: rgba(255,255,255,0.6);
}
.catalog-mini-pill {
  font-family: 'Orbitron', monospace; font-size: 0.62rem;
  letter-spacing: 0.15em; padding: 3px 9px; border-radius: 100px;
  border: 1px solid; text-transform: uppercase;
}
.catalog-mini-pill.green { color: #ff5a5f; border-color: rgba(255, 90, 95,0.4); background: rgba(255, 90, 95,0.06); }
.catalog-mini-pill.grey  { color: rgba(255,255,255,0.5); border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.03); }

.catalog-actions { display: flex; align-items: center; gap: 10px; }
.catalog-search { position: relative; }
.catalog-search input {
  padding: 9px 14px 9px 32px; font-family: 'Rajdhani', sans-serif; font-size: 0.9rem;
  color: #fff; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; outline: none; width: 260px; transition: border-color 0.2s, box-shadow 0.2s;
}
.catalog-search input:focus { border-color: rgba(255, 90, 95,0.5); box-shadow: 0 0 14px rgba(255, 90, 95,0.18); }
.catalog-search-glyph {
  position: absolute; top: 50%; left: 12px; transform: translateY(-50%);
  color: #ff5a5f; font-family: 'Orbitron', monospace; pointer-events: none;
}
.catalog-new {
  padding: 10px 18px; font-family: 'Orbitron', sans-serif; font-size: 0.7rem;
  letter-spacing: 0.18em; text-transform: uppercase; color: #ff5a5f;
  background: rgba(255, 90, 95,0.1); border: 1px solid rgba(255, 90, 95,0.5);
  border-radius: 8px; cursor: pointer; transition: background 0.2s, box-shadow 0.2s;
}
.catalog-new:hover { background: rgba(255, 90, 95,0.18); box-shadow: 0 0 18px rgba(255, 90, 95,0.3); }

.catalog-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.catalog-card {
  position: relative; display: flex; flex-direction: column;
  background:
    linear-gradient(180deg, rgba(255, 90, 95,0.04) 0%, transparent 35%),
    linear-gradient(180deg, #0a1816 0%, #1b0e0c 100%);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 16px;
  clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%);
  overflow: hidden; transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.catalog-card::before {
  content: ''; position: absolute; top: 0; left: 6%; right: 24%; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 90, 95,0.5), transparent);
}
.catalog-card:hover {
  border-color: rgba(255, 90, 95,0.35);
  transform: translateY(-2px);
  box-shadow: 0 16px 40px rgba(255, 90, 95,0.15);
}
.catalog-card.offline {
  opacity: 0.7;
  border-color: rgba(255,159,67,0.25);
}

.catalog-img {
  position: relative; aspect-ratio: 16/10; overflow: hidden;
  background: linear-gradient(135deg, #241512, #140a09);
}
.catalog-img img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.4s;
}
.catalog-card:hover .catalog-img img { transform: scale(1.05); }
.catalog-img-fallback {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; font-family: 'Orbitron', monospace;
  font-size: 3rem; color: rgba(255, 90, 95,0.35);
}
.catalog-cat {
  position: absolute; top: 10px; left: 10px;
  font-family: 'Orbitron', monospace; font-size: 0.58rem;
  letter-spacing: 0.18em; font-weight: 700; color: #ff5a5f;
  background: rgba(7,16,14,0.85); border: 1px solid rgba(255, 90, 95,0.5);
  border-radius: 3px; padding: 4px 9px; text-transform: uppercase;
  text-shadow: 0 0 6px rgba(255, 90, 95,0.6); backdrop-filter: blur(8px);
}
.catalog-veg {
  position: absolute; bottom: 10px; left: 10px;
  width: 12px; height: 12px; border-radius: 3px;
  background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center;
}
.catalog-veg::before {
  content: ''; width: 7px; height: 7px; border-radius: 50%;
}
.catalog-veg.veg::before    { background: #ff5a5f; box-shadow: 0 0 5px #ff5a5f; }
.catalog-veg.nonveg::before { background: #ff3366; box-shadow: 0 0 5px #ff3366; }
.catalog-offline {
  position: absolute; top: 10px; right: 10px;
  font-family: 'Orbitron', monospace; font-size: 0.58rem;
  letter-spacing: 0.18em; color: #ff9f43;
  background: rgba(7,16,14,0.85); border: 1px solid rgba(255,159,67,0.5);
  border-radius: 3px; padding: 4px 9px; text-transform: uppercase;
}

.catalog-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
.catalog-name {
  font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 1.05rem;
  color: #fff; line-height: 1.2; letter-spacing: 0.02em;
}
.catalog-meta {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 4px;
}
.catalog-price {
  font-family: 'Orbitron', monospace; font-size: 1.05rem; font-weight: 800;
  color: #ffed4e; text-shadow: 0 0 10px rgba(255,237,78,0.4);
}
.catalog-prep {
  font-family: 'Orbitron', monospace; font-size: 0.62rem;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: rgba(255,255,255,0.4);
}
.catalog-stock {
  font-family: 'Orbitron', monospace; font-size: 0.65rem;
  letter-spacing: 0.12em; color: rgba(255,255,255,0.45);
  margin-top: 2px;
}
.catalog-card-actions {
  display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px;
  margin-top: 12px;
}
.catalog-toggle, .catalog-edit, .catalog-delete {
  padding: 8px 10px; font-family: 'Orbitron', sans-serif; font-size: 0.62rem;
  letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700;
  border-radius: 6px; cursor: pointer; transition: background 0.18s, color 0.18s;
}
.catalog-toggle { border: 1px solid; }
.catalog-toggle.on  { color: #ff5a5f; border-color: rgba(255, 90, 95,0.45); background: rgba(255, 90, 95,0.08); }
.catalog-toggle.off { color: rgba(255,159,67,0.95); border-color: rgba(255,159,67,0.45); background: rgba(255,159,67,0.08); }
.catalog-toggle:hover  { background: rgba(255, 90, 95,0.18); }
.catalog-toggle:disabled { opacity: 0.6; cursor: progress; }
.catalog-edit {
  color: rgba(255,255,255,0.7);
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12);
}
.catalog-edit:hover {
  color: #ff5a5f; border-color: rgba(255, 90, 95,0.4);
  background: rgba(255, 90, 95,0.08);
}
.catalog-delete {
  color: #ff3366;
  background: rgba(255,51,102,0.06); border: 1px solid rgba(255,51,102,0.35);
}
.catalog-delete:hover  { background: rgba(255,51,102,0.18); }
.catalog-delete:disabled { opacity: 0.6; cursor: progress; }

.catalog-empty {
  padding: 60px 20px; text-align: center; color: rgba(255,255,255,0.4);
}
.catalog-empty-glyph {
  font-family: 'Orbitron', monospace; font-size: 3rem;
  color: rgba(255, 90, 95,0.4); text-shadow: 0 0 14px rgba(255, 90, 95,0.35);
  margin-bottom: 14px;
}
.catalog-empty-title {
  font-family: 'Orbitron', sans-serif; font-size: 0.85rem;
  letter-spacing: 0.32em; text-transform: uppercase;
  color: rgba(255, 90, 95,0.7); margin-bottom: 6px;
}
.catalog-empty-sub {
  font-family: 'Rajdhani', sans-serif; font-size: 0.85rem;
  color: rgba(255,255,255,0.4); letter-spacing: 0.06em;
}

/* Slide-in form */
.catalog-form-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  backdrop-filter: blur(2px); z-index: 200; animation: catfade 0.25s ease;
}
.catalog-form {
  position: fixed; top: 0; right: 0; bottom: 0; width: 420px; max-width: 100vw;
  background:
    linear-gradient(180deg, rgba(255, 90, 95,0.05) 0%, transparent 30%),
    linear-gradient(180deg, #0a1816 0%, #1b0e0c 100%);
  border-left: 1px solid rgba(255, 90, 95,0.3); z-index: 201;
  display: flex; flex-direction: column;
  box-shadow: -22px 0 40px rgba(0,0,0,0.5), inset 1px 0 0 rgba(255, 90, 95,0.1);
  animation: catslide 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes catfade { from { opacity: 0; } to { opacity: 1; } }
@keyframes catslide { from { transform: translateX(100%); } to { transform: translateX(0); } }
.catalog-form-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 22px; border-bottom: 1px solid rgba(255,255,255,0.05);
}
.catalog-form-title {
  font-family: 'Orbitron', sans-serif; font-size: 0.78rem;
  letter-spacing: 0.28em; text-transform: uppercase; color: #ff5a5f;
  text-shadow: 0 0 8px rgba(255, 90, 95,0.45);
}
.catalog-form-close {
  font-family: 'Orbitron', monospace; font-size: 1.1rem;
  color: rgba(255,255,255,0.5); background: transparent;
  border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
  width: 32px; height: 32px; cursor: pointer; transition: all 0.18s;
}
.catalog-form-close:hover { color: #ff3366; border-color: rgba(255,51,102,0.5); }
.catalog-form-body {
  flex: 1; overflow-y: auto; padding: 20px 22px 22px;
  display: flex; flex-direction: column; gap: 14px;
}
.catalog-field { display: flex; flex-direction: column; gap: 6px; }
.catalog-field-label {
  font-family: 'Orbitron', sans-serif; font-size: 0.6rem;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}
.catalog-field input, .catalog-field textarea {
  padding: 10px 12px; font-family: 'Rajdhani', sans-serif; font-size: 0.92rem;
  color: #fff; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; outline: none; transition: border-color 0.18s, box-shadow 0.18s;
}
.catalog-field input:focus, .catalog-field textarea:focus {
  border-color: rgba(255, 90, 95,0.5); box-shadow: 0 0 12px rgba(255, 90, 95,0.18);
}
.catalog-field textarea { resize: vertical; min-height: 60px; }
.catalog-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.catalog-form-vegrow {
  display: flex; align-items: center;
  padding: 10px 12px; background: rgba(0,0,0,0.25);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
}
.catalog-form-veg {
  display: flex; align-items: center; gap: 10px;
  font-family: 'Rajdhani', sans-serif; font-size: 0.9rem;
  color: rgba(255,255,255,0.7); cursor: pointer;
}
.catalog-form-save {
  margin-top: 8px; padding: 14px; cursor: pointer;
  background: linear-gradient(90deg, rgba(255, 90, 95,0.1), rgba(255, 90, 95,0.25), rgba(255, 90, 95,0.1));
  background-size: 200% 100%; transition: background-position 0.5s, box-shadow 0.25s;
  border: 1px solid rgba(255, 90, 95,0.5); border-radius: 10px;
  font-family: 'Orbitron', sans-serif; font-size: 0.78rem; letter-spacing: 0.22em;
  text-transform: uppercase; font-weight: 800; color: #ff5a5f;
  text-shadow: 0 0 8px rgba(255, 90, 95,0.6);
}
.catalog-form-save:hover {
  background-position: 100% 0;
  box-shadow: 0 0 22px rgba(255, 90, 95,0.4);
}
.catalog-form-save:disabled { opacity: 0.7; cursor: progress; }
`;

export default CatalogPanel;
