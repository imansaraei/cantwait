/** @type {import('tailwindcss').Config} */
export default {
  future: {
    hoverOnlyWhenSupported: true,
  },
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#F6F6F8',
        paper: '#FFFFFF',
        stone: {
          well: '#F1F1F4',
          border: 'rgba(0, 0, 0, 0.06)',
          muted: '#A1A1AA',
          sub: '#71717A',
          ink: '#111111',
        },
        coral: {
          DEFAULT: '#16A34A',
          hover: '#15803D',
          tint: '#DCFCE7',
        },
      },
      fontFamily: {
        serif: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
