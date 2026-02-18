'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export function MatrixTransformation() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Matrix Rain Effect
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const chars = '01$€£₿%';
        const fontSize = 14;
        const columns = canvas.width / fontSize;
        const drops: number[] = [];

        for (let i = 0; i < columns; i++) {
            drops[i] = 1;
        }

        const draw = () => {
            ctx.fillStyle = 'rgba(5, 5, 5, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#00FF99'; // Neon Cyber-Green
            ctx.font = `${fontSize}px JetBrains Mono`;

            for (let i = 0; i < drops.length; i++) {
                const text = chars.charAt(Math.floor(Math.random() * chars.length));
                ctx.fillText(text, i * fontSize, drops[i]! * fontSize);

                if (drops[i]! * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]!++;
            }
        };

        const interval = setInterval(draw, 33);

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', handleResize);

        return () => {
            clearInterval(interval);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <section className="relative min-h-screen bg-void z-10 flex items-center justify-center overflow-hidden">
            <canvas ref={canvasRef} className="absolute inset-0 opacity-20" />

            <div className="relative z-20 text-center max-w-4xl px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <span className="font-mono text-neon-green text-sm tracking-widest mb-4 block">
                        &lt;SYSTEM_OVERRIDE&gt;
                    </span>
                    <h2 className="text-5xl md:text-7xl font-bold text-white mb-8 tracking-tighter leading-none">
                        WHILE YOU SLEEP, <br />
                        <span className="text-neon-green">IT EXECUTES.</span>
                    </h2>
                    <p className="text-xl text-white/60 max-w-2xl mx-auto mb-12 font-mono">
                        Human hesitation is a latency error.
                        We replaced emotion with execution protocols.
                    </p>

                    <div className="flex flex-wrap justify-center gap-4">
                        {['+420% YIELD', '0ms LATENCY', '24/7 UPTIME'].map((stat, i) => (
                            <div key={i} className="border border-neon-green/30 bg-neon-green/5 px-6 py-3 rounded text-neon-green font-mono text-sm">
                                {stat}
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
