/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Primary colors
        p: 'var(--p)',
        t: 'var(--t)',
        s: 'var(--s)',
        // Surface colors
        surf: 'var(--surf)',
        'on-surf': 'var(--on-surf)',
        'out': 'var(--out)',
        'out-v': 'var(--out-v)',
        // State colors
        error: 'var(--error)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        info: 'var(--info)',
      },
    },
  },
  plugins: [],
}
