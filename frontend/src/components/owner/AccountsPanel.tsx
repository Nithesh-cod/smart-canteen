import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../common/Modal';
import { useToast } from '../common/Toast';
import api from '../../services/api';

// ============================================================================
// AccountsPanel — Owner-dashboard staff & account management
// ============================================================================
// Create chef / admin / student accounts, change roles, reset passwords, and
// activate/deactivate — the UI for the /api/admin/accounts endpoints. Replaces
// the CLI-only `npm run create-admin` for day-to-day staff management.
// ============================================================================

interface Account {
  id: string;
  name: string;
  roll_number: string;
  phone: string;
  email?: string | null;
  department?: string | null;
  role: 'student' | 'chef' | 'admin';
  is_active: boolean;
  points?: number;
  tier?: string;
  created_at?: string;
}

type RoleFilter = 'staff' | 'all' | 'student';
const ROLES = ['student', 'chef', 'admin'] as const;

const roleColor: Record<string, string> = { admin: '#ffed4e', chef: '#ff5a5f', student: '#66b3ff' };

const glassInput: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10, padding: '12px 16px', color: '#fff', fontFamily: 'Inter, sans-serif',
  fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 6, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter, sans-serif',
  fontWeight: 600, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: 0.8,
};

const emptyForm = () => ({ name: '', roll_number: '', phone: '', password: '', role: 'chef' as Account['role'], department: '' });

