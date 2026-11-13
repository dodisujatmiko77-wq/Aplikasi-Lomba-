import animate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        navy: { 50: '#eef3fb', 100: '#d9e3f5', 200: '#b3c6ea', 300: '#7f9ed8', 400: '#4a72c0', 500: '#2a52a3', 600: '#1c3d84', 700: '#152f69', 800: '#0f2350', 900: '#0b1b3f', 950: '#060f26' },
        electric: { 400: '#4d9bff', 500: '#1f7bff', 600: '#0d63e6' },
        flame: { 400: '#fb923c', 500: '#f97316', 600: '#ea580c' },
        gold: '#f5c542',
        silver: '#c9d1dc',
        bronze: '#d08a4a',
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      boxShadow: {
        soft: '0 1px 2px rgba(11,27,63,.04), 0 8px 24px -12px rgba(11,27,63,.14)',
        glow: '0 0 0 1px rgba(77,155,255,.35), 0 0 40px -8px rgba(31,123,255,.55)',
      },
      keyframes: {
        'pulse-ring': { '0%': { transform: 'scale(.9)', opacity: '.7' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
      },
      animation: { 'pulse-ring': 'pulse-ring 1.4s ease-out infinite' },
    },
  },
  plugins: [animate],
}
