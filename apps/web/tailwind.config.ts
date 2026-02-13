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
        /* Synthwave / Vaporwave palette */
        neon: {
          pink: '#ff2a6d',
          cyan: '#05d9e8',
          purple: '#d300c5',
          blue: '#7700ff',
          yellow: '#ffd319',
        },
        sunset: {
          orange: '#ff6b35',
          pink: '#ff0099',
          purple: '#7b2cbf',
          deep: '#240046',
        },
        void: '#0d0221',
        'grid-dark': '#120458',
        chrome: {
          light: '#e8e8e8',
          mid: '#a0a0a0',
          dark: '#4a4a4a',
        },
        /* Legacy brand colors (kept for backward compat) */
        brand: {
          purple: '#7c3aed',
          blue: '#3b82f6',
          teal: '#14b8a6',
          'purple-light': '#a78bfa',
          'blue-light': '#60a5fa',
          'teal-light': '#5eead4',
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
        /* Synthwave keyframes */
        'neon-pulse': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.8', filter: 'brightness(1.3)' },
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
      },
      backgroundImage: {
        'sunset-gradient': 'linear-gradient(180deg, #ffd319 0%, #ff6b35 15%, #ff0099 35%, #7b2cbf 55%, #240046 75%, #0d0221 100%)',
        'neon-gradient': 'linear-gradient(135deg, #ff2a6d 0%, #d300c5 50%, #05d9e8 100%)',
        'neon-gradient-subtle': 'linear-gradient(135deg, rgba(255,42,109,0.1) 0%, rgba(211,0,197,0.1) 50%, rgba(5,217,232,0.1) 100%)',
        /* Legacy */
        'brand-gradient': 'linear-gradient(135deg, #ff2a6d 0%, #d300c5 50%, #05d9e8 100%)',
        'brand-gradient-subtle': 'linear-gradient(135deg, rgba(255,42,109,0.1) 0%, rgba(211,0,197,0.1) 50%, rgba(5,217,232,0.1) 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
