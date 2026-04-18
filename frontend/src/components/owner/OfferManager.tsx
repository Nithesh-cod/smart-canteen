import React, { useState } from 'react';
import type { Offer } from '../../types';
import Modal from '../common/Modal';
import { useToast } from '../common/Toast';
import api from '../../services/api';

interface OfferManagerProps {
  offers: Offer[];
  onRefresh: () => void;
}

type DiscountType = 'percentage' | 'amount';

interface OfferFormData {
  title: string;
  description: string;
  discountType: DiscountType;
  discount_percentage: string;
  discount_amount: string;
  min_order_amount: string;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
}

const defaultFormData = (): OfferFormData => ({
  title: '',
  description: '',
  discountType: 'percentage',
  discount_percentage: '',
  discount_amount: '',
  min_order_amount: '',
  valid_from: '',
  valid_until: '',
  is_active: true,
});

const formatDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const toInputDate = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
};

const glassInput: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  padding: '12px 16px',
  color: '#fff',
  fontFamily: 'Rajdhani, sans-serif',
  fontSize: '0.95rem',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'rgba(255,255,255,0.6)',
  fontFamily: 'Rajdhani, sans-serif',
  fontWeight: 600,
  fontSize: '0.82rem',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
};

const OfferManager: React.FC<OfferManagerProps> = ({ offers, onRefresh }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [formData, setFormData] = useState<OfferFormData>(defaultFormData());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const { showToast } = useToast();

  const openCreate = () => {
    setEditingOffer(null);
    setFormData(defaultFormData());
    setShowForm(true);
  };

  const openEdit = (offer: Offer) => {
    setEditingOffer(offer);
    setFormData({
      title: offer.title,
      description: offer.description,
      discountType: offer.discount_percentage != null ? 'percentage' : 'amount',
      discount_percentage: offer.discount_percentage != null ? String(offer.discount_percentage) : '',
      discount_amount: offer.discount_amount != null ? String(offer.discount_amount) : '',
      min_order_amount: offer.min_order_amount != null ? String(offer.min_order_amount) : '',
      valid_from: toInputDate(offer.valid_from),
      valid_until: toInputDate(offer.valid_until),
      is_active: offer.is_active,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingOffer(null);
    setFormData(defaultFormData());
  };

  const buildPayload = () => {
    const payload: Partial<Offer> = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      valid_from: formData.valid_from,
      valid_until: formData.valid_until,
      is_active: formData.is_active,
    };
    if (formData.discountType === 'percentage') {
      payload.discount_percentage = formData.discount_percentage
        ? parseFloat(formData.discount_percentage)
        : undefined;
      payload.discount_amount = undefined;
    } else {
      payload.discount_amount = formData.discount_amount
        ? parseFloat(formData.discount_amount)
        : undefined;
      payload.discount_percentage = undefined;
    }
    if (formData.min_order_amount) {
      payload.min_order_amount = parseFloat(formData.min_order_amount);
    }
    return payload;
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    if (!formData.valid_from || !formData.valid_until) {
      showToast('Valid dates are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingOffer) {
        await api.put(`/admin/offers/${editingOffer.id}`, payload);
        showToast('Offer updated!', 'success');
      } else {
        try {
          await api.post('/admin/offers', payload);
        } catch {
          await api.post('/offers', payload);
        }
        showToast('Offer created!', 'success');
      }
      closeForm();
      onRefresh();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to save offer', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this offer?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/admin/offers/${id}`);
      showToast('Offer deleted', 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to delete offer', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (offer: Offer) => {
    setTogglingId(offer.id);
    try {
      await api.patch(`/admin/offers/${offer.id}/toggle`);
      showToast(`Offer ${offer.is_active ? 'deactivated' : 'activated'}`, 'success');
      onRefresh();
    } catch {
      // fallback: update with toggled value
      try {
        await api.put(`/admin/offers/${offer.id}`, { ...offer, is_active: !offer.is_active });
        showToast(`Offer ${offer.is_active ? 'deactivated' : 'activated'}`, 'success');
        onRefresh();
      } catch (err: any) {
        showToast(err?.response?.data?.message || 'Failed to toggle offer', 'error');
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '#00f5ff';
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,245,255,0.12)';
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 28,
        }}
      >
        <h2
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '1.3rem',
            fontWeight: 700,
            color: '#00f5ff',
            margin: 0,
          }}
        >
          🎁 Offers &amp; Discounts
        </h2>
        <button
          onClick={openCreate}
          style={{
            background: 'transparent',
            border: '2px solid #00f5ff',
            color: '#00f5ff',
            borderRadius: 12,
            padding: '10px 22px',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.25s',
            letterSpacing: 0.5,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              'rgba(0,245,255,0.15)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          + Create Offer
        </button>
      </div>

      {/* Offer Cards Grid */}
      {offers.length === 0 ? (
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px dashed rgba(255,255,255,0.15)',
            borderRadius: 20,
            padding: '60px 30px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎁</div>
          <div
            style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '1rem',
              color: 'rgba(255,255,255,0.45)',
              marginBottom: 8,
            }}
          >
            No offers yet
          </div>
          <div
            style={{
              fontFamily: 'Rajdhani, sans-serif',
              color: 'rgba(255,255,255,0.3)',
              fontSize: '0.9rem',
            }}
          >
            Create your first offer!
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 20,
          }}
        >
          {offers.map((offer) => (
            <div
              key={offer.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${offer.is_active ? 'rgba(0,245,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 18,
                padding: 22,
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  '0 8px 30px rgba(0,245,255,0.1)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
              }}
            >
              {/* Top row: title + active toggle */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 10,
                  gap: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: 'Rajdhani, sans-serif',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: '#fff',
                    lineHeight: 1.2,
                  }}
                >
                  {offer.title}
                </div>
                <button
                  onClick={() => handleToggle(offer)}
                  disabled={togglingId === offer.id}
                  style={{
                    background: offer.is_active
                      ? 'rgba(0,255,136,0.18)'
                      : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${offer.is_active ? '#00ff88' : 'rgba(255,255,255,0.2)'}`,
                    color: offer.is_active ? '#00ff88' : 'rgba(255,255,255,0.4)',
                    borderRadius: 20,
                    padding: '4px 14px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    fontFamily: 'Rajdhani, sans-serif',
                    cursor: 'pointer',
                    letterSpacing: 0.5,
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                    flexShrink: 0,
                  }}
                >
                  {togglingId === offer.id ? '...' : offer.is_active ? '● Active' : '○ Inactive'}
                </button>
              </div>

              {/* Description */}
              <div
                style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontSize: '0.88rem',
                  color: 'rgba(255,255,255,0.55)',
                  marginBottom: 14,
                  lineHeight: 1.5,
                }}
              >
                {offer.description}
              </div>

              {/* Discount Badge */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {offer.discount_percentage != null && (
                  <span
                    style={{
                      background: 'rgba(255,237,78,0.15)',
                      border: '1px solid rgba(255,237,78,0.4)',
                      color: '#ffed4e',
                      borderRadius: 8,
                      padding: '4px 12px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      fontFamily: 'Rajdhani, sans-serif',
                    }}
                  >
                    {offer.discount_percentage}% off
                  </span>
                )}
                {offer.discount_amount != null && (
                  <span
                    style={{
                      background: 'rgba(255,237,78,0.15)',
                      border: '1px solid rgba(255,237,78,0.4)',
                      color: '#ffed4e',
                      borderRadius: 8,
                      padding: '4px 12px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      fontFamily: 'Rajdhani, sans-serif',
                    }}
                  >
                    ₹{offer.discount_amount} off
                  </span>
                )}
                {offer.min_order_amount != null && (
                  <span
                    style={{
                      background: 'rgba(0,245,255,0.08)',
                      border: '1px solid rgba(0,245,255,0.2)',
                      color: '#00f5ff',
                      borderRadius: 8,
                      padding: '4px 12px',
                      fontSize: '0.8rem',
                      fontFamily: 'Rajdhani, sans-serif',
                    }}
                  >
                    Min ₹{offer.min_order_amount}
                  </span>
                )}
              </div>

              {/* Validity */}
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'rgba(255,255,255,0.38)',
                  fontFamily: 'Rajdhani, sans-serif',
                  marginBottom: 16,
                }}
              >
                📅 {formatDate(offer.valid_from)} – {formatDate(offer.valid_until)}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => openEdit(offer)}
                  style={{
                    flex: 1,
                    background: 'rgba(0,245,255,0.1)',
                    border: '1px solid rgba(0,245,255,0.3)',
                    color: '#00f5ff',
                    borderRadius: 9,
                    padding: '8px 0',
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(0,245,255,0.2)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(0,245,255,0.1)')
                  }
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => handleDelete(offer.id)}
                  disabled={deletingId === offer.id}
                  style={{
                    flex: 1,
                    background: 'rgba(255,51,102,0.1)',
                    border: '1px solid rgba(255,51,102,0.3)',
                    color: '#ff3366',
                    borderRadius: 9,
                    padding: '8px 0',
                    fontFamily: 'Rajdhani, sans-serif',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: deletingId === offer.id ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: deletingId === offer.id ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (deletingId !== offer.id)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(255,51,102,0.2)';
                  }}
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(255,51,102,0.1)')
                  }
                >
                  {deletingId === offer.id ? '...' : '🗑️ Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <Modal isOpen={showForm} onClose={closeForm} title={editingOffer ? 'Edit Offer' : 'Create Offer'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Title */}
            <div>
              <label style={labelStyle}>Title *</label>
              <input
                type="text"
                placeholder="e.g. Weekend Special"
                value={formData.title}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, title: e.target.value }))
                }
                style={glassInput}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                placeholder="Describe the offer..."
                value={formData.description}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, description: e.target.value }))
                }
                style={{
                  ...glassInput,
                  resize: 'vertical',
                  minHeight: 80,
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* Discount Type Toggle */}
            <div>
              <label style={labelStyle}>Discount Type</label>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                {(['percentage', 'amount'] as DiscountType[]).map((dt) => (
                  <label
                    key={dt}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      fontFamily: 'Rajdhani, sans-serif',
                      fontWeight: 600,
                      color:
                        formData.discountType === dt
                          ? '#00f5ff'
                          : 'rgba(255,255,255,0.5)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="discountType"
                      value={dt}
                      checked={formData.discountType === dt}
                      onChange={() =>
                        setFormData((f) => ({ ...f, discountType: dt }))
                      }
                      style={{ accentColor: '#00f5ff' }}
                    />
                    {dt === 'percentage' ? '% Percentage' : '₹ Fixed Amount'}
                  </label>
                ))}
              </div>
            </div>

            {/* Discount Value */}
            <div>
              <label style={labelStyle}>
                {formData.discountType === 'percentage'
                  ? 'Discount Percentage (%)'
                  : 'Discount Amount (₹)'}
              </label>
              <input
                type="number"
                min="0"
                placeholder={
                  formData.discountType === 'percentage' ? 'e.g. 20' : 'e.g. 50'
                }
                value={
                  formData.discountType === 'percentage'
                    ? formData.discount_percentage
                    : formData.discount_amount
                }
                onChange={(e) =>
                  setFormData((f) =>
                    formData.discountType === 'percentage'
                      ? { ...f, discount_percentage: e.target.value }
                      : { ...f, discount_amount: e.target.value }
                  )
                }
                style={glassInput}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* Min Order Amount */}
            <div>
              <label style={labelStyle}>Min Order Amount (₹) — optional</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 200"
                value={formData.min_order_amount}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, min_order_amount: e.target.value }))
                }
                style={glassInput}
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
            </div>

            {/* Dates Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Valid From *</label>
                <input
                  type="date"
                  value={formData.valid_from}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, valid_from: e.target.value }))
                  }
                  style={{
                    ...glassInput,
                    colorScheme: 'dark',
                  }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
              <div>
                <label style={labelStyle}>Valid Until *</label>
                <input
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, valid_until: e.target.value }))
                  }
                  style={{
                    ...glassInput,
                    colorScheme: 'dark',
                  }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
            </div>

            {/* Active Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
              }}
              onClick={() =>
                setFormData((f) => ({ ...f, is_active: !f.is_active }))
              }
            >
              <div
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: formData.is_active
                    ? 'rgba(0,255,136,0.35)'
                    : 'rgba(255,255,255,0.1)',
                  border: `1px solid ${formData.is_active ? '#00ff88' : 'rgba(255,255,255,0.2)'}`,
                  position: 'relative',
                  transition: 'all 0.3s',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: formData.is_active ? 22 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: formData.is_active ? '#00ff88' : 'rgba(255,255,255,0.4)',
                    transition: 'all 0.3s',
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 600,
                  color: formData.is_active ? '#00ff88' : 'rgba(255,255,255,0.45)',
                  fontSize: '0.9rem',
                }}
              >
                {formData.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1,
                  background: saving
                    ? 'rgba(0,245,255,0.1)'
                    : 'linear-gradient(135deg, rgba(0,245,255,0.25), rgba(255,0,255,0.25))',
                  border: '1px solid rgba(0,245,255,0.5)',
                  color: '#00f5ff',
                  borderRadius: 12,
                  padding: '13px 0',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: saving ? 0.7 : 1,
                  letterSpacing: 0.5,
                }}
              >
                {saving ? 'Saving...' : editingOffer ? 'Save Changes' : 'Create Offer'}
              </button>
              <button
                onClick={closeForm}
                disabled={saving}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.6)',
                  borderRadius: 12,
                  padding: '13px 0',
                  fontFamily: 'Rajdhani, sans-serif',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!saving)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(255,255,255,0.04)')
                }
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default OfferManager;