const AccountsPanel: React.FC = () => {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RoleFilter>('staff');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const [pwFor, setPwFor] = useState<Account | null>(null);
  const [newPw, setNewPw] = useState('');

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/accounts?role=${filter}&limit=200`);
      setAccounts(res.data?.data?.accounts ?? []);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to load accounts', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.roll_number.trim() || !form.phone.trim() || !form.password) {
      showToast('Name, roll number, phone and password are required', 'error');
      return;
    }
    if (form.password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/admin/accounts', {
        name: form.name.trim(), roll_number: form.roll_number.trim(), phone: form.phone.trim(),
        password: form.password, role: form.role, department: form.department.trim() || undefined,
      });
      showToast(`${form.role} account created`, 'success');
      setShowCreate(false); setForm(emptyForm());
      fetchAccounts();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to create account', 'error');
    } finally { setSaving(false); }
  };

  const patchAccount = async (acc: Account, body: Record<string, unknown>, ok: string) => {
    setBusyId(acc.id);
    try {
      await api.patch(`/admin/accounts/${acc.id}`, body);
      showToast(ok, 'success');
      fetchAccounts();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Update failed', 'error');
    } finally { setBusyId(null); }
  };

  const handleResetPw = async () => {
    if (!pwFor) return;
    if (newPw.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
    await patchAccount(pwFor, { password: newPw }, `Password reset for ${pwFor.roll_number}`);
    setPwFor(null); setNewPw('');
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 700, color: '#ff5a5f', margin: 0 }}>
          👥 Staff &amp; Accounts
        </h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
            {(['staff', 'student', 'all'] as RoleFilter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', fontWeight: 700, textTransform: 'capitalize',
                background: filter === f ? 'rgba(255, 90, 95,0.18)' : 'transparent',
                color: filter === f ? '#ff5a5f' : 'rgba(255,255,255,0.45)',
              }}>{f}</button>
            ))}
          </div>
          <button onClick={() => { setForm(emptyForm()); setShowCreate(true); }} style={{
            background: 'transparent', border: '2px solid #ff5a5f', color: '#ff5a5f', borderRadius: 12,
            padding: '9px 20px', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
          }}>+ New Account</button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif', padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 20, padding: '50px 30px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif' }}>
          No accounts in this view.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {accounts.map((acc) => (
            <div key={acc.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${acc.is_active ? 'rgba(255,255,255,0.1)' : 'rgba(255,51,102,0.25)'}`,
              borderRadius: 14, padding: '14px 18px', opacity: acc.is_active ? 1 : 0.6,
            }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, color: '#fff', fontSize: '1.05rem' }}>{acc.name}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem' }}>
                  {acc.roll_number} · {acc.phone}{acc.department ? ` · ${acc.department}` : ''}
                </div>
              </div>

              {/* Role selector */}
              <select
                value={acc.role}
                disabled={busyId === acc.id}
                onChange={(e) => patchAccount(acc, { role: e.target.value }, `${acc.roll_number} → ${e.target.value}`)}
                style={{
                  background: 'rgba(0,0,0,0.35)', color: roleColor[acc.role], border: `1px solid ${roleColor[acc.role]}55`,
                  borderRadius: 8, padding: '7px 10px', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.82rem',
                  cursor: 'pointer', textTransform: 'capitalize',
                }}>
                {ROLES.map((r) => <option key={r} value={r} style={{ background: '#241512' }}>{r}</option>)}
              </select>

              {/* Reset password */}
              <button onClick={() => { setPwFor(acc); setNewPw(''); }} disabled={busyId === acc.id} style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)',
                borderRadius: 8, padding: '7px 12px', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
              }}>🔑 Reset PW</button>

              {/* Active toggle */}
              <button
                onClick={() => patchAccount(acc, { is_active: !acc.is_active }, `${acc.roll_number} ${acc.is_active ? 'deactivated' : 'activated'}`)}
                disabled={busyId === acc.id}
                style={{
                  background: acc.is_active ? 'rgba(255, 90, 95,0.15)' : 'rgba(255,51,102,0.15)',
                  border: `1px solid ${acc.is_active ? '#ff5a5f' : '#ff3366'}`, color: acc.is_active ? '#ff5a5f' : '#ff3366',
                  borderRadius: 8, padding: '7px 12px', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.8rem',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{busyId === acc.id ? '…' : acc.is_active ? '● Active' : '○ Inactive'}</button>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Account">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={labelStyle}>Full Name *</label>
              <input style={glassInput} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Head Chef" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><label style={labelStyle}>Roll Number *</label>
                <input style={glassInput} value={form.roll_number} onChange={(e) => setForm((f) => ({ ...f, roll_number: e.target.value }))} placeholder="CHEF002" /></div>
              <div><label style={labelStyle}>Phone *</label>
                <input style={glassInput} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="9000000000" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><label style={labelStyle}>Role *</label>
                <select style={{ ...glassInput, cursor: 'pointer', textTransform: 'capitalize' }} value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Account['role'] }))}>
                  {ROLES.map((r) => <option key={r} value={r} style={{ background: '#241512' }}>{r}</option>)}
                </select></div>
              <div><label style={labelStyle}>Department (optional)</label>
                <input style={glassInput} value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="Kitchen" /></div>
            </div>
            <div><label style={labelStyle}>Password * (min 6)</label>
              <input type="password" style={glassInput} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" /></div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button onClick={handleCreate} disabled={saving} style={{
                flex: 1, background: 'linear-gradient(135deg, rgba(255, 90, 95,0.25), rgba(255, 158, 61,0.25))', border: '1px solid rgba(255, 90, 95,0.5)',
                color: '#ff5a5f', borderRadius: 12, padding: '13px 0', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '1rem',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}>{saving ? 'Creating…' : 'Create Account'}</button>
              <button onClick={() => setShowCreate(false)} disabled={saving} style={{
                flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)',
                borderRadius: 12, padding: '13px 0', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reset-password modal */}
      {pwFor && (
        <Modal isOpen={!!pwFor} onClose={() => setPwFor(null)} title={`Reset password — ${pwFor.roll_number}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><label style={labelStyle}>New Password (min 6)</label>
              <input type="password" style={glassInput} value={newPw} autoFocus onChange={(e) => setNewPw(e.target.value)} placeholder="••••••••" /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleResetPw} disabled={busyId === pwFor.id} style={{
                flex: 1, background: 'linear-gradient(135deg, rgba(255, 90, 95,0.25), rgba(255, 158, 61,0.25))', border: '1px solid rgba(255, 90, 95,0.5)',
                color: '#ff5a5f', borderRadius: 12, padding: '13px 0', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
              }}>Set Password</button>
              <button onClick={() => setPwFor(null)} style={{
                flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)',
                borderRadius: 12, padding: '13px 0', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AccountsPanel;
