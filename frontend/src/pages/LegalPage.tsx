import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { BUSINESS, hasPlaceholders } from '../config/business';

// ============================================================================
// LEGAL PAGES — the five documents Razorpay's website review looks for
// ============================================================================
// Terms, Privacy, Refunds, Shipping and Contact. Missing policy pages are the
// most common reason a website submission is rejected, and for a food business
// the refund policy is the one they read closely.
//
// All five share this component because they share their chrome, and because
// a reviewer comparing two pages must not find the business named differently
// on each — every mention comes from config/business.ts.
//
// The text describes what the system ACTUALLY does. The cancellation rule is
// the stock-hold behaviour (a cart hold reserves stock; cancelling releases it;
// the kitchen accepting the order is the point of no return), and the delivery
// policy says counter pickup because there is no delivery. Policies that
// describe a different product are worse than none — they are a promise the
// software will not keep.
// ============================================================================

type Section = { heading: string; body: React.ReactNode };
type Doc = { title: string; intro: string; sections: Section[] };

const p = (...lines: string[]) => (
  <>
    {lines.map((line, i) => (
      <p key={i} style={paraStyle}>{line}</p>
    ))}
  </>
);

// Declared above `docs` on purpose: `docs` is built at module load and its
// contact entry renders these, so a later declaration leaves it in the
// temporal dead zone and the page throws before it paints.
const ContactRow: React.FC<{ label: string; value: string; href?: string }> = ({ label, value, href }) => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
    <span style={{ minWidth: 92, color: 'rgba(255,242,235,0.45)', fontSize: '0.82rem', fontWeight: 700 }}>
      {label}
    </span>
    {href ? (
      <a href={href} style={{ color: '#ff9e3d', textDecoration: 'none', fontSize: '0.95rem' }}>{value}</a>
    ) : (
      <span style={{ color: 'rgba(255,242,235,0.85)', fontSize: '0.95rem' }}>{value}</span>
    )}
  </div>
);

