import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoginForm from '../components/student/LoginForm';
import type { Student } from '../types';

// ============================================================================
// UnifiedLogin  —  the single sign-in front door for ALL roles
// ============================================================================
// One login screen. After authentication, the user is routed by their
// server-assigned role (never a client-chosen destination):
//   • admin   → /owner   (Owner Dashboard)
//   • chef    → /chef    (Chef Display)
//   • student → /track   (order tracking / student home)
//
// A ?next=<path> hint is honoured ONLY when it is a safe, same-origin path AND
// appropriate for the role — a student can never be sent to /owner or /chef by
// crafting a ?next=, and an open-redirect to another origin is impossible.
// The role-protected dashboards keep their own AdminAuthGate as defense in
// depth, so this routing is convenience, not the security boundary.
// ============================================================================

/**
 * Only allow internal, same-origin absolute paths. Rejects external URLs,
 * protocol-relative "//evil.com", and anything not starting with a single "/".
 */
function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith('/')) return null;   // must be an absolute internal path
  if (next.startsWith('//')) return null;   // protocol-relative → external
  return next;
}

const UnifiedLogin: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const routeByRole = (student: Student) => {
    const role = student.role || 'student';

    if (role === 'admin') {
      // Admin may deep-link anywhere internal.
      navigate(next || '/owner', { replace: true });
      return;
    }
    if (role === 'chef') {
      // Chef may only be routed to a chef path; otherwise the chef display.
      navigate(next && next.startsWith('/chef') ? next : '/chef', { replace: true });
      return;
    }

    // Student: never allow a staff destination via ?next=.
    const studentSafe =
      next && !next.startsWith('/owner') && !next.startsWith('/chef') ? next : '/track';
    navigate(studentSafe, { replace: true });
  };

  return <LoginForm onLoginSuccess={routeByRole} />;
};

export default UnifiedLogin;
