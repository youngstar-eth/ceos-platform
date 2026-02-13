import type { Config } from 'tailwindcss';
import path from 'path';

const webDir = path.resolve(__dirname);

const config: Config = {
  darkMode: 'class',
  content: [
    path.join(webDir, 'app/**/*.{ts,tsx}'),
    path.join(webDir, 'components/**/*.{ts,tsx}'),
    path.join(webDir, 'hooks/**/*.{ts,tsx}'),
    path.join(webDir, 'lib/**/*.{ts,tsx}'),
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        orbitron: ['var(--font-orbitron)', 'monospace'],
        pixel: ['var(--font-pixel)', 'monospace'],
        rajdhani: ['var(--font-rajdhani)', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        /* Cybercore palette */
        neon: {
          green: '#00ff9d',
          cyan: '#00d4ff',
          purple: '#7b61ff',
          pink: '#ff0066',
          yellow: '#ffcc00',
          /* Legacy aliases */
          blue: '#00d4ff',
        },
        cyber: {
          dark: '#050a14',
          deeper: '#020608',
          surface: '#0a1628',
          border: '#112240',
          glow: '#00ff9d',
        },
        void: '#050a14',
        'grid-dark': '#0a1628',
        chrome: {
          light: '#e0f0e8',
          mid: '#80b0a0',
          dark: '#405050',
        },
        /* Legacy brand colors (backward compat) */
        brand: {
          purple: '#7b61ff',
          blue: '#00d4ff',
          teal: '#00ff9d',
          'purple-light': '#9d8cff',
          'blue-light': '#4de0ff',
          'teal-light': '#66ffbe',
        },
        sunset: {
          orange: '#ff6b35',
          pink: '#ff0066',
          purple: '#7b2cbf',
          deep: '#1a0044',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        /* Cybercore keyframes */
        'neon-pulse': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.8', filter: 'brightness(1.4)' },
        },
        'glitch-1': {
          '0%': { clipPath: 'inset(40% 0 61% 0)' },
          '10%': { clipPath: 'inset(92% 0 1% 0)' },
          '20%': { clipPath: 'inset(43% 0 1% 0)' },
          '30%': { clipPath: 'inset(25% 0 58% 0)' },
          '40%': { clipPath: 'inset(54% 0 7% 0)' },
          '50%': { clipPath: 'inset(58% 0 43% 0)' },
          '60%': { clipPath: 'inset(70% 0 7% 0)' },
          '70%': { clipPath: 'inset(31% 0 61% 0)' },
          '80%': { clipPath: 'inset(46% 0 35% 0)' },
          '90%': { clipPath: 'inset(80% 0 2% 0)' },
          '100%': { clipPath: 'inset(40% 0 61% 0)' },
        },
        'glitch-2': {
          '0%': { clipPath: 'inset(25% 0 58% 0)' },
          '10%': { clipPath: 'inset(54% 0 7% 0)' },
          '20%': { clipPath: 'inset(58% 0 43% 0)' },
          '30%': { clipPath: 'inset(40% 0 61% 0)' },
          '40%': { clipPath: 'inset(92% 0 1% 0)' },
          '50%': { clipPath: 'inset(70% 0 7% 0)' },
          '60%': { clipPath: 'inset(31% 0 61% 0)' },
          '70%': { clipPath: 'inset(46% 0 35% 0)' },
          '80%': { clipPath: 'inset(80% 0 2% 0)' },
          '90%': { clipPath: 'inset(43% 0 1% 0)' },
          '100%': { clipPath: 'inset(25% 0 58% 0)' },
        },
        'grid-scroll': {
          '0%': { transform: 'perspective(500px) rotateX(60deg) translateY(0)' },
          '100%': { transform: 'perspective(500px) rotateX(60deg) translateY(60px)' },
        },
        'chrome-shine': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        flicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: '1' },
          '20%, 24%, 55%': { opacity: '0.4' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'cyber-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0,255,157,0.3), inset 0 0 5px rgba(0,255,157,0.05)' },
          '50%': { boxShadow: '0 0 20px rgba(0,255,157,0.5), inset 0 0 10px rgba(0,255,157,0.1)' },
        },
        'data-flow': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-slow': 'pulse-slow 2s ease-in-out infinite',
        shimmer: 'shimmer 2s infinite',
        'fade-in-up': 'fade-in-up 0.6s ease-out forwards',
        'fade-in-down': 'fade-in-down 0.5s ease-out forwards',
        'scale-in': 'scale-in 0.5s ease-out forwards',
        'slide-in-left': 'slide-in-left 0.6s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.6s ease-out forwards',
        float: 'float 3s ease-in-out infinite',
        'spin-slow': 'spin-slow 20s linear infinite',
        'neon-pulse': 'neon-pulse 2s ease-in-out infinite',
        'glitch-1': 'glitch-1 2s infinite linear',
        'glitch-2': 'glitch-2 2s infinite linear reverse',
        'grid-scroll': 'grid-scroll 2s linear infinite',
        'chrome-shine': 'chrome-shine 4s linear infinite',
        flicker: 'flicker 3s linear infinite',
        scanline: 'scanline 8s linear infinite',
        'cyber-pulse': 'cyber-pulse 2s ease-in-out infinite',
        'data-flow': 'data-flow 3s linear infinite',
      },
      backgroundImage: {
        'sunset-gradient': 'linear-gradient(180deg, #00ff9d 0%, #00d4ff 15%, #7b61ff 35%, #1a0044 55%, #050a14 100%)',
        'neon-gradient': 'linear-gradient(135deg, #00ff9d 0%, #00d4ff 50%, #7b61ff 100%)',
        'neon-gradient-subtle': 'linear-gradient(135deg, rgba(0,255,157,0.1) 0%, rgba(0,212,255,0.1) 50%, rgba(123,97,255,0.1) 100%)',
        /* Legacy */
        'brand-gradient': 'linear-gradient(135deg, #00ff9d 0%, #00d4ff 50%, #7b61ff 100%)',
        'brand-gradient-subtle': 'linear-gradient(135deg, rgba(0,255,157,0.1) 0%, rgba(0,212,255,0.1) 50%, rgba(123,97,255,0.1) 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
