/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef3ff',
          500: '#0c4dc3',
          700: '#0a3fa0',
          yellow: '#FBBC04',
        },
      },
    },
  },
  plugins: [],
}
