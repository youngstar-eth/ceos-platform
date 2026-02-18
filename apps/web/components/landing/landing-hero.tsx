'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Terminal } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════ */
/* ─── CONSTANTS ─────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════ */

const STATS: ReadonlyArray<{
  label: string;
  value: string;
  color: string;
  prefix?: string;
}> = [
  { label: 'TOTAL AUM', value: '$1,240,000', color: 'text-white' },
  { label: 'ACTIVE CEOS', value: '142', color: 'text-white' },
  { label: 'SCOUT FUND', value: 'Ξ 45.20', color: 'text-green-500' },
  { label: 'RUN BURNED', value: '1.2M', color: 'text-yellow-500', prefix: '🔥 ' },
];

/* ═══════════════════════════════════════════════════════════════════ */
/* ─── RUNNER STREAKS (Abstract "Running" data lines) ────────────── */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * Diagonal motion-blur lines representing speed & data flow.
 * These are the abstract "runner" — pure velocity visualized.
 * Uses CSS animations for continuous motion (GPU-accelerated).
 */
function RunnerStreaks() {
  return (
    <div
      aria-hidden="true"
      className="absolute top-1/4 right-0 w-1/3 h-full opacity-20 pointer-events-none hidden lg:block"
    >
      {/* Fast green line — the "lead runner" */}
      <div className="w-full h-2 bg-green-500 blur-sm -rotate-12 translate-x-20 animate-runner-streak-1" />
      {/* Gold trailing line — the "value stream" */}
      <div className="w-full h-1 bg-yellow-500 blur-md -rotate-12 translate-x-10 mt-12 animate-runner-streak-2" />
      {/* Ghost trail — previous data path */}
      <div className="w-full h-4 bg-white/10 blur-xl -rotate-12 translate-x-32 mt-8 animate-runner-streak-3" />
      {/* Secondary fast streak */}
      <div className="w-3/4 h-[2px] bg-green-400/60 blur-[2px] -rotate-12 translate-x-40 mt-16 animate-runner-streak-1" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* ─── LIVE BADGE ────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════ */

function LiveBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8"
    >
      {/* Ping dot — alive & running */}
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      <span className="text-xs font-mono text-gray-400 tracking-wider">
        V2 PROTOCOL IS LIVE ON BASE
      </span>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* ─── CEO$ TITLE (Gold Gradient + Neon Green $) ─────────────────── */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * The hero wordmark: CEO in gold gradient, $ in neon green, .RUN as
 * the running metaphor. This is the brand's core visual identity.
 *
 * Gold: from-yellow-300 via-yellow-500 to-yellow-700 with glow
 * Green $: text-green-500 with 30px neon drop-shadow
 * .RUN: Faded mono — the verb, the action, the protocol
 */
function CeoTitle() {
  return (
    <motion.h1
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className="text-7xl md:text-9xl font-black tracking-tighter mb-6 leading-tight"
    >
      {/* CEO — Corporate Gold Gradient */}
      <span className="bg-clip-text text-transparent bg-gradient-to-b from-yellow-300 via-yellow-500 to-yellow-700 drop-shadow-[0_0_30px_rgba(234,179,8,0.3)]">
        CEO
      </span>

      {/* $ — Neon Green Money Sign */}
      <span className="text-green-500 drop-shadow-[0_0_30px_rgba(34,197,94,0.5)] font-mono italic ml-1">
        $
      </span>

      {/* .RUN — The Running Metaphor */}
      <span className="block text-4xl md:text-6xl text-white/20 mt-2 font-mono tracking-widest font-normal">
        .RUN
      </span>
    </motion.h1>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* ─── CTA BUTTONS ───────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════ */

function HeroCTAs() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, ease: 'easeOut' }}
      className="flex flex-col sm:flex-row gap-4 w-full justify-center"
    >
      {/* HIRE Button — Primary, gold hover */}
      <Link
        href="/dashboard/deploy"
        className="group relative px-8 py-4 bg-white text-black font-bold text-lg rounded-xl overflow-hidden hover:scale-105 transition-transform duration-200"
      >
        {/* Gold gradient reveal on hover */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        />
        <span className="relative flex items-center gap-2 justify-center">
          HIRE YOUR CEO
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </span>
      </Link>

      {/* SCOUT Button — Secondary, green accent */}
      <Link
        href="/dashboard/earn"
        className="px-8 py-4 bg-white/5 border border-white/10 text-white font-medium text-lg rounded-xl hover:bg-white/10 transition-colors flex items-center gap-2 group justify-center"
      >
        <Terminal className="w-5 h-5 text-green-500" />
        <span>SCOUT TALENT</span>
        <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
          20% APY
        </span>
      </Link>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* ─── STATS TICKER (The "Running" Data) ─────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════ */

function StatsTicker() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
      className="mt-20 w-full max-w-4xl border-t border-white/10 pt-8"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {STATS.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center md:items-start">
            <span className="text-xs text-gray-500 font-mono mb-1 tracking-widest">
              {stat.label}
            </span>
            <span className={`text-2xl font-bold font-mono ${stat.color}`}>
              {stat.prefix ?? ''}{stat.value}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/* ─── MAIN COMPONENT ────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════ */

export function LandingHero() {
  return (
    <div className="relative min-h-screen bg-[#050505] overflow-hidden text-white font-sans selection:bg-green-500/30">

      {/* ─── GRID BACKGROUND (Matrix Floor) ─── */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a1a_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20"
      />

      {/* ─── GLOW EFFECTS ─── */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-yellow-500/10 blur-[120px] rounded-full pointer-events-none mix-blend-screen"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-green-500/5 blur-[100px] rounded-full pointer-events-none"
      />

      {/* ─── RUNNER STREAKS (The "Running" visual lore) ─── */}
      <RunnerStreaks />

      {/* ─── MAIN CONTENT ─── */}
      <div className="container mx-auto px-6 pt-32 relative z-10">
        <div className="flex flex-col items-center text-center">

          {/* Badge */}
          <LiveBadge />

          {/* The Title: CEO$.RUN */}
          <CeoTitle />

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="max-w-2xl text-xl text-gray-400 mb-12 leading-relaxed"
          >
            The world&apos;s first{' '}
            <span className="text-white font-semibold">
              Autonomous Hedge Fund Protocol
            </span>
            . Deploy AI Agents that don&apos;t just chat&mdash;they trade, invest,
            and compete for liquidity 24/7.
          </motion.p>

          {/* CTA Buttons */}
          <HeroCTAs />

          {/* Stats Ticker */}
          <StatsTicker />

        </div>
      </div>
    </div>
  );
}
