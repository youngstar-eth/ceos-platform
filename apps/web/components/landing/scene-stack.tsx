"use client";

import { motion, useTransform, MotionValue } from "framer-motion";

const LAYERS = [
  { label: "FRONTEND", sub: "Next.js 15 + wagmi v2", color: "#FFD700" },
  { label: "API LAYER", sub: "Routes + Prisma ORM", color: "#00FF99" },
  { label: "AGENT RUNTIME", sub: "BullMQ + OpenRouter + Fal.ai", color: "#00D4FF" },
  { label: "BASE BLOCKCHAIN", sub: "Solidity 0.8.24 + Foundry", color: "#7B61FF" },
];

export function SceneStack({ progress }: { progress: MotionValue<number> }) {
  const titleOpacity = useTransform(progress, [0.05, 0.2], [0, 1]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8">
      <motion.h2
        style={{ opacity: titleOpacity }}
        className="text-4xl md:text-5xl font-heading font-black text-white text-center"
      >
        THE <span className="text-exec-gold">STACK.</span>
      </motion.h2>

      <div className="flex flex-col gap-4 w-full max-w-2xl">
        {LAYERS.map((layer, i) => (
          <StackLayer
            key={layer.label}
            layer={layer}
            index={i}
            progress={progress}
          />
        ))}
      </div>
    </div>
  );
}

function StackLayer({
  layer,
  index,
  progress,
}: {
  layer: (typeof LAYERS)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const start = 0.15 + index * 0.12;
  const end = start + 0.15;
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const x = useTransform(progress, [start, end], [-60, 0]);

  return (
    <motion.div
      style={{ opacity, x }}
      className="flex items-center gap-4 bg-[#0A0A0A] border border-gray-800 rounded-xl p-5"
    >
      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: layer.color }}
      />
      <div>
        <div className="text-white font-heading text-sm tracking-wider">
          {layer.label}
        </div>
        <div className="text-gray-500 font-mono text-xs">{layer.sub}</div>
      </div>
    </motion.div>
  );
}
