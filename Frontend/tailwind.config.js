/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bgBase: '#F1F5F9',
        bgSurface: '#FFFFFF',
        textMain: '#0F172A',
        textMuted: '#64748B',
        accent: '#2563EB',
        accentHover: '#1D4ED8',
        loss: '#EF4444',
        lossBg: '#FEE2E2',
        win: '#10B981',
        winBg: '#D1FAE5',
        hit: '#F59E0B',
        hitBg: '#FEF3C7',
        borderLight: '#E2E8F0',
        neutral: '#94A3B8',
      },
      boxShadow: {
        'subtle': '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.02)',
        'hover': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(37, 99, 235, 0.15)',
      },
    },
  },
  plugins: [],
}
