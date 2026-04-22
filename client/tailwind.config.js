// client/tailwind.config.js
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  safelist: [
    'bg-primary', 'bg-secondary', 'bg-accent', 'bg-danger',
    'bg-bg', 'bg-surface', 'bg-surface-2',
    'bg-border', 'bg-border-strong',
    'bg-text', 'bg-text-muted', 'bg-text-dim',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // tokens dynamiques via CSS vars
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-hover': 'rgb(var(--primary-hover) / <alpha-value>)',
        'primary-ghost': 'rgb(var(--primary-ghost) / <alpha-value>)',
        'primary-border': 'rgb(var(--primary-border) / <alpha-value>)',
        secondary: 'rgb(var(--secondary) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        'text-dim': 'rgb(var(--text-dim) / <alpha-value>)',
        // saisonniers CONSERVES
        'christmas-red': '#DC2626',
        'christmas-green': '#15803D',
        'christmas-gold': '#EAB308',
        'winter-blue': '#3B82F6',
        'spring-pink': '#EC4899',
        'spring-green': '#22C55E',
        'spring-yellow': '#FDE68A',
        'spring-sky': '#38BDF8',
      },
      borderRadius: {
        sm: '8px',
        md: '10px',
        lg: '12px',
        xl: '20px',
        full: '9999px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      spacing: {
        '4.5': '18px',
        '5.5': '22px',
      },
      fontSize: {
        xs: ['12px', { lineHeight: '1.5' }],
        sm: ['13.5px', { lineHeight: '1.5' }],
        base: ['14px', { lineHeight: '1.6' }],
        md: ['15px', { lineHeight: '1.6' }],
        lg: ['17px', { lineHeight: '1.5' }],
        xl: ['20px', { lineHeight: '1.3' }],
        '2xl': ['24px', { lineHeight: '1.25' }],
        '3xl': ['32px', { lineHeight: '1.15' }],
        '4xl': ['44px', { lineHeight: '1.1' }],
      },
      letterSpacing: {
        tight: '-0.025em',
        snug: '-0.01em',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(.4, 0, .2, 1)',
      },
      transitionDuration: {
        150: '150ms',
        200: '200ms',
        300: '300ms',
      },
      maxWidth: {
        container: '1280px',
      },
    },
  },
  plugins: [
    function({ addVariant }) {
      addVariant('christmas', ':root.christmas &');
      addVariant('spring', ':root.spring &');
    }
  ],
};
