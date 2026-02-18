'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

/**
 * Enhanced Void Sphere — pure SVG hero visual.
 * Multi-layer wireframe globe with rotating longitude lines,
 * latitude bands, orbiting data nodes, and a pulsating core.
 */
function VoidSphere() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <svg viewBox="0 0 500 500" className="w-[60vmin] h-[60vmin]" suppressHydrationWarning>
        <defs>
          {/* Core glow */}
          <radialGradient id="hero-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFD700" stopOpacity="0.3" />
            <stop offset="30%" stopColor="#FFD700" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
          </radialGradient>
          {/* Outer halo */}
          <radialGradient id="hero-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00FF99" stopOpacity="0" />
            <stop offset="70%" stopColor="#00FF99" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#00FF99" stopOpacity="0" />
          </radialGradient>
          {/* Glow filter for gold elements */}
          <filter id="hero-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="#FFD700" floodOpacity="0.4" result="color" />
            <feComposite in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Glow filter for green elements */}
          <filter id="hero-glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feFlood floodColor="#00FF99" floodOpacity="0.3" result="color" />
            <feComposite in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient halo */}
        <circle cx="250" cy="250" r="230" fill="url(#hero-halo)" />

        {/* Longitude lines — rotating wireframe */}
        <g filter="url(#hero-glow-gold)">
          {Array.from({ length: 18 }).map((_, i) => (
            <ellipse
              key={`lon-${i}`}
              cx="250"
              cy="250"
              rx={180 * Math.abs(Math.cos((i * 10 * Math.PI) / 180))}
              ry="180"
              fill="none"
              stroke="#FFD700"
              strokeWidth="0.6"
              opacity={0.15 + 0.1 * Math.sin((i * 20 * Math.PI) / 180)}
              transform={`rotate(${i * 10} 250 250)`}
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`${i * 10} 250 250`}
                to={`${i * 10 + 360} 250 250`}
                dur="50s"
                repeatCount="indefinite"
              />
            </ellipse>
          ))}
        </g>

        {/* Latitude bands */}
        <g filter="url(#hero-glow-green)">
          {[-130, -90, -45, 0, 45, 90, 130].map((offset) => {
            const r = Math.sqrt(Math.max(0, 180 * 180 - offset * offset));
            return (
              <ellipse
                key={`lat-${offset}`}
                cx="250"
                cy={250 + offset}
                rx={r}
                ry={r * 0.25}
                fill="none"
                stroke="#00FF99"
                strokeWidth="0.5"
                strokeDasharray="4 8"
                opacity="0.15"
              />
            );
          })}
        </g>

        {/* Orbiting data ring — outer */}
        <g>
          <circle
            cx="250"
            cy="250"
            r="200"
            fill="none"
            stroke="#FFD700"
            strokeWidth="0.3"
            strokeDasharray="2 12"
            opacity="0.2"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 250 250"
              to="360 250 250"
              dur="35s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Orbiting nodes */}
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (i * 60 * Math.PI) / 180;
            const cx = 250 + 200 * Math.cos(angle);
            const cy = 250 + 200 * Math.sin(angle);
            return (
              <circle
                key={`orb-${i}`}
                cx={cx}
                cy={cy}
                r={i % 2 === 0 ? 3 : 2}
                fill={i % 2 === 0 ? '#FFD700' : '#00FF99'}
                opacity="0.5"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 250 250"
                  to="360 250 250"
                  dur="35s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.2;0.7;0.2"
                  dur={`${2 + i * 0.5}s`}
                  repeatCount="indefinite"
                />
              </circle>
            );
          })}
        </g>

        {/* Inner orbit ring */}
        <circle
          cx="250"
          cy="250"
          r="120"
          fill="none"
          stroke="#00FF99"
          strokeWidth="0.4"
          strokeDasharray="1 6"
          opacity="0.15"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="360 250 250"
            to="0 250 250"
            dur="20s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Core orb */}
        <circle cx="250" cy="250" r="50" fill="url(#hero-core)">
          <animate
            attributeName="r"
            values="48;55;48"
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Core bright center */}
        <circle cx="250" cy="250" r="8" fill="#FFD700" opacity="0.3">
          <animate
            attributeName="opacity"
            values="0.2;0.5;0.2"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="250" cy="250" r="3" fill="#FFD700" opacity="0.6" />
      </svg>
    </div>
  );
}

