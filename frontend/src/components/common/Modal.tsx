import React, { useEffect, useState } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = '600px',
}) => {
  const [closeHovered, setCloseHovered] = useState(false);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(15px)',
    WebkitBackdropFilter: 'blur(15px)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'fadeIn 0.25s ease forwards',
  };

  const contentStyle: React.CSSProperties = {
    background: 'rgba(26,10,46,0.97)',
    backdropFilter: 'blur(30px)',
    WebkitBackdropFilter: 'blur(30px)',
    border: '1px solid rgba(0,245,255,0.2)',
    borderRadius: '25px',
    padding: '35px',
    width: '90%',
    maxWidth,
    maxHeight: '85vh',
    overflowY: 'auto',
    position: 'relative',
    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(0,245,255,0.3) transparent',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: title ? '28px' : '0',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: "'Orbitron', monospace",
    fontWeight: 700,
    fontSize: '1.3rem',
    background: 'linear-gradient(135deg, #00f5ff, #ff00ff)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  const closeBtnStyle: React.CSSProperties = {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: closeHovered ? 'rgba(255,51,102,0.35)' : 'rgba(255,51,102,0.15)',
    border: '1px solid rgba(255,51,102,0.5)',
    color: '#ff3366',
    fontSize: '1.1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
    transform: closeHovered ? 'rotate(90deg)' : 'rotate(0deg)',
    boxShadow: closeHovered ? '0 0 12px rgba(255,51,102,0.5)' : 'none',
    outline: 'none',
    lineHeight: 1,
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div style={overlayStyle} onClick={handleOverlayClick}>
      <div style={contentStyle}>
        {(title || true) && (
          <div style={headerStyle}>
            {title ? (
              <h2 style={titleStyle}>{title}</h2>
            ) : (
              <span />
            )}
            <button
              style={closeBtnStyle}
              onClick={onClose}
              onMouseEnter={() => setCloseHovered(true)}
              onMouseLeave={() => setCloseHovered(false)}
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

export default Modal;
