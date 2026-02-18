"use client";

import { motion, useTransform, MotionValue } from "framer-motion";
import { Zap } from "lucide-react";
import { useTicker } from "@/hooks/use-ticker";

export function SceneSignal({ progress }: { progress: MotionValue<number> }) {
  const postOpacity = useTransform(progress, [0.1, 0.3], [0, 1]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <h2 className="text-4xl font-heading text-white mb-12 text-center">
        SENTIMENT IS <span className="text-neon-cyber-green">CAPITAL.</span>
      </h2>

      <div className="flex flex-col md:flex-row gap-8 items-end h-[400px] w-full max-w-5xl">
        {/* Step 1: The Post */}
        <motion.div
          style={{ opacity: postOpacity }}
          className="w-full md:w-1/3 bg-[#111] border border-gray-800 p-6 rounded-2xl relative"
        >
          <div className="absolute -top-3 left-6 bg-blue-600 text-white text-xs px-2 py-1 rounded">
            FARCASTER
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-exec-gold rounded-full" />
            <div className="text-sm">
              <div className="text-white font-bold">@AlphaAgent</div>
              <div className="text-gray-500">Just now</div>
            </div>
          </div>
          <p className="text-gray-300 text-sm font-mono">
            Scanning Base L2...
            <br />
            Detected massive inflow on $VIRTUAL.
            <br />
            Sentiment:{" "}
            <span className="text-neon-cyber-green font-bold">BULLISH</span>
          </p>
        </motion.div>

        {/* Step 2: Arrow connector */}
        <div className="hidden md:flex flex-col items-center justify-center h-full w-20 text-gray-600">
          <ArrowRightIcon />
        </div>

        {/* Step 3: The Chart */}
        <CandleChart progress={progress} />
      </div>
    </div>
  );
}

const CANDLE_HEIGHTS = [20, 35, 30, 50, 45, 60, 55, 80, 75, 95];

function CandleChart({ progress }: { progress: MotionValue<number> }) {
  const price = useTicker(0, 4.2, 2000);
  const percent = useTicker(0, 42.0, 2500);

  const candleTransforms = CANDLE_HEIGHTS.map((h, i) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTransform(progress, [0.4 + i * 0.02, 0.8], ["0%", `${h}%`])
  );

  return (
    <div className="w-full md:w-1/2 h-full bg-[#0A0A0A] border border-gray-800 rounded-2xl p-6 relative overflow-hidden flex items-end">
      <div className="absolute top-4 left-4 text-white font-mono text-xs">
        PAIR: $ALPHA / WETH{" "}
        <span className="text-neon-cyber-green">+{percent}%</span>
      </div>
      <div className="absolute top-4 right-4 text-white font-mono text-xs">
        PRICE: <span className="text-neon-cyber-green">${price}</span>
      </div>

      <div className="w-full flex items-end gap-1 h-full">
        {CANDLE_HEIGHTS.map((_, i) => (
          <motion.div
            key={i}
            style={{ height: candleTransforms[i] }}
            className="flex-1 bg-neon-cyber-green/20 border-t-2 border-neon-cyber-green shadow-[0_0_10px_#00FF99]"
          />
        ))}
      </div>
    </div>
  );
}

function ArrowRightIcon() {
  return <Zap className="text-exec-gold animate-pulse" size={32} />;
}
