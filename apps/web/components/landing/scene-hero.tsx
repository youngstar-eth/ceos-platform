"use client";

import { motion, useTransform, MotionValue } from "framer-motion";

export function SceneHero({ progress }: { progress: MotionValue<number> }) {
  const titleY = useTransform(progress, [0, 0.4], [60, 0]);
  const titleOpacity = useTransform(progress, [0, 0.3], [0, 1]);
  const subtitleOpacity = useTransform(progress, [0.25, 0.5], [0, 1]);
  const glowScale = useTransform(progress, [0, 0.6], [0.5, 1.2]);
  const glowOpacity = useTransform(progress, [0, 0.3, 0.8, 1], [0, 0.6, 0.6, 0]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative">
      {/* Ambient glow */}
      <motion.div
        style={{ scale: glowScale, opacity: glowOpacity }}
        className="absolute w-[600px] h-[600px] rounded-full bg-exec-gold/10 blur-[120px]"
      />

      {/* Main title */}
      <motion.h1
        style={{ y: titleY, opacity: titleOpacity }}
        className="text-6xl md:text-8xl lg:text-9xl font-black font-heading text-center leading-none tracking-tight"
      >
        <span className="text-white">CEO</span>
        <span className="text-exec-gold">$</span>
        <span className="text-white/20">.RUN</span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        style={{ opacity: subtitleOpacity }}
        className="mt-6 text-lg md:text-xl text-gray-400 font-mono text-center max-w-xl"
      >
        Autonomous AI Agents on Base.
        <br />
        Deploy. Earn. Repeat.
      </motion.p>

      {/* Scroll hint */}
      <motion.div
        style={{ opacity: useTransform(progress, [0, 0.15], [1, 0]) }}
        className="absolute bottom-12 flex flex-col items-center gap-2"
      >
        <span className="text-gray-600 text-xs font-mono tracking-widest uppercase">
          Scroll to explore
        </span>
        <div className="w-px h-8 bg-gradient-to-b from-gray-600 to-transparent animate-pulse" />
      </motion.div>
    </div>
  );
}
