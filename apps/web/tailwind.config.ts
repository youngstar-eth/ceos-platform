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
        /* Synthwave-Vaporwave palette */
        neon: {
          green: '#ff2d95',   /* hot pink (primary) */
          cyan: '#00d4ff',    /* electric cyan (secondary) */
          purple: '#b537f2',  /* electric purple (tertiary) */
          pink: '#ff6b9d',    /* soft pink (highlight) */
          yellow: '#f7a440',  /* warm amber (info/stats) */
          /* Legacy aliases */
          blue: '#3d9df2',
        },
        cyber: {
          dark: '#0d0221',
          deeper: '#070114',
          surface: '#1a0a3e',
          border: '#2d1b69',
          glow: '#ff2d95',
        },
        void: '#0d0221',
        'grid-dark': '#1a0a3e',
        chrome: {
          light: '#f0d4e8',
          mid: '#b080c0',
          dark: '#504060',
        },
        /* Legacy brand colors (backward compat) */
        brand: {
          purple: '#b537f2',
          blue: '#3d9df2',
          teal: '#ff2d95',
          'purple-light': '#d08cff',
          'blue-light': '#4de0ff',
          'teal-light': '#ff6bb8',
        },
        sunset: {
          orange: '#ff6b2b',
          pink: '#ff2d95',
          purple: '#7b2cbf',
          deep: '#0d0033',
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
          '0%, 100%': { boxShadow: '0 0 5px rgba(255,45,149,0.3), inset 0 0 5px rgba(255,45,149,0.05)' },
          '50%': { boxShadow: '0 0 20px rgba(255,45,149,0.5), inset 0 0 10px rgba(255,45,149,0.1)' },
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
        'sunset-gradient': 'linear-gradient(180deg, #ff2d95 0%, #b537f2 15%, #3d9df2 35%, #0d0033 55%, #0d0221 100%)',
        'neon-gradient': 'linear-gradient(135deg, #ff2d95 0%, #b537f2 50%, #00d4ff 100%)',
        'neon-gradient-subtle': 'linear-gradient(135deg, rgba(255,45,149,0.1) 0%, rgba(181,55,242,0.1) 50%, rgba(0,212,255,0.1) 100%)',
        /* Legacy */
        'brand-gradient': 'linear-gradient(135deg, #ff2d95 0%, #b537f2 50%, #00d4ff 100%)',
        'brand-gradient-subtle': 'linear-gradient(135deg, rgba(255,45,149,0.1) 0%, rgba(181,55,242,0.1) 50%, rgba(0,212,255,0.1) 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
