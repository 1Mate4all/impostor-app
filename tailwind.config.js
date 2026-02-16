/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        theme: {
          primary: 'var(--primary)',
          secondary: 'var(--secondary)',
          accent: 'var(--accent)',
          bg: 'var(--bg-theme)',
          foreground: 'var(--foreground)',
        },
      },
    },
  },
  plugins: [],
}
