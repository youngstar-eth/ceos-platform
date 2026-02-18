'use client';

import { useRef, useState } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';

/* ─── Chart Data ─── */
const BARS = [
  { label: 'Q1', height: 35, color: '#FFD700' },
  { label: 'Q2', height: 52, color: '#FFD700' },
  { label: 'Q3', height: 44, color: '#FFD700' },
  { label: 'Q4', height: 68, color: '#FFD700' },
  { label: 'Q5', height: 58, color: '#FFD700' },
  { label: 'NOW', height: 110, color: '#00FF99', breakout: true },
];

/**
 * Particle explosion effect — bursts outward from the top of the breakout bar.
 */
function ShatterParticles({ active }: { active: boolean }) {
  if (!active) return null;

  const particles = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * 360;
    const distance = 60 + Math.random() * 120;
    const size = 2 + Math.random() * 4;
    const dx = distance * Math.cos((angle * Math.PI) / 180);
    const dy = distance * Math.sin((angle * Math.PI) / 180) - Math.abs(distance * 0.5);
    return { id: i, dx, dy, size, delay: Math.random() * 0.2 };
  });

  return (
    <>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: p.size,
            height: p.size,
            background: p.id % 3 === 0 ? '#FFD700' : '#00FF99',
            boxShadow:
              p.id % 3 === 0
                ? '0 0 6px rgba(255,215,0,0.8)'
                : '0 0 6px rgba(0,255,153,0.8)',
            left: '50%',
            top: 0,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: p.dx,
            y: p.dy,
            opacity: [1, 1, 0],
            scale: [1, 1.5, 0],
          }}
          transition={{
            duration: 1.2,
            delay: p.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </>
  );
}

/**
 * Scene 4: The Breakout Chart — Full-screen chart with spring physics.
 * The final bar shatters the top border with a particle explosion.
 */
