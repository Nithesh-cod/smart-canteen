import React, { useState } from 'react';

type Variant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'success'
  | 'outline-cyan'
  | 'outline-green'
  | 'outline-red';

type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
    color: '#000',
    fontWeight: 700,
    border: 'none',
  },
  secondary: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#fff',
  },
  danger: {
    background: 'rgba(255,51,102,0.15)',
    border: '1px solid #ff3366',
    color: '#ff3366',
  },
  success: {
    background: 'rgba(0,255,136,0.15)',
    border: '1px solid #00ff88',
    color: '#00ff88',
  },
  'outline-cyan': {
    background: 'rgba(0,245,255,0.08)',
    border: '1px solid #00f5ff',
    color: '#00f5ff',
  },
  'outline-green': {
    background: 'rgba(0,255,136,0.08)',
    border: '1px solid #00ff88',
    color: '#00ff88',
  },
  'outline-red': {
    background: 'rgba(255,51,102,0.08)',
    border: '1px solid #ff3366',
    color: '#ff3366',
  },
};

const sizeStyles: Record<Size, React.CSSProperties> = {
  sm: { padding: '8px 16px',  fontSize: '0.85rem' },
  md: { padding: '12px 24px', fontSize: '1rem'    },
  lg: { padding: '16px 32px', fontSize: '1.1rem'  },
};

const Spinner: React.FC<{ color?: string }> = ({ color = 'currentColor' }) => (
  <span
    style={{
      display: 'inline-block',
      width: '14px',
      height: '14px',
      border: `2px solid transparent`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      marginRight: '8px',
      verticalAlign: 'middle',
      flexShrink: 0,
    }}
    aria-hidden="true"
  />
);

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  disabled,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}) => {
  const [hovered, setHovered] = useState(false);

  const isDisabled = disabled || loading;

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    transition: 'opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
    outline: 'none',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    width: fullWidth ? '100%' : undefined,
    opacity: isDisabled ? 0.5 : hovered ? 0.9 : 1,
    transform: hovered && !isDisabled ? 'translateY(-2px)' : 'translateY(0)',
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...style,
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    setHovered(true);
    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    setHovered(false);
    onMouseLeave?.(e);
  };

  return (
    <button
      disabled={isDisabled}
      style={baseStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      {loading && (
        <Spinner
          color={variant === 'primary' ? '#000' : 'currentColor'}
        />
      )}
      {children}
    </button>
  );
};

export default Button;
