/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#9de600',
          hover: '#a6f900',
          light: '#b3fb45',
          dark: '#85b700',
          subtle: 'rgba(157, 230, 0, 0.12)',
        },
        surface: {
          base: '#0c0e12',
          card: '#13161b',
          elevated: '#1a1e26',
          border: '#22262f',
          borderLight: '#373a41',
        },
        txt: {
          primary: '#f7f7f7',
          secondary: '#cecfd2',
          muted: '#85888e',
          dim: '#61656c',
        },
        danger: {
          DEFAULT: '#f04438',
          dark: '#d92d20',
          subtle: 'rgba(240, 68, 56, 0.12)',
        },
        dark: {
          800: '#1a1e26',
          900: '#13161b',
          950: '#0c0e12',
        }
      },
      boxShadow: {
        'lime': '0 0 20px rgba(157, 230, 0, 0.25)',
        'lime-lg': '0 0 35px rgba(157, 230, 0, 0.35)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.45)',
      },
      animation: {
        'marquee': 'marquee 25s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}

