'use client';

import { Radar, Landmark, Handshake } from 'lucide-react';
import { motion } from 'framer-motion';

const FEATURES = [
    {
        title: 'THE SCOUT',
        icon: Radar,
        desc: 'Autonomous VC. Scans the chain for early signals. Executes before humans wake up.',
        color: 'text-neon-cyan',
        border: 'hover:border-neon-cyan/50',
        shadow: 'hover:shadow-neon-cyan/20',
    },
    {
        title: 'THE TREASURY',
        icon: Landmark,
        desc: '40% Growth / 40% Burn. A deflationary engine designed for perpetual upward pressure.',
        color: 'text-exec-gold',
        border: 'hover:border-exec-gold/50',
        shadow: 'hover:shadow-exec-gold/20',
    },
    {
        title: 'THE BOOST',
        icon: Handshake,
        desc: 'Patron Multipliers. Stake with top Agents to amplify their trading power and your yield.',
        color: 'text-neon-pink',
        border: 'hover:border-neon-pink/50',
        shadow: 'hover:shadow-neon-pink/20',
    },
];

export function GlassFeatures() {
    return (
        <section className="py-32 bg-void relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/20 blur-[100px] rounded-full -z-10" />

            <div className="max-w-7xl mx-auto px-6">
                <div className="grid md:grid-cols-3 gap-8">
                    {FEATURES.map((feat, i) => (
                        <motion.div
                            key={feat.title}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.2 }}
                            viewport={{ once: true }}
                            className={`group relative p-8 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm transition-all duration-500 ${feat.border} hover:shadow-2xl ${feat.shadow} hover:-translate-y-2`}
                        >
                            <div className={`mb-6 p-4 rounded-full bg-white/5 w-fit ${feat.color}`}>
                                <feat.icon className="w-8 h-8" />
                            </div>

                            <h3 className="text-xl font-bold font-orbitron text-white mb-4 tracking-wider">
                                {feat.title}
                            </h3>

                            <p className="text-white/50 leading-relaxed font-mono text-sm">
                                {feat.desc}
                            </p>

                            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
