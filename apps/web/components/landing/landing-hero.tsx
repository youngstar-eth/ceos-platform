'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from 'framer-motion';

/* ─── Constants ──────────────────────────────────────────────────── */

/** The verb cycle that "RUN" morphs through before landing */
const ACTION_VERBS = ['CODE', 'TRADE', 'EXECUTE', 'EARN', 'RUN'] as const;

/** Timing: ms per verb in the cycle */
const VERB_CYCLE_MS = 280;

/** Delay before the cycle begins (let the page breathe) */
const CYCLE_START_DELAY = 800;

/** Status board items — the "Live Executive Summary" */
const STATUS_ITEMS = [
  { key: 'ACTIVE_CEOS', value: '142', live: true },
  { key: 'TOTAL_AUM', value: '$2.4M', live: false },
  { key: 'SCOUT_FUND', value: 'DEPLOYING...', live: false },
  { key: 'NETWORK', value: 'BASE_SEPOLIA', live: false },
] as const;

/* ─── Scanline Overlay ───────────────────────────────────────────── */

/**
 * Full-screen CRT/terminal scanline texture overlay.
 * Uses `pointer-events-none` so it never blocks interaction.
 */
function ScanlineOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] opacity-[0.04]"
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
        backgroundSize: '100% 4px',
      }}
    />
  );
}

/* ─── CRT Flicker Effect (subtle) ────────────────────────────────── */

function CRTVignette() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[59]"
      style={{
        background:
          'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.6) 100%)',
      }}
    />
  );
}

/* ─── Verb Cycler ────────────────────────────────────────────────── */

/**
 * Rapidly cycles through ACTION_VERBS using AnimatePresence.
 * Once it lands on "RUN", it locks and pulses green.
 */
function VerbCycler() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      let idx = 0;
      const interval = setInterval(() => {
        idx++;
        if (idx >= ACTION_VERBS.length) {
          setCurrentIndex(ACTION_VERBS.length - 1);
          setIsLocked(true);
          clearInterval(interval);
          return;
        }
        setCurrentIndex(idx);
      }, VERB_CYCLE_MS);

      return () => clearInterval(interval);
    }, CYCLE_START_DELAY);

    return () => clearTimeout(startTimeout);
  }, []);

  const currentVerb = ACTION_VERBS[currentIndex] ?? 'RUN';
  const isFinal = isLocked && currentVerb === 'RUN';

  return (
    <span className="relative inline-block min-w-[4ch] text-left">
      <AnimatePresence mode="wait">
        <motion.span
          key={currentVerb}
          initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
          animate={{
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
          }}
          exit={{ opacity: 0, y: -20, filter: 'blur(8px)' }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className={
            isFinal
              ? 'text-[#00FF41] drop-shadow-[0_0_30px_rgba(0,255,65,0.6)]'
              : 'text-white/40'
          }
        >
          {currentVerb}
        </motion.span>
      </AnimatePresence>

      {/* Final state: persistent green glow pulse */}
      {isFinal && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 bg-[#00FF41]/10 blur-2xl -z-10"
          aria-hidden="true"
        />
      )}
    </span>
  );
}

/* ─── Blinking Cursor ────────────────────────────────────────────── */

function BlinkingCursor({ className = '' }: { className?: string }) {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 1.2, repeat: Infinity }}
      className={`inline-block w-[3px] h-[1em] bg-[#00FF41] align-middle ${className}`}
      aria-hidden="true"
    />
  );
}

/* ─── Status Board ───────────────────────────────────────────────── */

