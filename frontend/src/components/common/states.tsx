import React from 'react';

// ============================================================================
// UI STATES — liquid glass
// ============================================================================
// Every non-happy path in the app renders through one of these, so a shopper
// who hits an empty list, a dropped connection or an expired session sees the
// same material and the same shape of explanation each time.
//
// Three rules each of these follows:
//   1. Say what happened in plain language — never a status code.
//   2. Offer the way out. A dead end with no action is a bug, not a state.
//   3. Never blame the user for something the system did.
//
// Styling lives in styles/liquid-glass.css so the material is defined once.
// ============================================================================

type Tone = 'neutral' | 'danger' | 'warn' | 'success';

const toneClass: Record<Tone, string> = {
  neutral: '',
  danger: 'lg-tone-danger',
  warn: 'lg-tone-warn',
  success: 'lg-tone-success',
};

export interface StateAction {
  label: string;
  onClick: () => void;
  /** Secondary actions render as ghost buttons. */
  ghost?: boolean;
}

export interface StateViewProps {
  glyph: string;
  title: string;
  body?: React.ReactNode;
  actions?: StateAction[];
  tone?: Tone;
  /** Fill the viewport — for whole-screen states like offline or session end. */
  fullscreen?: boolean;
  className?: string;
}

/**
 * The shared shell. Everything below is a preset of this, which is what keeps
 * the states visually identical rather than merely similar.
 */