export function SceneBreakoutChart() {
  const trackRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(chartRef, { once: true, margin: '-20%' });
  const [shattered, setShattered] = useState(false);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  // Section animations
  const titleOpacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
  const titleY = useTransform(scrollYProgress, [0, 0.15], [40, 0]);
  const chartOpacity = useTransform(scrollYProgress, [0, 0.2, 0.9, 1], [0, 1, 1, 0]);

  // Scanline sweep
  const scanlineY = useTransform(scrollYProgress, [0.3, 0.7], ['100%', '0%']);

  return (
    <section
      ref={trackRef}
      className="relative"
      style={{ height: '200vh' }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#050505] flex flex-col items-center justify-center">
        {/* Background glow */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse, rgba(0,255,153,0.06) 0%, transparent 60%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Section heading */}
        <motion.div
          className="text-center mb-12 md:mb-16 z-20 px-4"
          style={{ opacity: titleOpacity, y: titleY }}
        >
          <span className="font-mono text-[10px] tracking-[0.6em] text-[#00FF99]/50 uppercase block mb-3">
            &lt;OUTPUT_METRICS&gt;
          </span>
          <h2 className="font-unbounded font-black text-4xl md:text-6xl lg:text-7xl text-white tracking-tighter">
            THE
            <span
              className="ml-4"
              style={{
                background: 'linear-gradient(135deg, #00FF99, #00CC77)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              BREAKOUT
            </span>
          </h2>
        </motion.div>

        {/* Chart container */}
        <motion.div
          ref={chartRef}
          className="relative w-full max-w-3xl mx-auto px-8 md:px-16 z-10"
          style={{ opacity: chartOpacity }}
        >
          {/* Chart border frame */}
          <div className="relative border border-white/10 rounded-lg p-6 md:p-10 overflow-visible">
            {/* Top border — will be "shattered" */}
            <motion.div
              className="absolute top-0 left-0 right-0 h-[1px]"
              style={{
                background: shattered
                  ? 'linear-gradient(90deg, transparent 30%, rgba(0,255,153,0.3) 50%, transparent 70%)'
                  : 'rgba(255,255,255,0.1)',
              }}
            />

            {/* Horizontal grid lines */}
            {[25, 50, 75, 100].map((pct) => (
              <div
                key={pct}
                className="absolute left-6 right-6 md:left-10 md:right-10 border-t border-dashed border-white/[0.04]"
                style={{ bottom: `${(pct / 120) * 100}%` }}
              >
                <span className="absolute -left-8 md:-left-12 -top-2 font-mono text-[9px] text-white/20">
                  {pct}%
                </span>
              </div>
            ))}

            {/* Scanline effect */}
            <motion.div
              className="absolute left-0 right-0 h-[2px] z-30 pointer-events-none"
              style={{
                top: scanlineY,
                background: 'linear-gradient(90deg, transparent, rgba(0,255,153,0.3), transparent)',
                boxShadow: '0 0 20px rgba(0,255,153,0.2)',
              }}
            />

            {/* Bars */}
            <div className="flex items-end justify-between gap-3 md:gap-6" style={{ height: '300px', position: 'relative' }}>
              {BARS.map((bar, i) => {
                const isBreakout = bar.breakout;
                const barHeight = `${(bar.height / 120) * 100}%`;

                return (
                  <div
                    key={bar.label}
                    className="flex-1 flex flex-col items-center relative"
                    style={{ height: '100%', justifyContent: 'flex-end' }}
                  >
                    {/* Bar */}
                    <motion.div
                      className="w-full relative rounded-t-sm"
                      style={{
                        background: isBreakout
                          ? 'linear-gradient(to top, #00FF99, #00CC77, #00FF99)'
                          : `linear-gradient(to top, ${bar.color}33, ${bar.color}66)`,
                        border: isBreakout ? '1px solid #00FF99' : `1px solid ${bar.color}22`,
                        borderBottom: 'none',
                        boxShadow: isBreakout
                          ? '0 0 30px rgba(0,255,153,0.3), inset 0 0 20px rgba(0,255,153,0.1)'
                          : 'none',
                      }}
                      initial={{ height: 0 }}
                      animate={isInView ? { height: barHeight } : { height: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 80,
                        damping: 12,
                        delay: i * 0.15,
                      }}
                      onAnimationComplete={() => {
                        if (isBreakout) {
                          setTimeout(() => setShattered(true), 100);
                        }
                      }}
                    >
                      {/* Breakout glow pulse */}
                      {isBreakout && (
                        <motion.div
                          className="absolute -top-2 left-1/2 -translate-x-1/2 w-full"
                          animate={{
                            boxShadow: [
                              '0 -10px 30px rgba(0,255,153,0.2)',
                              '0 -20px 60px rgba(0,255,153,0.4)',
                              '0 -10px 30px rgba(0,255,153,0.2)',
                            ],
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      )}

                      {/* Value label on bar */}
                      <motion.div
                        className="absolute -top-7 left-1/2 -translate-x-1/2 font-mono text-[10px] md:text-xs whitespace-nowrap"
                        style={{ color: isBreakout ? '#00FF99' : '#FFD700' }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={isInView ? { opacity: 1, y: 0 } : {}}
                        transition={{ delay: i * 0.15 + 0.5 }}
                      >
                        {bar.height}%
                      </motion.div>

                      {/* Particle explosion on breakout bar */}
                      {isBreakout && (
                        <div className="absolute -top-1 left-0 right-0">
                          <ShatterParticles active={shattered} />
                        </div>
                      )}
                    </motion.div>

                    {/* X-axis label */}
                    <span
                      className="mt-3 font-mono text-[10px] tracking-wider"
                      style={{ color: isBreakout ? '#00FF99' : 'rgba(255,255,255,0.3)' }}
                    >
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Callout text */}
          <motion.div
            className="text-center mt-10"
            initial={{ opacity: 0, y: 20 }}
            animate={shattered ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <span
              className="font-unbounded font-black text-4xl md:text-6xl tracking-tighter"
              style={{
                background: 'linear-gradient(135deg, #FFD700, #00FF99)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 0 20px rgba(0,255,153,0.3))',
              }}
            >
              40% BUYBACK POWER.
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
