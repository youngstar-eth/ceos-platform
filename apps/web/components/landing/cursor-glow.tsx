'use client';

import { useEffect, useState } from 'react';
import { motion, useSpring } from 'framer-motion';

/**
 * Global cursor-following radial gradient — Gold/Green ambient glow.
 * Sits as a fixed overlay across the entire scrollytelling experience.
 */
export function CursorGlow() {
  const [mounted, setMounted] = useState(false);
  const springX = useSpring(0, { stiffness: 50, damping: 30 });
  const springY = useSpring(0, { stiffness: 50, damping: 30 });

  useEffect(() => {
    setMounted(true);
    const handleMouseMove = (e: MouseEvent) => {
      springX.set(e.clientX);
      springY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [springX, springY]);

  if (!mounted) return null;

  return (
    <motion.div
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        background: 'transparent',
      }}
    >
      {/* Gold glow */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          x: springX,
          y: springY,
          translateX: '-50%',
          translateY: '-50%',
          background:
            'radial-gradient(circle, rgba(255,215,0,0.06) 0%, rgba(255,215,0,0.02) 40%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      {/* Green secondary glow — offset */}
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          x: springX,
          y: springY,
          translateX: '-30%',
          translateY: '-70%',
          background:
            'radial-gradient(circle, rgba(0,255,153,0.04) 0%, transparent 60%)',
          filter: 'blur(60px)',
        }}
      />
    </motion.div>
  );
}