export const StateView: React.FC<StateViewProps> = ({
  glyph, title, body, actions, tone = 'neutral', fullscreen, className = '',
}) => {
  const panel = (
    <div className={`lg-surface ${toneClass[tone]} ${className}`} role="status" aria-live="polite">
      <div className="lg-state">
        <div className="lg-state-glyph" aria-hidden="true">{glyph}</div>
        <div className="lg-state-title">{title}</div>
        {body && <div className="lg-state-body">{body}</div>}
        {actions && actions.length > 0 && (
          <div className="lg-state-actions">
            {actions.map((a) => (
              <button
                key={a.label}
                className={`lg-btn ${a.ghost ? 'ghost' : ''}`}
                onClick={a.onClick}
                type="button"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (!fullscreen) return panel;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {panel}
    </div>
  );
};

// ============================================================================
// 1. EMPTY
// ============================================================================
/** Nothing here yet — a normal, expected condition, so it stays neutral. */
export const EmptyState: React.FC<{
  title?: string;
  body?: React.ReactNode;
  glyph?: string;
  actions?: StateAction[];
}> = ({ title = 'Nothing here yet', body, glyph = '🍽️', actions }) => (
  <StateView glyph={glyph} title={title} body={body} actions={actions} />
);

// ============================================================================
// 2. LOADING
// ============================================================================
/**
 * Skeletons rather than a spinner wherever the final shape is known. A
 * skeleton tells the reader what is about to appear and keeps the layout from
 * jumping when it does; a spinner tells them only that something is happening.
 */
export const Skeleton: React.FC<{
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}> = ({ width = '100%', height = 14, radius = 10, style }) => (
  <div className="lg-skel" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />
);

/** Placeholder matching one menu card, used while the menu loads. */
export const CardSkeleton: React.FC = () => (
  <div className="lg-surface" style={{ overflow: 'hidden' }}>
    <Skeleton height={140} radius={0} />
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Skeleton width="72%" height={15} />
      <Skeleton width="45%" height={11} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
        <Skeleton width={54} height={20} />
        <Skeleton width={76} height={30} radius={12} />
      </div>
    </div>
  </div>
);

export const LoadingGrid: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div
    className="menu-grid"
    aria-busy="true"
    aria-label="Loading dishes"
  >
    {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
  </div>
);

/** For places with no known shape — a short list, a panel body. */
export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Loading…' }) => (
  <StateView glyph="◌" title={message} body="One moment." />
);

// ============================================================================
// 3. ERROR
// ============================================================================
/**
 * Something broke on our side. The retry action matters more than the wording:
 * most failures here are transient, and without it the only recovery a user
 * can find is a full page reload, which also loses their cart.
 */
export const ErrorState: React.FC<{
  title?: string;
  body?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}> = ({
  title = 'Something went wrong',
  body = "That's on us, not you. Try again in a moment.",
  onRetry,
  retryLabel = 'Try again',
}) => (
  <StateView
    glyph="⚠"
    title={title}
    body={body}
    tone="danger"
    actions={onRetry ? [{ label: retryLabel, onClick: onRetry }] : undefined}
  />
);

// ============================================================================
// 4. NO INTERNET
// ============================================================================
/**
 * Deliberately does NOT offer "Reload". Reloading an offline SPA replaces a
 * working shell (and the user's cart) with the browser's own error page, which
 * is strictly worse. It waits for the connection instead, and the banner
 * clears itself the moment the browser reports it is back.
 */
export const OfflineState: React.FC<{ onRetry?: () => void; fullscreen?: boolean }> = ({
  onRetry, fullscreen = true,
}) => (
  <StateView
    glyph="📡"
    title="You're offline"
    body="We can't reach the canteen right now. Your cart is safe — this will pick up again on its own once you're back."
    tone="danger"
    fullscreen={fullscreen}
    actions={onRetry ? [{ label: 'Check again', onClick: onRetry, ghost: true }] : undefined}
  />
);

// ============================================================================
// 5. SLOW NETWORK
// ============================================================================
/**
 * Shown while a request is merely slow, not failed. Naming it prevents the
 * "is it broken or just slow?" tap-again reflex that turns one order into
 * three — worth more than any spinner refinement.
 */
export const SlowNetworkState: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <StateView
    glyph="🐌"
    title="This is taking longer than usual"
    body="Your connection looks slow. We're still trying — no need to tap again."
    tone="warn"
    actions={onRetry ? [{ label: 'Retry now', onClick: onRetry, ghost: true }] : undefined}
  />
);

// ============================================================================
// 6. NO SEARCH RESULTS
// ============================================================================
/**
 * Distinct from EmptyState on purpose. "No dishes" and "no dishes matching
 * 'briyani'" call for different actions: the second is nearly always a typo or
 * an over-narrow filter, so the way out is clearing it, not waiting.
 */
export const NoResultsState: React.FC<{
  query?: string;
  onClear?: () => void;
  suggestion?: string;
}> = ({ query, onClear, suggestion }) => (
  <StateView
    glyph="🔍"
    title={query ? `No dishes match "${query}"` : 'No dishes match that filter'}
    body={suggestion ?? 'Try a shorter word, or check another category.'}
    actions={onClear ? [{ label: 'Clear search', onClick: onClear, ghost: true }] : undefined}
  />
);

// ============================================================================
// 7. PERMISSION DENIED
// ============================================================================
/**
 * The account is valid, the door isn't theirs. Says which role IS required so
 * staff can tell "wrong login" from "ask an owner for access" — the difference
 * between a five-second fix and a support call.
 */
export const PermissionDeniedState: React.FC<{
  requiredRoles?: string[];
  onSwitchAccount?: () => void;
  fullscreen?: boolean;
}> = ({ requiredRoles, onSwitchAccount, fullscreen = true }) => (
  <StateView
    glyph="🔒"
    title="You don't have access to this"
    body={
      requiredRoles?.length
        ? `This screen is for ${requiredRoles.join(' or ')} accounts. Yours isn't one — an owner can change that for you.`
        : "Your account doesn't have permission for this screen."
    }
    tone="warn"
    fullscreen={fullscreen}
    actions={onSwitchAccount ? [{ label: 'Sign in as someone else', onClick: onSwitchAccount }] : undefined}
  />
);

// ============================================================================
// 8. SESSION EXPIRED
// ============================================================================
/**
 * Framed as routine rather than as a failure, because it is: sessions are
 * time-limited by design. Reassures that nothing was lost, which is the actual
 * worry when a screen logs someone out mid-task.
 */
export const SessionExpiredState: React.FC<{
  onSignIn: () => void;
  fullscreen?: boolean;
}> = ({ onSignIn, fullscreen = true }) => (
  <StateView
    glyph="⏳"
    title="Your session timed out"
    body="You've been signed out for security. Nothing was lost — sign in and carry on."
    tone="warn"
    fullscreen={fullscreen}
    actions={[{ label: 'Sign in', onClick: onSignIn }]}
  />
);

// ============================================================================
// 9. FORM VALIDATION
// ============================================================================
/**
 * A labelled field that only shows its error once the user has finished with
 * it (`touched`). Validating on every keystroke marks a field red while it is
 * still being typed, which reads as being told off mid-sentence.
 *
 * The error is wired to the input via aria-describedby and aria-invalid so it
 * is announced, not just coloured — colour alone fails anyone using a screen
 * reader, and red-on-dark is exactly where contrast problems live.
 */
export const FormField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint?: string;
  touched?: boolean;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  maxLength?: number;
}> = ({
  label, value, onChange, error, hint, touched = true,
  type = 'text', placeholder, autoFocus, onBlur, inputMode, maxLength,
}) => {
  const showError = touched && !!error;
  const showValid = touched && !error && value.length > 0;
  const id = React.useId();

  return (
    <div className="lg-field">
      <label className="lg-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`lg-input ${showError ? 'invalid' : ''} ${showValid ? 'valid' : ''}`}
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={showError}
        aria-describedby={showError ? `${id}-err` : hint ? `${id}-hint` : undefined}
      />
      {showError && (
        <div className="lg-error" id={`${id}-err`} role="alert">
          <span aria-hidden="true">⚠</span>{error}
        </div>
      )}
      {!showError && hint && <div className="lg-hint" id={`${id}-hint`}>{hint}</div>}
    </div>
  );
};

// ============================================================================
// 10. SUCCESS
// ============================================================================
/**
 * Confirms the specific thing that happened, not a generic "Done". After a
 * payment the reader wants their order number, and re-reading it back is what
 * makes the confirmation trustworthy.
 */
export const SuccessState: React.FC<{
  title?: string;
  body?: React.ReactNode;
  actions?: StateAction[];
  fullscreen?: boolean;
}> = ({ title = 'All done', body, actions, fullscreen }) => (
  <StateView
    glyph="✓"
    title={title}
    body={body}
    tone="success"
    fullscreen={fullscreen}
    actions={actions}
  />
);
