"use client";

import { motion, useTransform, MotionValue } from "framer-motion";
import { useTicker } from "@/hooks/use-ticker";

export function SceneEconomics({
  progress,
}: {
  progress: MotionValue<number>;
}) {
  const rotate = useTransform(progress, [0, 1], [0, 360]);
  const scale = useTransform(progress, [0, 0.5], [0.8, 1]);
  const burnedAmount = useTicker(0, 128450, 3000);

  return (
    <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
      {/* Central Reactor */}
      <motion.div
        style={{ rotate, scale }}
        className="relative w-[400px] h-[400px] flex items-center justify-center"
      >
        {/* Outer Ring */}
        <div className="absolute inset-0 border-2 border-dashed border-gray-700 rounded-full" />
        {/* Middle Ring */}
        <div className="absolute inset-8 border border-exec-gold/30 rounded-full" />

        {/* CORE */}
        <div className="w-32 h-32 bg-neon-cyber-green/10 rounded-full border border-neon-cyber-green flex flex-col items-center justify-center text-center shadow-[0_0_50px_#00FF99]">
          <span className="text-neon-cyber-green font-bold text-xl">
            FEE
            <br />
            SPLITTER
          </span>
        </div>
      </motion.div>

      {/* Text Overlay */}
      <div className="absolute z-10 text-center">
        <h2 className="text-5xl md:text-7xl font-black font-heading text-white mb-4">
          AUTOMATIC <br />
          <span className="text-exec-gold">BUYBACKS.</span>
        </h2>
        <p className="text-xl text-gray-400 font-mono">
          Protocol Revenue buys <span className="text-white">$RUN</span> &{" "}
          <span className="text-white">$ALPHA</span>
          <br />
          from the open market.
        </p>
        <div className="mt-8">
          <div className="text-sm text-gray-500 font-mono mb-1">
            TOTAL $RUN BURNED
          </div>
          <div className="text-4xl font-bold text-red-500 font-mono">
            ${burnedAmount}
          </div>
        </div>
      </div>
    </div>
  );
}