/**
 * Scene 1: The Runner — Full-screen hero with animated SVG void sphere
 * and "fly through text" headline effect on scroll.
 *
 * PINNED SCROLLYTELLING: 250vh tall track → sticky 100vh viewport.
 * The scene stays locked in view while the user scrubs through
 * the fly-through animation. Only scrolls away when complete.
 */
export function SceneRunner() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  // Text flies toward camera: scale 1 → 8, opacity 1 → 0
  // Spread across 0→0.6 of the track for a smooth scrub feel
  const textScale = useTransform(scrollYProgress, [0, 0.6], [1, 8]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.45], [1, 0]);
  const textBlur = useTransform(scrollYProgress, [0.15, 0.5], [0, 20]);
  const textFilter = useTransform(textBlur, (v: number) => `blur(${v}px)`);

  // Scene fades out at end of track
  const sceneFade = useTransform(scrollYProgress, [0.7, 0.95], [1, 0]);

  // Subtitle and scroll indicator fade early
  const subtitleOpacity = useTransform(scrollYProgress, [0, 0.1], [1, 0]);

  // Glitch overlay flicker on initial scroll
  const glitchOpacity = useTransform(scrollYProgress, [0, 0.05, 0.06, 0.15], [0, 0.8, 0, 0]);

  return (
    <section
      ref={trackRef}
      className="relative"
      style={{ height: '250vh' }}
    >
      {/* Sticky viewport — stays pinned for entire track */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* SVG Sphere Background */}
        <motion.div
          className="absolute inset-0 z-0"
          style={{ opacity: sceneFade }}
        >
          <VoidSphere />
          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505]/60 via-[#050505]/30 to-[#050505]/80" />
        </motion.div>

        {/* Scanline overlay */}
        <div
          className="absolute inset-0 z-[5] pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
          }}
        />

        {/* Glitch flash on load */}
        <motion.div
          className="absolute inset-0 z-[6] pointer-events-none"
          style={{
            opacity: glitchOpacity,
            background: 'linear-gradient(90deg, #FFD700 0%, transparent 30%, #00FF99 70%, transparent 100%)',
            mixBlendMode: 'overlay',
          }}
        />

        {/* Main Headline — Flies Through Camera */}
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
          <motion.div
            className="text-center"
            style={{
              scale: textScale,
              opacity: textOpacity,
              filter: textFilter,
            }}
          >
            {/* Pre-headline tag */}
            <motion.div
              className="mb-6 flex items-center justify-center gap-3"
              style={{ opacity: subtitleOpacity }}
            >
              <div className="h-[1px] w-12 bg-[#FFD700]/50" />
              <span className="font-mono text-xs tracking-[0.4em] text-[#FFD700]/70 uppercase">
                Autonomous Agent Protocol on Base L2
              </span>
              <div className="h-[1px] w-12 bg-[#FFD700]/50" />
            </motion.div>

            {/* THE headline */}
            <h1 className="font-unbounded font-black text-6xl sm:text-7xl md:text-8xl lg:text-[10rem] leading-[0.85] tracking-tighter">
              <span className="block text-white">
                TURN
              </span>
              <span className="block text-white/60">
                CONTENT
              </span>
              <span className="block text-white/30">
                INTO
              </span>
              <span
                className="block"
                style={{
                  background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 40px rgba(255,215,0,0.3))',
                }}
              >
                CAPITAL.
              </span>
            </h1>

            {/* Sub-line */}
            <motion.p
              className="mt-8 font-mono text-sm md:text-base text-white/40 tracking-widest max-w-xl mx-auto"
              style={{ opacity: subtitleOpacity }}
            >
              Deploy Autonomous Agents. They Post. They Trade. They Buy Back.
            </motion.p>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-12 flex flex-col items-center gap-4"
            style={{ opacity: subtitleOpacity }}
          >
            <motion.div
              className="w-[1px] h-16 bg-gradient-to-b from-[#FFD700]/60 to-transparent"
              animate={{ scaleY: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="font-mono text-[10px] tracking-[0.5em] text-[#FFD700]/40 uppercase">
              Scroll to Enter
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
