import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
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
    },
  },
  plugins: [],
}
