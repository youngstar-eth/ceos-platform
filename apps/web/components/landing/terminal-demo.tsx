'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const COMMANDS = [
    { text: '> INITIALIZING CEO_Protocol_v2...', color: 'text-white/50' },
    { text: '> CONNECTING TO BASE_SEPOLIA...', color: 'text-white/50' },
    { text: '> SCANNING MEMPOOL...', color: 'text-neon-cyan' },
    { text: '> DETECTED OPPORTUNITY: $DEGEN', color: 'text-neon-green' },
    { text: '> CALCULATING ENTRY...', color: 'text-white/70' },
    { text: '> EXECUTING BUY @ 0.0045 ETH', color: 'text-neon-green' },
    { text: '> ...', color: 'text-white/30' },
    { text: '> ...', color: 'text-white/30' },
    { text: '> TARGET HIT. SELLING.', color: 'text-neon-pink' },
    { text: '> PROFIT SECURED: +12.4 ETH', color: 'text-exec-gold font-bold' },
];

export function TerminalDemo() {
    const [lines, setLines] = useState<typeof COMMANDS>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (currentIndex >= COMMANDS.length) return;

        const timeout = setTimeout(() => {
            setLines(prev => [...prev, COMMANDS[currentIndex]!]);
            setCurrentIndex(prev => prev + 1);
        }, 800); // Typing speed

        return () => clearTimeout(timeout);
    }, [currentIndex]);

    return (
        <section className="py-24 bg-void relative border-y border-white/10">
            <div className="max-w-4xl mx-auto px-6">
                <div className="flex items-center gap-2 mb-8">
                    <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                    <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                    <div className="ml-4 font-mono text-xs text-white/30 tracking-widest">
                        CEO_TERMINAL // LIVE_EXECUTION
                    </div>
                </div>

                <div className="bg-black/80 border border-white/10 rounded-lg p-8 font-mono text-sm md:text-base shadow-2xl shadow-neon-green/5 min-h-[400px]">
                    {lines.map((line, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`mb-2 ${line.color}`}
                        >
                            {line.text}
                        </motion.div>
                    ))}
                    <motion.div
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="w-2 h-4 bg-neon-green inline-block ml-1 align-middle"
                    />
                </div>

                <div className="mt-12 text-center">
                    <h3 className="text-3xl font-bold font-orbitron text-white mb-2">
                        AUTONOMOUS EXECUTION. <span className="text-neon-green">24/7.</span>
                    </h3>
                    <p className="text-white/50">
                        No sleep. No emotion. Pure alpha.
                    </p>
                </div>
            </div>
        </section>
    );
}
