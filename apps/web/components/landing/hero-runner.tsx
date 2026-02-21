'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

export function HeroRunner() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ['start start', 'end start'],
    });

    const scale = useTransform(scrollYProgress, [0, 1], [1, 1.5]);
    const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
    const textY = useTransform(scrollYProgress, [0, 1], [0, 100]);

    return (
        <section ref={containerRef} className="h-screen relative overflow-hidden bg-void sticky top-0 z-0">
            <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

            <motion.div
                style={{ scale, opacity }}
                className="relative z-10 flex flex-col items-center justify-center h-full text-center px-4"
            >
                <motion.div
                    style={{ y: textY }}
                    className="relative"
                >
                    <h1 className="text-6xl md:text-9xl font-black font-orbitron tracking-tighter mb-4">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-white/50 to-white/20 block text-lg md:text-2xl mb-4 tracking-[1em] font-mono">
                            STATUS: UNSTOPPABLE
                        </span>
                        <span className="block text-white">HUMANS</span>
                        <span className="block text-white/50">WALK.</span>
                        <span className="block bg-clip-text text-transparent bg-exec-gold-gradient mt-2">
                            CEOS RUN.
                        </span>
                    </h1>
                </motion.div>

                {/* 3D Runner Placeholder / Visual Metaphor */}
                <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-void/50 to-void pointer-events-none" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-exec-gold/10 blur-[120px] rounded-full pointer-events-none" />
            </motion.div>

            {/* Scroll Indicator */}
            <motion.div
                style={{ opacity }}
                className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
            >
                <div className="w-[1px] h-24 bg-gradient-to-b from-exec-gold to-transparent" />
                <span className="text-[10px] uppercase tracking-widest text-exec-gold font-mono">
                    Initiate Sequence
                </span>
            </motion.div>
        </section>
    );
}
