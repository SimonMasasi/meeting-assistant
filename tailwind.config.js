import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Primary ─────────────────────────────────────────────
        // Blue – main actions, CTAs, links, focus rings
        primary: colors.blue,

        // ── Secondary ───────────────────────────────────────────
        // Indigo – depth, gradients, active nav states
        secondary: colors.indigo,

        // ── Accent ──────────────────────────────────────────────
        // Violet – badges, highlights, secondary actions
        accent: colors.violet,

        // ── Neutrals ────────────────────────────────────────────
        // Slate – text, borders, backgrounds, cards
        neutral: colors.slate,

        // ── Semantic states ─────────────────────────────────────
        success: colors.emerald,
        warning: colors.amber,
        danger:  colors.red,
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        'fade-in-up': 'fade-in-up 0.35s ease-out both',
        'scale-in': 'scale-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
}