// A FUNCTION, not a module-level object. Built eagerly, this reads the style
// constants declared at the bottom of the file through the p() helper, which
// puts them in the temporal dead zone: the module loads, `docs` runs, and the
// page throws "Cannot access 'paraStyle' before initialization" before it can
// paint. Neither tsc nor the production build catches it — only opening the
// page does. Building on demand means every declaration exists by then, and
// the ordering stops mattering at all.
const buildDocs = (): Record<string, Doc> => ({
  // ── Terms ────────────────────────────────────────────────────────────────
  terms: {
    title: 'Terms & Conditions',
    intro: `These terms govern your use of ${BUSINESS.tradingName}, operated by ${BUSINESS.legalName}.`,
    sections: [
      {
        heading: 'Placing an order',
        body: p(
          'You may order from the menu shown on the site or in the app. Prices are displayed in Indian Rupees and include applicable taxes.',
          'Adding an item to your cart reserves that item from available stock for a limited period so that two people cannot buy the last portion at once. If you do not complete payment, the reservation expires and the item returns to the menu for others.',
          'An order is confirmed only once payment succeeds and you receive an order number. Until then no food is prepared and no charge is settled.',
        ),
      },
      {
        heading: 'Availability',
        body: p(
          'Menu items and stock counts change through the day. An item shown as available may sell out while you are browsing; if that happens before you pay, you will be told and not charged.',
          'We may withdraw an item at any time — for example if an ingredient runs out mid-service.',
        ),
      },
      {
        heading: 'Collection',
        body: p(
          `Orders are prepared for collection at the counter at ${BUSINESS.address}. Bring your order number.`,
          'Orders not collected by the end of the service period may be discarded, and are not refundable in that case.',
        ),
      },
      {
        heading: 'Acceptable use',
        body: p(
          'Do not place orders you do not intend to collect, attempt to interfere with the ordering system, or use another person\'s account.',
          'We may refuse service or suspend an account where these terms are broken.',
        ),
      },
      {
        heading: 'Liability',
        body: p(
          'Please check allergen and ingredient information at the counter before ordering if you have a dietary requirement. Menu descriptions are a guide, not a complete ingredient list.',
          'Nothing in these terms limits any liability which cannot legally be limited, including liability for death or personal injury caused by negligence.',
        ),
      },
      {
        heading: 'Governing law',
        body: p('These terms are governed by the laws of India.'),
      },
    ],
  },

  // ── Privacy ──────────────────────────────────────────────────────────────
  privacy: {
    title: 'Privacy Policy',
    intro: `How ${BUSINESS.legalName} handles your information.`,
    sections: [
      {
        heading: 'What we collect',
        body: p(
          'If you order as a guest we collect only what is needed to prepare and hand over your order: the items, the amount, and an order number.',
          'If you create an account we also hold your name, roll number or phone number, and your order history so you can track orders and reorder.',
          'Payments are processed by Razorpay. Card numbers, UPI IDs, net-banking credentials and one-time passwords are entered on Razorpay\'s systems and are never sent to, seen by, or stored on our servers.',
        ),
      },
      {
        heading: 'Why we hold it',
        body: p(
          'To prepare your order, tell you when it is ready, take payment, handle refunds, and keep the sales records the canteen needs to operate.',
        ),
      },
      {
        heading: 'Who we share it with',
        body: p(
          'Razorpay, to take payment and process any refund.',
          'Our hosting and database providers, who store the data on our behalf.',
          'We do not sell your information, and we do not share it for advertising.',
        ),
      },
      {
        heading: 'How long we keep it',
        body: p(
          'Order records are kept for as long as the canteen needs them for accounting. You can ask us to delete your account and personal details at any time; transaction records that we are required to retain will remain, without being linked to your profile.',
        ),
      },
      {
        heading: 'Your choices',
        body: p(
          `Write to ${BUSINESS.email} to see what we hold about you, correct it, or ask for it to be deleted.`,
          'You can order as a guest at any time, without creating an account.',
        ),
      },
    ],
  },

  // ── Refunds ──────────────────────────────────────────────────────────────
  refunds: {
    title: 'Refund & Cancellation Policy',
    intro: 'Food is prepared to order, so the point at which the kitchen starts cooking is what determines whether an order can be cancelled.',
    sections: [
      {
        heading: 'Cancelling an order',
        body: p(
          `You may cancel ${BUSINESS.cancellationCutoff}.`,
          'A cancellation within that window is refunded in full, and the items return to the menu for other customers immediately.',
        ),
      },
      {
        heading: 'After preparation has started',
        body: p(
          'Once the kitchen has accepted your order, ingredients are committed and the order cannot be cancelled.',
          'If something is wrong with the food itself — an item missing, the wrong item, or a quality problem — speak to the counter on the day and we will refund or replace it.',
        ),
      },
      {
        heading: 'If we cancel',
        body: p(
          'If we cannot fulfil an order after you have paid — an ingredient runs out, or service ends early — we cancel it and refund you in full without you having to ask.',
        ),
      },
      {
        heading: 'How refunds are paid',
        body: p(
          'Refunds go back through Razorpay to the original payment method. We do not refund to a different card, account or UPI ID.',
          'Once we issue a refund it typically reaches your account within 5–7 working days, depending on your bank. The delay is on the banking side, not ours.',
        ),
      },
      {
        heading: 'Raising a problem',
        body: p(
          `Contact ${BUSINESS.email} or ${BUSINESS.phone} with your order number. We aim to respond within one working day.`,
        ),
      },
    ],
  },

  // ── Shipping / delivery ──────────────────────────────────────────────────
  shipping: {
    title: 'Delivery & Collection Policy',
    intro: 'This is a canteen. Orders are collected in person — there is no delivery and no shipping.',
    sections: [
      {
        heading: 'Collection only',
        body: p(
          `All orders are prepared for collection at the counter at ${BUSINESS.address}.`,
          'Nothing is dispatched, couriered or delivered to an address, so no delivery charge is ever applied.',
        ),
      },
      {
        heading: 'When your order is ready',
        body: p(
          'Each item shows an approximate preparation time before you order. You can follow your order on the Track screen, which updates as the kitchen accepts, prepares and completes it.',
          'Collect from the counter using your order number.',
        ),
      },
      {
        heading: 'Uncollected orders',
        body: p(
          'Orders not collected by the end of the service period may be discarded for food-safety reasons and are not refundable in that case.',
        ),
      },
    ],
  },

  // ── Contact ──────────────────────────────────────────────────────────────
  contact: {
    title: 'Contact Us',
    intro: 'Reach a person about an order, a refund, or anything else.',
    sections: [
      {
        heading: 'Get in touch',
        body: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ContactRow label="Business" value={BUSINESS.legalName} />
            <ContactRow label="Email" value={BUSINESS.email} href={`mailto:${BUSINESS.email}`} />
            <ContactRow label="Phone" value={BUSINESS.phone} href={`tel:${BUSINESS.phone.replace(/\s+/g, '')}`} />
            <ContactRow label="Address" value={BUSINESS.address} />
          </div>
        ),
      },
      {
        heading: 'About an order',
        body: p(
          'Quote your order number — it is on your receipt and on the Track screen. That lets us find the order straight away.',
          'We aim to reply within one working day.',
        ),
      },
    ],
  },
});


