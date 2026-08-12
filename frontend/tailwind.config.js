/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0B0C10',
          800: '#12141C',
          700: '#1A1D2A',
          600: '#25293B',
          500: '#32374E',
        },
        yt: {
          red: '#FF0000',
          darkRed: '#CC0000',
          lightRed: '#FF3333',
        },
        accent: {
          cyan: '#00F0FF',
          purple: '#8A2BE2',
          emerald: '#10B981',
          amber: '#F59E0B',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(255, 0, 0, 0.25)',
        'glow-cyan': '0 0 20px rgba(0, 240, 255, 0.25)',
        card: '0 8px 32px 0 rgba(0, 0, 0, 0.36)',
      }
    },
  },
  plugins: [],
}
