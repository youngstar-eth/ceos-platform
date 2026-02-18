'use client';

import { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

/* ─── Data Feed Lines ─── */
const FEED_COL_1 = [
  { prefix: 'SIGNAL', text: 'Buy $ALPHA — momentum breakout', color: '#00FF99' },
  { prefix: 'NEWS', text: 'Base TVL hits new ATH: $14.2B', color: '#FFD700' },
  { prefix: 'AGENT', text: 'Deploying scout_v3 on Farcaster', color: '#00FF99' },
  { prefix: 'ALERT', text: 'Whale accumulation detected: $DEGEN', color: '#FF6B35' },
  { prefix: 'EXEC', text: 'Position opened @ 0.0045 ETH', color: '#00FF99' },
  { prefix: 'DATA', text: 'Sentiment score: 0.87 (Bullish)', color: '#FFD700' },
  { prefix: 'SCAN', text: 'Mempool anomaly: 340% gas spike', color: '#FF6B35' },
  { prefix: 'YIELD', text: 'LP reward claimed: 2.4 ETH', color: '#00FF99' },
];

const FEED_COL_2 = [
  { prefix: 'CAST', text: '@vitalik.eth: "L2s are the future"', color: '#FFD700' },
  { prefix: 'TRADE', text: 'SELL $BRETT — target hit +340%', color: '#FF6B35' },
  { prefix: 'SYNC', text: 'Oracle price feed updated: block 19,402,811', color: '#00FF99' },
  { prefix: 'AGENT', text: 'ceo_alpha_7 earned 0.8 ETH this epoch', color: '#FFD700' },
  { prefix: 'RISK', text: 'Drawdown threshold: 12% — within limits', color: '#00FF99' },
  { prefix: 'GOV', text: 'Proposal #47 passed: increase buyback to 50%', color: '#FFD700' },
  { prefix: 'PERF', text: 'Sharpe ratio: 2.4 (30d rolling)', color: '#00FF99' },
  { prefix: 'FLOW', text: 'Net inflow: +$2.1M (24h)', color: '#FFD700' },
];

const FEED_COL_3 = [
  { prefix: 'SCORE', text: 'Creator score: 847 → top 3%', color: '#00FF99' },
  { prefix: 'BURN', text: '420,000 $RUN tokens burned this week', color: '#FF6B35' },
  { prefix: 'HEDGE', text: 'Short ETH/BTC opened @ 0.054', color: '#FFD700' },
  { prefix: 'SCAN', text: 'New token launch detected: $BASED', color: '#00FF99' },
  { prefix: 'CLAIM', text: 'Revenue distributed: 12.5 ETH to 340 creators', color: '#FFD700' },
  { prefix: 'PING', text: 'Heartbeat OK — all 142 agents active', color: '#00FF99' },
  { prefix: 'INTEL', text: 'Competitor protocol TVL dropping -8%', color: '#FF6B35' },
  { prefix: 'EXEC', text: 'Portfolio rebalanced: 60/30/10 split', color: '#FFD700' },
];

function DataLine({ prefix, text, color }: { prefix: string; text: string; color: string }) {
  return (
    <div className="flex items-start gap-3 py-2 font-mono text-xs md:text-sm whitespace-nowrap">
      <span
        className="font-bold shrink-0 text-[10px] tracking-wider px-2 py-0.5 rounded border"
        style={{
          color,
          borderColor: `${color}33`,
          backgroundColor: `${color}0D`,
        }}
      >
        {prefix}
      </span>
      <span className="text-white/50 truncate">{text}</span>
    </div>
  );
}

function ScrollColumn({
  items,
  speed,
  direction = 'up',
}: {
  items: typeof FEED_COL_1;
  speed: number;
  direction?: 'up' | 'down';
}) {
  // Double the items for seamless loop
  const doubled = useMemo(() => [...items, ...items, ...items], [items]);

  return (
    <div className="relative h-full overflow-hidden">
      <motion.div
        className="flex flex-col"
        animate={{
          y: direction === 'up' ? [0, -items.length * 36] : [-items.length * 36, 0],
        }}
        transition={{
          y: {
            duration: speed,
            repeat: Infinity,
            ease: 'linear',
          },
        }}
      >
        {doubled.map((item, i) => (
          <DataLine key={`${item.prefix}-${i}`} {...item} />
        ))}
      </motion.div>
    </div>
  );
}

/**
 * Scene 2: The Data Vortex — Three columns of streaming data
 * with parallax depth (fast/medium/slow layers).
 * Creates a "falling into the Matrix" sensation.
 */
export function SceneDataVortex() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  // Section title animations
  const titleY = useTransform(scrollYProgress, [0, 0.3], [100, 0]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.2], [0, 1]);
  const titleFadeOut = useTransform(scrollYProgress, [0.7, 1], [1, 0]);

  // Vortex intensity — columns get faster as you scroll deeper
  const vortexScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.9, 1, 1.05]);
  const vortexOpacity = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], [0, 1, 1, 0]);

  // Fog layers
  const fogTop = useTransform(scrollYProgress, [0, 1], ['0%', '-20%']);
  const fogBottom = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);

  return (
    <section
      ref={trackRef}
      className="relative"
      style={{ height: '250vh' }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#050505]">
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,215,0,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.3) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />

        {/* Section Header — Sticky centered */}
        <motion.div
          className="absolute top-16 md:top-20 left-0 right-0 z-20 text-center px-4"
          style={{ y: titleY, opacity: titleOpacity }}
        >
          <motion.div style={{ opacity: titleFadeOut }}>
            <span className="font-mono text-[10px] tracking-[0.6em] text-[#00FF99]/60 uppercase block mb-3">
              &lt;DATA_INGESTION&gt;
            </span>
            <h2 className="font-unbounded font-black text-4xl md:text-6xl lg:text-7xl text-white tracking-tighter">
              THE DATA
              <span
                className="block"
                style={{
                  background: 'linear-gradient(135deg, #00FF99, #00CC77)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                VORTEX
              </span>
            </h2>
          </motion.div>
        </motion.div>

        {/* Three parallax columns */}
        <motion.div
          className="absolute inset-0 z-10 flex gap-4 md:gap-8 px-4 md:px-16 pt-40 md:pt-48 pb-20"
          style={{ scale: vortexScale, opacity: vortexOpacity }}
        >
          {/* Column 1 — Fast (tweets/signals) */}
          <div className="flex-1 relative">
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#050505] to-transparent z-10" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050505] to-transparent z-10" />
            <ScrollColumn items={FEED_COL_1} speed={12} direction="up" />
          </div>

          {/* Column 2 — Medium (casts/trades) */}
          <div className="flex-1 relative hidden md:block">
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#050505] to-transparent z-10" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050505] to-transparent z-10" />
            <ScrollColumn items={FEED_COL_2} speed={18} direction="down" />
          </div>

          {/* Column 3 — Slow (scores/governance) */}
          <div className="flex-1 relative hidden lg:block">
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#050505] to-transparent z-10" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050505] to-transparent z-10" />
            <ScrollColumn items={FEED_COL_3} speed={25} direction="up" />
          </div>
        </motion.div>

        {/* Vertical separator lines */}
        <div className="absolute inset-0 z-[5] flex pointer-events-none px-4 md:px-16">
          <div className="flex-1 border-r border-[#FFD700]/5" />
          <div className="flex-1 border-r border-[#FFD700]/5 hidden md:block" />
          <div className="flex-1 hidden lg:block" />
        </div>

        {/* Top fog overlay */}
        <motion.div
          className="absolute top-0 left-0 right-0 h-48 z-20 pointer-events-none"
          style={{
            y: fogTop,
            background: 'linear-gradient(to bottom, #050505, transparent)',
          }}
        />

        {/* Bottom fog overlay */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-48 z-20 pointer-events-none"
          style={{
            y: fogBottom,
            background: 'linear-gradient(to top, #050505, transparent)',
          }}
        />

        {/* Center vortex glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none z-0"
          style={{
            background: 'radial-gradient(circle, rgba(0,255,153,0.05) 0%, transparent 60%)',
            filter: 'blur(60px)',
          }}
        />
      </div>
    </section>
  );
}
