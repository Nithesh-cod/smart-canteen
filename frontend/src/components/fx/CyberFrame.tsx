import React from 'react';

/**
 * CyberFrame — was HUD corner brackets around cards. In the Warm-Glass redesign
 * the sci-fi brackets are removed; this is now a plain relative wrapper so the
 * soft rounded-glass card styling comes through cleanly. Props kept for compat.
 */
interface CyberFrameProps {
  children: React.ReactNode;
  active?: boolean;
  color?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const CyberFrame: React.FC<CyberFrameProps> = ({ children, className, style }) => (
  <div className={className} style={{ position: 'relative', ...style }}>
    {children}
  </div>
);

export default CyberFrame;
