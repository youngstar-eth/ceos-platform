import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
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
        /* Vaporwave palette — primary tones */
        neon: {
          pink: '#ff71ce',
          cyan: '#01cdfe',
          purple: '#b967ff',
          blue: '#7700ff',
          yellow: '#ffd319',
          mint: '#05ffa1',
        },
        /* Vaporwave pastels */
        vapor: {
          lavender: '#c774e8',
          coral: '#ff6ad5',
          sky: '#94d0ff',
          lilac: '#ad8cff',
          peach: '#ffb3ba',
          seafoam: '#8affc1',
        },
        sunset: {
          orange: '#ff6b35',
          pink: '#ff0099',
          purple: '#7b2cbf',
          deep: '#2d1b69',
        },
        void: '#0a0118',
        'grid-dark': '#1a0a2e',
        chrome: {
          light: '#e8e8e8',
          mid: '#a0a0a0',
          dark: '#4a4a4a',
        },
        /* Legacy brand colors (kept for backward compat) */
        brand: {
          purple: '#b967ff',
          blue: '#01cdfe',
          teal: '#05ffa1',
          'purple-light': '#c774e8',
          'blue-light': '#94d0ff',
          'teal-light': '#8affc1',
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
        /* Vaporwave keyframes */
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
        'vapor-breathe': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.05)' },
        },
        'memphis-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
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
        'vapor-breathe': 'vapor-breathe 6s ease-in-out infinite',
        'memphis-spin': 'memphis-spin 30s linear infinite',
      },
      backgroundImage: {
        'sunset-gradient': 'linear-gradient(180deg, #ffd319 0%, #ff6b35 15%, #ff71ce 35%, #b967ff 55%, #2d1b69 75%, #0a0118 100%)',
        'neon-gradient': 'linear-gradient(135deg, #ff71ce 0%, #b967ff 50%, #01cdfe 100%)',
        'neon-gradient-subtle': 'linear-gradient(135deg, rgba(255,113,206,0.1) 0%, rgba(185,103,255,0.1) 50%, rgba(1,205,254,0.1) 100%)',
        'vapor-gradient': 'linear-gradient(135deg, #ff6ad5 0%, #c774e8 25%, #ad8cff 50%, #8795e8 75%, #94d0ff 100%)',
        'vapor-gradient-soft': 'linear-gradient(135deg, rgba(255,106,213,0.08) 0%, rgba(199,116,232,0.06) 25%, rgba(173,140,255,0.08) 50%, rgba(135,149,232,0.06) 75%, rgba(148,208,255,0.08) 100%)',
        'seapunk-gradient': 'linear-gradient(135deg, #01cdfe 0%, #05ffa1 50%, #01cdfe 100%)',
        /* Legacy */
        'brand-gradient': 'linear-gradient(135deg, #ff71ce 0%, #b967ff 50%, #01cdfe 100%)',
        'brand-gradient-subtle': 'linear-gradient(135deg, rgba(255,113,206,0.1) 0%, rgba(185,103,255,0.1) 50%, rgba(1,205,254,0.1) 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