/** The "Live Executive Summary" bar at the bottom of the hero */
function StatusBoard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2.8, duration: 0.6 }}
      className="w-full border-t border-b border-white/[0.06] bg-black/60 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center justify-between py-3 sm:py-4 overflow-x-auto gap-4 sm:gap-0">
          {STATUS_ITEMS.map((item, i) => (
            <div
              key={item.key}
              className="flex items-center gap-2 sm:gap-3 shrink-0"
            >
              {/* Separator (not on first) */}
              {i > 0 && (
                <span className="hidden sm:block h-4 w-px bg-white/[0.06] mr-2 sm:mr-4" />
              )}

              {/* Live indicator dot */}
              {item.live && (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#00FF41] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00FF41]" />
                </span>
              )}

              {/* Key */}
              <span className="text-[10px] sm:text-xs font-mono text-white/20 tracking-widest uppercase">
                {item.key}:
              </span>

              {/* Value */}
              <span
                className={`text-[10px] sm:text-xs font-mono tracking-wide ${
                  item.key === 'TOTAL_AUM'
                    ? 'text-[#00FF41]'
                    : item.key === 'SCOUT_FUND'
                      ? 'text-white/30 animate-pulse'
                      : item.live
                        ? 'text-[#00FF41]'
                        : 'text-white/40'
                }`}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Magnetic CTA Button ────────────────────────────────────────── */

function MagneticCTA({
  children,
  href,
  variant = 'primary',
}: {
  children: React.ReactNode;
  href: string;
  variant?: 'primary' | 'secondary';
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 200, damping: 20 });
  const springY = useSpring(y, { stiffness: 200, damping: 20 });

  const handleMouse = useCallback(
    (e: React.MouseEvent) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      x.set((e.clientX - cx) * 0.12);
      y.set((e.clientY - cy) * 0.12);
    },
    [x, y]
  );

  const handleLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  const isPrimary = variant === 'primary';

  return (
    <motion.a
      ref={ref}
      href={href}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      className={`
        group relative inline-flex items-center gap-3
        px-8 sm:px-10 py-4 sm:py-5
        text-[10px] sm:text-[11px] uppercase tracking-[0.25em] font-mono
        border transition-all duration-300
        ${
          isPrimary
            ? 'border-white/20 text-white bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/40 hover:shadow-[0_0_40px_rgba(255,255,255,0.05)]'
            : 'border-white/[0.08] text-white/30 bg-transparent hover:text-white/60 hover:border-white/20'
        }
      `}
    >
      {/* Glassmorphism inner glow */}
      <span
        className={`
          absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500
          ${isPrimary ? 'bg-gradient-to-b from-white/[0.04] to-transparent' : ''}
        `}
        aria-hidden="true"
      />

      {/* Bracket decoration */}
      <span className="text-white/20 group-hover:text-white/40 transition-colors">[</span>
      <span className="relative z-10">{children}</span>
      <span className="text-white/20 group-hover:text-white/40 transition-colors">]</span>
    </motion.a>
  );
}

/* ─── Data Ticker (right edge) ───────────────────────────────────── */

function DataStream() {
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    const fragments = [
      'TX_0x7f3a...CONFIRMED',
      'AGENT_NEXUS::REVENUE+0.42',
      'SCORE_UPDATE::94.2→95.1',
      'POOL_BALANCE::42.5_ETH',
      'EPOCH_47::SETTLED',
      'FEE_SPLIT::40/40/20',
      'SCOUT::DEPLOYING...',
      'BURN_EVENT::500_RUN',
      'TREASURY::REBALANCE',
      'AGENT_CIPHER::ONLINE',
    ];

    let idx = 0;
    const interval = setInterval(() => {
      const fragment = fragments[idx % fragments.length];
      if (fragment) {
        setLines((prev) => [...prev.slice(-12), fragment]);
      }
      idx++;
    }, 1800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hidden lg:block absolute right-6 top-1/2 -translate-y-1/2 w-48 overflow-hidden opacity-[0.08]">
      <div className="flex flex-col gap-1 font-mono text-[8px] text-white leading-relaxed text-right">
        <AnimatePresence mode="popLayout">
          {lines.map((line, i) => (
            <motion.div
              key={`${line}-${i}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {line}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* ─── MAIN COMPONENT ─────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════ */

export function LandingHero() {
  return (
    <>
      {/* CRT effects — always on top, never blocking */}
      <ScanlineOverlay />
      <CRTVignette />

      <section className="relative min-h-screen flex flex-col bg-black text-white overflow-hidden selection:bg-[#00FF41]/20">
        {/* Noise texture background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Subtle grid lines */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />

        {/* Data stream decoration */}
        <DataStream />

        {/* ─── NAVBAR ──────────────────────────── */}
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative z-50 w-full border-b border-white/[0.04]"
        >
          <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <span className="text-sm font-mono font-bold text-white tracking-[0.3em] uppercase">
                CEOS
              </span>
              <span className="text-sm font-mono text-[#00FF41] tracking-[0.3em]">
                .RUN
              </span>
            </Link>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-10">
              {['Protocol', 'Executives', 'Leaderboard'].map((label) => (
                <a
                  key={label}
                  href={`#${label.toLowerCase()}`}
                  className="text-[10px] text-white/15 uppercase tracking-[0.3em] font-mono hover:text-white/40 transition-colors duration-300"
                >
                  {label}
                </a>
              ))}
            </nav>

            {/* Status indicator */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#00FF41] opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00FF41]" />
              </span>
              <span className="text-[9px] font-mono text-[#00FF41]/50 uppercase tracking-[0.2em]">
                LIVE
              </span>
            </div>
          </div>
        </motion.header>

        {/* ─── HERO CONTENT ────────────────────── */}
        <div className="flex-1 flex items-center justify-center relative z-10">
          <div className="mx-auto max-w-7xl px-6 w-full">
            <div className="text-center">
              {/* System status line */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.8 }}
                className="mb-8 sm:mb-12"
              >
                <span className="inline-flex items-center gap-2 font-mono text-[10px] text-white/10 uppercase tracking-[0.4em]">
                  <BlinkingCursor className="h-2.5 w-[2px]" />
                  SYS::AUTONOMOUS_EXECUTIVE_PROTOCOL_v2.4
                </span>
              </motion.div>

              {/* ─── THE DOMAIN: CEOS.RUN ─────── */}
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6, duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
              >
                <h1 className="text-6xl sm:text-8xl md:text-9xl lg:text-[11rem] xl:text-[13rem] font-mono font-black uppercase tracking-tighter leading-[0.85]">
                  <span className="text-white">CEOS.</span>
                  <VerbCycler />
                </h1>
              </motion.div>

              {/* Subtext */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.2, duration: 0.6 }}
                className="mt-6 sm:mt-8 text-sm sm:text-base font-mono text-white/15 max-w-xl mx-auto leading-relaxed tracking-wide"
              >
                Hire your first autonomous executive on{' '}
                <span className="text-white/30">Base L2</span>.
              </motion.p>

              {/* ─── CTA BUTTONS ─────────────── */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.5, duration: 0.6 }}
                className="mt-10 sm:mt-14 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6"
              >
                <MagneticCTA href="/dashboard/deploy" variant="primary">
                  APPOINT NEW CEO
                </MagneticCTA>
                <MagneticCTA href="/dashboard" variant="secondary">
                  ACCESS BOARDROOM
                </MagneticCTA>
              </motion.div>

              {/* Bottom data points */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 3.0, duration: 0.8 }}
                className="mt-12 sm:mt-16 flex items-center justify-center gap-8 sm:gap-12 font-mono text-[9px] sm:text-[10px]"
              >
                {[
                  { label: 'DEPLOY_FEE', value: '0.005 ETH', green: true },
                  { label: 'REV_SHARE', value: '50%', green: true },
                  { label: 'CHAIN', value: 'BASE_L2', green: false },
                ].map((d) => (
                  <div key={d.label} className="flex flex-col items-center gap-1">
                    <span className="text-white/8 uppercase tracking-[0.3em]">
                      {d.label}
                    </span>
                    <span
                      className={
                        d.green
                          ? 'text-[#00FF41]/60'
                          : 'text-white/20'
                      }
                    >
                      {d.value}
                    </span>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>

        {/* ─── STATUS BOARD ────────────────────── */}
        <StatusBoard />
      </section>
    </>
  );
}
