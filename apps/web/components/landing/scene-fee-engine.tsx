'use client';

import { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

/* ─── Particle Configuration ─── */
function generateInputParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    startAngle: (360 / count) * i + Math.random() * 20,
    startRadius: 300 + Math.random() * 200,
    duration: 3 + Math.random() * 4,
    delay: Math.random() * 3,
    size: 3 + Math.random() * 4,
  }));
}

/**
 * The SVG Fee Splitter Reactor
 */
function SplitterReactorSVG() {
  return (
    <svg
      viewBox="0 0 500 500"
      className="w-full h-full"
      style={{ filter: 'drop-shadow(0 0 60px rgba(0,255,153,0.2))' }}
      suppressHydrationWarning
    >
      <defs>
        <filter id="fee-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feFlood floodColor="#FFD700" floodOpacity="0.7" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="fee-glow-green" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#00FF99" floodOpacity="0.6" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="fee-glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#00BFFF" floodOpacity="0.6" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="fee-glow-core" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" result="blur" />
          <feFlood floodColor="#FFD700" floodOpacity="0.7" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="fee-core-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#FFD700" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer ring — Gold/Fees input */}
      <g filter="url(#fee-glow-gold)">
        <circle cx="250" cy="250" r="210" fill="none" stroke="#FFD700" strokeWidth="1.2" strokeDasharray="12 8 2 8" opacity="0.6">
          <animateTransform attributeName="transform" type="rotate" from="0 250 250" to="360 250 250" dur="30s" repeatCount="indefinite" />
        </circle>
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 15 * Math.PI) / 180;
          const x1 = 250 + 200 * Math.cos(angle);
          const y1 = 250 + 200 * Math.sin(angle);
          const x2 = 250 + 210 * Math.cos(angle);
          const y2 = 250 + 210 * Math.sin(angle);
          return (
            <line key={`fto-${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#FFD700" strokeWidth={i % 3 === 0 ? 2 : 0.5} opacity={i % 3 === 0 ? 0.8 : 0.3}>
              <animateTransform attributeName="transform" type="rotate" from="0 250 250" to="360 250 250" dur="30s" repeatCount="indefinite" />
            </line>
          );
        })}
      </g>

      {/* Middle ring — Green (Buyback $RUN) */}
      <g filter="url(#fee-glow-green)">
        <circle cx="250" cy="250" r="155" fill="none" stroke="#00FF99" strokeWidth="1.5" strokeDasharray="20 5 5 5" opacity="0.55">
          <animateTransform attributeName="transform" type="rotate" from="360 250 250" to="0 250 250" dur="20s" repeatCount="indefinite" />
        </circle>
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i * 60 * Math.PI) / 180;
          const cx = 250 + 155 * Math.cos(angle);
          const cy = 250 + 155 * Math.sin(angle);
          const colors = ['#00FF99', '#00BFFF', '#FFD700', '#00FF99', '#00BFFF', '#FFD700'];
          return (
            <circle key={`fn-${i}`} cx={cx} cy={cy} r={i % 2 === 0 ? 4 : 3} fill={colors[i]} opacity={0.8}>
              <animateTransform attributeName="transform" type="rotate" from="360 250 250" to="0 250 250" dur="20s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;1;0.4" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
            </circle>
          );
        })}
      </g>

      {/* Inner ring — Cyan (Agent Token) */}
      <circle cx="250" cy="250" r="100" fill="none" stroke="#00BFFF" strokeWidth="1" strokeDasharray="6 10" opacity="0.4">
        <animateTransform attributeName="transform" type="rotate" from="0 250 250" to="360 250 250" dur="12s" repeatCount="indefinite" />
      </circle>

      {/* Inner hexagon */}
      <polygon
        points="250,190 295,220 295,280 250,310 205,280 205,220"
        fill="none" stroke="#FFD700" strokeWidth="1" opacity="0.25">
        <animateTransform attributeName="transform" type="rotate" from="0 250 250" to="-360 250 250" dur="40s" repeatCount="indefinite" />
      </polygon>

      {/* Core orb */}
      <g filter="url(#fee-glow-core)">
        <circle cx="250" cy="250" r="45" fill="url(#fee-core-grad)">
          <animate attributeName="r" values="42;50;42" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="250" cy="250" r="25" fill="#050505" stroke="#FFD700" strokeWidth="1.2" opacity="0.9" />
      </g>
    </svg>
  );
}

/**
 * Scene 4: The Financial Engine — "The Fee Splitter"
 *
 * PINNED SCROLLYTELLING: 300vh tall track → sticky 100vh viewport.
 * As the user scrolls:
 *   0-10%   → Title and reactor fade in simultaneously
 *   10-40%  → Input label (TRADING FEES) appears from left
 *   30-70%  → Output streams (BUYBACK, AGENT, TREASURY) appear from right
 *   70-100% → Scene fades out
 *
 * The reactor is ALWAYS centered. The scene stays pinned until complete.
 */
export function SceneFeeEngine() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  const particles = useMemo(() => generateInputParticles(14), []);

  // Title — visible immediately
  const titleOpacity = useTransform(scrollYProgress, [0, 0.05, 0.8, 0.95], [0, 1, 1, 0]);
  const titleY = useTransform(scrollYProgress, [0, 0.05], [30, 0]);

  // Reactor — centered, fades in with title, persists
  const reactorScale = useTransform(scrollYProgress, [0, 0.08, 0.85, 1], [0.85, 1, 1, 0.9]);
  const reactorOpacity = useTransform(scrollYProgress, [0, 0.08, 0.85, 0.98], [0, 1, 1, 0]);

  // Core label
  const coreLabelOpacity = useTransform(scrollYProgress, [0.08, 0.18], [0, 1]);

  // Input label — left side, appears after reactor
  const inputOpacity = useTransform(scrollYProgress, [0.1, 0.25], [0, 1]);
  const inputX = useTransform(scrollYProgress, [0.1, 0.25], [-30, 0]);

  // Output streams — right side, staggered appearance
  const output1Opacity = useTransform(scrollYProgress, [0.3, 0.45], [0, 1]);
  const output1X = useTransform(scrollYProgress, [0.3, 0.45], [30, 0]);
  const output2Opacity = useTransform(scrollYProgress, [0.4, 0.55], [0, 1]);
  const output2X = useTransform(scrollYProgress, [0.4, 0.55], [30, 0]);
  const output3Opacity = useTransform(scrollYProgress, [0.5, 0.65], [0, 1]);
  const output3X = useTransform(scrollYProgress, [0.5, 0.65], [30, 0]);

  // Step label
  const stepOpacity = useTransform(scrollYProgress, [0.15, 0.3, 0.85, 0.98], [0, 1, 1, 0]);

  return (
    <section
      ref={trackRef}
      className="relative"
      style={{ height: '300vh' }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#050505]">
        {/* Background ambient */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,215,0,0.06) 0%, transparent 50%)' }}
        />

        {/* Section heading */}
        <motion.div
          className="absolute top-8 md:top-10 left-0 right-0 z-20 text-center px-4"
          style={{ opacity: titleOpacity, y: titleY }}
        >
          <span className="font-mono text-[10px] tracking-[0.6em] text-[#FFD700]/50 uppercase block mb-2">
            &lt;FEE_SPLITTER&gt;
          </span>
          <h2 className="font-unbounded font-black text-3xl md:text-5xl lg:text-6xl text-white tracking-tighter">
            CONSTANT BUY
            <span
              className="block"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              PRESSURE
            </span>
          </h2>
        </motion.div>

        {/* Reactor — always centered */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] md:w-[360px] md:h-[360px] lg:w-[420px] lg:h-[420px] z-10"
          style={{ scale: reactorScale, opacity: reactorOpacity }}
        >
          <SplitterReactorSVG />

          {/* Core label */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-30"
            style={{ opacity: coreLabelOpacity }}
          >
            <span className="font-mono text-[8px] md:text-[10px] tracking-[0.2em] text-[#FFD700] block">
              SMART CONTRACT
            </span>
            <span className="font-unbounded font-black text-[9px] md:text-xs text-white/80">
              SPLITTER
            </span>
          </motion.div>
        </motion.div>

        {/* Input label — left side, slides in */}
        <motion.div
          className="absolute top-1/2 left-4 md:left-12 -translate-y-1/2 z-20"
          style={{ opacity: inputOpacity, x: inputX }}
        >
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="font-mono text-[9px] md:text-[11px] tracking-wider text-[#FFD700]/80 block font-bold">
                TRADING FEES
              </span>
              <span className="font-mono text-[8px] text-white/30">(ETH)</span>
            </div>
            <motion.div
              className="flex gap-1"
              animate={{ x: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="text-[#FFD700]/70">→</span>
              <span className="text-[#FFD700]/50">→</span>
              <span className="text-[#FFD700]/30">→</span>
            </motion.div>
          </div>
        </motion.div>

        {/* Output streams — right side, staggered slide-in */}
        <div className="absolute top-1/2 right-4 md:right-12 -translate-y-1/2 z-20 space-y-6">
          {/* Stream A: Buyback $RUN */}
          <motion.div
            className="flex items-center gap-2"
            style={{ opacity: output1Opacity, x: output1X }}
          >
            <motion.div
              className="flex gap-1"
              animate={{ x: [0, 6, 0] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <span className="text-[#00FF99]/30">→</span>
              <span className="text-[#00FF99]/50">→</span>
              <span className="text-[#00FF99]/80">→</span>
            </motion.div>
            <div>
              <span className="font-mono text-[9px] md:text-[11px] tracking-wider text-[#00FF99]/90 block font-bold">
                BUYBACK $RUN
              </span>
              <span className="font-mono text-[8px] text-white/30">40% of fees</span>
            </div>
          </motion.div>

          {/* Stream B: Buyback Agent Token */}
          <motion.div
            className="flex items-center gap-2"
            style={{ opacity: output2Opacity, x: output2X }}
          >
            <motion.div
              className="flex gap-1"
              animate={{ x: [0, 6, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
            >
              <span className="text-[#00BFFF]/30">→</span>
              <span className="text-[#00BFFF]/50">→</span>
              <span className="text-[#00BFFF]/80">→</span>
            </motion.div>
            <div>
              <span className="font-mono text-[9px] md:text-[11px] tracking-wider text-[#00BFFF]/90 block font-bold">
                BUYBACK AGENT
              </span>
              <span className="font-mono text-[8px] text-white/30">40% of fees</span>
            </div>
          </motion.div>

          {/* Stream C: Treasury */}
          <motion.div
            className="flex items-center gap-2"
            style={{ opacity: output3Opacity, x: output3X }}
          >
            <motion.div
              className="flex gap-1"
              animate={{ x: [0, 6, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
            >
              <span className="text-[#FFD700]/30">→</span>
              <span className="text-[#FFD700]/50">→</span>
              <span className="text-[#FFD700]/80">→</span>
            </motion.div>
            <div>
              <span className="font-mono text-[9px] md:text-[11px] tracking-wider text-[#FFD700]/90 block font-bold">
                TREASURY
              </span>
              <span className="font-mono text-[8px] text-white/30">20% of fees</span>
            </div>
          </motion.div>
        </div>

        {/* Fee Particles — fly from edges to center */}
        {particles.map((p) => {
          const startX = 50 + p.startRadius * Math.cos((p.startAngle * Math.PI) / 180) * 0.15;
          const startY = 50 + p.startRadius * Math.sin((p.startAngle * Math.PI) / 180) * 0.15;

          return (
            <motion.div
              key={p.id}
              className="absolute rounded-full z-[15] pointer-events-none"
              style={{
                width: p.size,
                height: p.size,
                background: '#FFD700',
                boxShadow: '0 0 12px rgba(255,215,0,0.7)',
                left: `${startX}%`,
                top: `${startY}%`,
              }}
              animate={{
                left: [`${startX}%`, '50%'],
                top: [`${startY}%`, '50%'],
                opacity: [0, 0.9, 0.9, 0],
                scale: [1, 1.2, 0.5, 0],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: 'easeIn',
              }}
            />
          );
        })}

        {/* Step label at bottom */}
        <motion.div
          className="absolute bottom-8 md:bottom-12 left-0 right-0 z-20 text-center px-4"
          style={{ opacity: stepOpacity }}
        >
          <span className="font-mono text-[10px] tracking-[0.3em] text-[#FFD700]/60 uppercase">
            STEP 3
          </span>
          <p className="font-mono text-xs md:text-sm text-white/40 mt-2 max-w-lg mx-auto">
            40% BUYBACK POWER. The more they work, the scarcer the token. Every trade feeds the flywheel.
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            {[
              { label: 'FEES IN', color: '#FFD700' },
              { label: 'SPLIT', color: '#ffffff60' },
              { label: '$RUN BUY', color: '#00FF99' },
              { label: 'AGENT BUY', color: '#00BFFF' },
              { label: 'TREASURY', color: '#FFD700' },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <span className="font-mono text-[9px] tracking-wider" style={{ color: step.color }}>
                  {step.label}
                </span>
                {i < 4 && <span className="text-white/20 text-[10px]">→</span>}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
