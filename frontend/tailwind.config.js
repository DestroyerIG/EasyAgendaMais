/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/contexts/**/*.{js,ts,jsx,tsx,mdx}',
    './src/hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cores antigas: usadas só por páginas fora do escopo do design system (landing, SuperAdmin).
        primary: '#FF7A00',
        dark: '#000000',
        'dark-light': '#1a1a1a',
        'dark-lighter': '#252525',
        // Tokens do DESIGN.md (valores em globals.css, claro em :root e escuro em .dark).
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        brand: token('brand'),
        'on-brand': token('on-brand'),
        'brand-text': token('brand-text'),
        whatsapp: token('whatsapp'),
        success: token('success'),
        'success-text': token('success-text'),
        warning: token('warning'),
        'warning-text': token('warning-text'),
        danger: token('danger'),
        'status-confirmed': token('status-confirmed'),
        scrim: token('scrim'),
        // Família Material 3 dos exports Stitch (ver globals.css).
        'surface-m3': token('surface-m3'),
        'surface-m3-low': token('surface-m3-low'),
        'whatsapp-chat': token('whatsapp-chat'),
        'whatsapp-bubble': token('whatsapp-bubble'),
        'brand-text-m3': token('brand-text-m3'),
        tertiary: token('tertiary'),
        'tertiary-container': token('tertiary-container'),
      },
      opacity: {
        12: '0.12',
      },
      borderRadius: {
        control: '10px',
        card: '16px',
      },
      fontWeight: {
        // Space Grotesk max=700, Plus Jakarta Sans max=800. Clamp black to 800
        // so Plus Jakarta Sans renders the true heaviest weight without browser synthesis.
        black: '800',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'shimmer': 'shimmer 2s infinite linear',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
