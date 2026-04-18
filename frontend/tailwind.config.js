/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'cyber-cyan': '#00f5ff',
        'cyber-magenta': '#ff00ff',
        'cyber-yellow': '#ffed4e',
        'cyber-green': '#00ff88',
        'cyber-red': '#ff3366',
        'bg-primary': '#0a0a1a',
        'bg-secondary': '#1a0a2e',
        'bg-tertiary': '#0f0a1f',
      },
      fontFamily: {
        orbitron: ['Orbitron', 'sans-serif'],
        rajdhani: ['Rajdhani', 'sans-serif'],
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease forwards',
        slideDown: 'slideDown 0.4s ease forwards',
        slideUp: 'slideUp 0.4s ease forwards',
        pulseGlow: 'pulseGlow 2s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        'bounce-custom': 'bounceCustom 1s ease infinite',
        spin: 'spin 1s linear infinite',
        gridPulse: 'gridPulse 4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 245, 255, 0.3)' },
          '50%': { boxShadow: '0 0 25px rgba(0, 245, 255, 0.8), 0 0 50px rgba(0, 245, 255, 0.4)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        bounceCustom: {
          '0%, 100%': { transform: 'translateY(0)', animationTimingFunction: 'cubic-bezier(0.8,0,1,1)' },
          '50%': { transform: 'translateY(-8px)', animationTimingFunction: 'cubic-bezier(0,0,0.2,1)' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        gridPulse: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.6' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 245, 255, 0.5)',
        'glow-magenta': '0 0 20px rgba(255, 0, 255, 0.5)',
        'glow-green': '0 0 20px rgba(0, 255, 136, 0.5)',
        'glow-red': '0 0 20px rgba(255, 51, 102, 0.5)',
        'glow-yellow': '0 0 20px rgba(255, 237, 78, 0.5)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
}
