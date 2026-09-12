/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sb-bg': '#0a0a0f',
        'sb-card': '#15151f',
        'sb-border': '#2a2a3a',
        'sb-accent': '#8b5cf6',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite',
        'bounce-subtle': 'bounceSubtle 0.5s ease',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(139,92,246,0.3)' },
          '50%': { boxShadow: '0 0 30px rgba(139,92,246,0.6)' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.95)' },
        },
      },
    },
  },
  plugins: [],
}
