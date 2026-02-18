'use client';

import { useRef, useMemo } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

/* ─── Particle Configuration ─── */
function generateParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    // Start from random edge positions
    startAngle: (360 / count) * i + Math.random() * 20,
    startRadius: 300 + Math.random() * 200,
    duration: 3 + Math.random() * 4,
    delay: Math.random() * 3,
    size: 3 + Math.random() * 4,
  }));
}

/**
 * The complex SVG reactor with glowing filters,
 * multi-ring rotation, and pulsating core.
 */
function ReactorSVG() {
  return (
    <svg
      viewBox="0 0 500 500"
      className="w-full h-full"
      style={{ filter: 'drop-shadow(0 0 40px rgba(0,255,153,0.15))' }}
    >
      <defs>
        {/* Glow filters */}
        <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#FFD700" floodOpacity="0.6" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#00FF99" floodOpacity="0.5" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-core" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feFlood floodColor="#00FF99" floodOpacity="0.8" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Radial gradient for core */}
        <radialGradient id="core-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00FF99" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#00FF99" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#00FF99" stopOpacity="0" />
        </radialGradient>

        {/* Dashed pattern for tech rings */}
        <pattern id="ring-dash" patternUnits="userSpaceOnUse" width="8" height="1">
          <rect width="4" height="1" fill="currentColor" />
        </pattern>
      </defs>

      {/* Outer ring — Gold, clockwise */}
      <g filter="url(#glow-gold)">
        <circle
          cx="250"
          cy="250"
          r="210"
          fill="none"
          stroke="#FFD700"
          strokeWidth="1"
          strokeDasharray="12 8 2 8"
          opacity="0.6"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 250 250"
            to="360 250 250"
            dur="30s"
            repeatCount="indefinite"
          />
        </circle>
        {/* Outer ring tick marks */}
        {Array.from({ length: 36 }).map((_, i) => {
          const angle = (i * 10 * Math.PI) / 180;
          const x1 = 250 + 200 * Math.cos(angle);
          const y1 = 250 + 200 * Math.sin(angle);
          const x2 = 250 + 210 * Math.cos(angle);
          const y2 = 250 + 210 * Math.sin(angle);
          return (
            <line
              key={`tick-outer-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#FFD700"
              strokeWidth={i % 3 === 0 ? 2 : 0.5}
              opacity={i % 3 === 0 ? 0.8 : 0.3}
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 250 250"
                to="360 250 250"
                dur="30s"
                repeatCount="indefinite"
              />
            </line>
          );
        })}
      </g>

      {/* Middle ring — Green, counter-clockwise */}
      <g filter="url(#glow-green)">
        <circle
          cx="250"
          cy="250"
          r="155"
          fill="none"
          stroke="#00FF99"
          strokeWidth="1.5"
          strokeDasharray="20 5 5 5"
          opacity="0.5"
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
        {/* Data nodes on middle ring */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 45 * Math.PI) / 180;
          const cx = 250 + 155 * Math.cos(angle);
          const cy = 250 + 155 * Math.sin(angle);
          return (
            <circle
              key={`node-mid-${i}`}
              cx={cx}
              cy={cy}
              r={i % 2 === 0 ? 4 : 2.5}
              fill={i % 2 === 0 ? '#00FF99' : '#FFD700'}
              opacity={0.7}
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="360 250 250"
                to="0 250 250"
                dur="20s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.3;0.9;0.3"
                dur={`${2 + i * 0.3}s`}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
      </g>

      {/* Inner ring — White/gray, clockwise fast */}
      <circle
        cx="250"
        cy="250"
        r="100"
        fill="none"
        stroke="white"
        strokeWidth="0.5"
        strokeDasharray="4 12"
        opacity="0.3"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 250 250"
          to="360 250 250"
          dur="12s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Inner hexagon frame */}
      <polygon
        points="250,180 310,215 310,285 250,320 190,285 190,215"
        fill="none"
        stroke="#00FF99"
        strokeWidth="0.8"
        opacity="0.25"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 250 250"
          to="-360 250 250"
          dur="40s"
          repeatCount="indefinite"
        />
      </polygon>

      {/* Core orb */}
      <g filter="url(#glow-core)">
        <circle cx="250" cy="250" r="45" fill="url(#core-gradient)">
          <animate
            attributeName="r"
            values="42;48;42"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          cx="250"
          cy="250"
          r="25"
          fill="#050505"
          stroke="#00FF99"
          strokeWidth="1"
          opacity="0.8"
        />
      </g>
    </svg>
  );
}

/**
 * Scene 3: The Reactor — Complex SVG reactor stays sticky for 200vh.
 * Fee particles fly from edges into the core.
 */
export function SceneReactor() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  const particles = useMemo(() => generateParticles(14), []);

  // Title animations
  const titleOpacity = useTransform(scrollYProgress, [0, 0.15, 0.8, 1], [0, 1, 1, 0]);
  const titleY = useTransform(scrollYProgress, [0, 0.15], [60, 0]);

  // Reactor scale — breathe effect
  const reactorScale = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.7, 1, 1, 0.8]);
  const reactorOpacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);

  // Core label
  const coreLabelOpacity = useTransform(scrollYProgress, [0.2, 0.35], [0, 1]);

  // Bottom text
  const bottomOpacity = useTransform(scrollYProgress, [0.3, 0.5], [0, 1]);

  return (
    <section
      ref={trackRef}
      className="relative"
      style={{ height: '250vh' }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#050505]">
        {/* Background ambient */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(0,255,153,0.04) 0%, transparent 50%)',
          }}
        />

        {/* Section heading */}
        <motion.div
          className="absolute top-12 md:top-16 left-0 right-0 z-20 text-center px-4"
          style={{ opacity: titleOpacity, y: titleY }}
        >
          <span className="font-mono text-[10px] tracking-[0.6em] text-[#FFD700]/50 uppercase block mb-2">
            &lt;FLYWHEEL_ENGINE&gt;
          </span>
          <h2 className="font-unbounded font-black text-3xl md:text-5xl lg:text-6xl text-white tracking-tighter">
            THE AUTONOMOUS
            <span
              className="block"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              FLYWHEEL
            </span>
          </h2>
        </motion.div>

        {/* Reactor — centered sticky */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] md:w-[420px] md:h-[420px] lg:w-[500px] lg:h-[500px] z-10"
          style={{ scale: reactorScale, opacity: reactorOpacity }}
        >
          <ReactorSVG />

          {/* Core label — appears mid-scroll */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-30"
            style={{ opacity: coreLabelOpacity }}
          >
            <span className="font-mono text-[9px] md:text-[11px] tracking-[0.3em] text-[#00FF99] block">
              BUYBACK
            </span>
            <span className="font-unbounded font-black text-[10px] md:text-xs text-white/80">
              CORE
            </span>
          </motion.div>
        </motion.div>

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
                background: p.id % 3 === 0 ? '#FFD700' : '#00FF99',
                boxShadow:
                  p.id % 3 === 0
                    ? '0 0 8px rgba(255,215,0,0.6)'
                    : '0 0 8px rgba(0,255,153,0.6)',
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

        {/* Bottom description */}
        <motion.div
          className="absolute bottom-16 md:bottom-20 left-0 right-0 z-20 text-center px-4"
          style={{ opacity: bottomOpacity }}
        >
          <p className="font-mono text-sm md:text-base text-white/40 max-w-lg mx-auto">
            Every fee feeds the reactor. Every epoch compounds.
          </p>
          <div className="flex items-center justify-center gap-6 mt-6">
            {['FEES IN', 'BUYBACK', 'BURN', 'PRICE UP'].map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <span
                  className="font-mono text-[10px] tracking-wider"
                  style={{ color: i === 3 ? '#00FF99' : '#FFD700' }}
                >
                  {step}
                </span>
                {i < 3 && (
                  <span className="text-white/20 text-xs">→</span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
