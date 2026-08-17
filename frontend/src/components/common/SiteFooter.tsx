import React from 'react';
import { Link } from 'react-router-dom';
import { BUSINESS } from '../../config/business';

// ============================================================================
// SITE FOOTER
// ============================================================================
// Carries the policy links and the business identity.
//
// Both halves exist for the payment-gateway review. Razorpay checks that the
// policy pages are reachable by navigating the site — routes that exist but
// are linked from nowhere read as pages added to pass a check rather than to
// be used — and that the business name shown to customers matches the name on
// the account. Naming it here, from the same config the policy pages read,
// means the two cannot drift apart.
//
// Hidden inside the APK: an installed app has its own navigation, and a
// reviewer only ever sees the website.
// ============================================================================

const LINKS: ReadonlyArray<readonly [string, string]> = [
  ['terms', 'Terms'],
  ['privacy', 'Privacy'],
  ['refunds', 'Refunds & Cancellation'],
  ['shipping', 'Delivery'],
  ['contact', 'Contact'],
];

const SiteFooter: React.FC = () => (
  <footer className="site-footer" style={footerStyle}>
    <nav style={navStyle}>
      {LINKS.map(([slug, label]) => (
        <Link key={slug} to={`/${slug}`} style={linkStyle}>
          {label}
        </Link>
      ))}
    </nav>
    <div style={identityStyle}>
      {BUSINESS.legalName} · {BUSINESS.email}
    </div>
  </footer>
);

const footerStyle: React.CSSProperties = {
  borderTop: '1px solid rgba(255,255,255,0.08)',
  marginTop: 40,
  // Clears the floating cart button, which is pinned to the bottom-right and
  // would otherwise sit on top of the last row of links.
  padding: '24px 20px calc(96px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 12,
  textAlign: 'center',
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: 20,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const linkStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: '0.82rem',
  fontWeight: 600,
  color: 'rgba(255,242,235,0.55)',
  textDecoration: 'none',
};

const identityStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: '0.76rem',
  color: 'rgba(255,242,235,0.32)',
};

export default SiteFooter;