const LegalPage: React.FC<{ slug?: string }> = ({ slug }) => {
  const params = useParams();
  const key = slug || params.doc || 'terms';
  const doc = buildDocs()[key];

  if (!doc) {
    return (
      <div style={pageStyle}>
        <div className="lg-surface" style={cardStyle}>
          <h1 style={titleStyle}>Page not found</h1>
          <p style={paraStyle}>That policy page does not exist.</p>
          <Link to="/" style={backStyle}>← Back to the menu</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div className="lg-surface" style={cardStyle}>
        <Link to="/" style={backStyle}>← Back to the menu</Link>

        <h1 style={titleStyle}>{doc.title}</h1>
        <p style={{ ...paraStyle, color: 'rgba(255,242,235,0.6)' }}>{doc.intro}</p>
        <p style={{ ...paraStyle, fontSize: '0.8rem', color: 'rgba(255,242,235,0.35)' }}>
          Last updated {BUSINESS.lastUpdated}
        </p>

        {/* A reviewer must never see "NEEDS_REAL_VALUE" on a live page, and
            neither must a customer. Louder than a code comment, and it cannot
            be missed on the page it actually affects. */}
        {hasPlaceholders() && (
          <div style={warnStyle}>
            <strong>Not ready to submit.</strong> Business details in
            <code style={{ margin: '0 5px' }}>src/config/business.ts</code>
            still contain placeholders. Razorpay rejects a submission where the
            business name or contact details do not match account activation.
          </div>
        )}

        {doc.sections.map((s) => (
          <section key={s.heading} style={{ marginTop: 26 }}>
            <h2 style={headingStyle}>{s.heading}</h2>
            {s.body}
          </section>
        ))}

        <LegalFooterLinks current={key} />
      </div>
    </div>
  );
};

/** Cross-links, so a reviewer can reach all five from any one of them. */
export const LegalFooterLinks: React.FC<{ current?: string }> = ({ current }) => (
  <nav style={crossLinkStyle}>
    {[
      ['terms', 'Terms'],
      ['privacy', 'Privacy'],
      ['refunds', 'Refunds'],
      ['shipping', 'Delivery'],
      ['contact', 'Contact'],
    ].map(([slug, label]) => (
      <Link
        key={slug}
        to={`/${slug}`}
        style={{
          color: slug === current ? '#ff5a5f' : 'rgba(255,242,235,0.5)',
          textDecoration: 'none',
          fontSize: '0.82rem',
          fontWeight: 600,
        }}
      >
        {label}
      </Link>
    ))}
  </nav>
);

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #140a09 0%, #241512 50%, #1b0e0c 100%)',
  padding: '32px 18px 56px',
};
const cardStyle: React.CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  padding: 'clamp(22px, 5vw, 40px)',
};
const titleStyle: React.CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: 'clamp(1.4rem, 5vw, 1.9rem)',
  fontWeight: 900,
  color: '#fff7f2',
  margin: '18px 0 10px',
};
const headingStyle: React.CSSProperties = {
  fontFamily: "'Sora', sans-serif",
  fontSize: '1.02rem',
  fontWeight: 800,
  color: '#ff9e3d',
  margin: '0 0 8px',
};
const paraStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: '0.95rem',
  lineHeight: 1.65,
  color: 'rgba(255,242,235,0.78)',
  margin: '0 0 10px',
};
const backStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: '0.84rem',
  color: 'rgba(255,242,235,0.5)',
  textDecoration: 'none',
};
const warnStyle: React.CSSProperties = {
  background: 'rgba(255,159,67,0.12)',
  border: '1px solid rgba(255,159,67,0.4)',
  borderRadius: 12,
  padding: '12px 16px',
  color: '#ffce9a',
  fontFamily: "'Inter', sans-serif",
  fontSize: '0.88rem',
  lineHeight: 1.5,
  marginTop: 14,
};
const crossLinkStyle: React.CSSProperties = {
  display: 'flex',
  gap: 18,
  flexWrap: 'wrap',
  marginTop: 34,
  paddingTop: 18,
  borderTop: '1px solid rgba(255,255,255,0.1)',
};

export default LegalPage;
