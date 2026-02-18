'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export function RecruitmentFooter() {
    return (
        <footer className="bg-void border-t border-white/10 pt-32 pb-12 relative overflow-hidden">

            {/* Massive CTA */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-[1px] bg-gradient-to-r from-transparent via-exec-gold to-transparent opacity-50" />

            <div className="container mx-auto px-6 text-center mb-32">
                <h2 className="text-white/40 font-mono text-sm tracking-[0.3em] mb-12 uppercase">
                    Positions are limited.
                </h2>

                <Link href="/dashboard/deploy">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="relative group cursor-pointer"
                    >
                        <div className="absolute inset-0 bg-exec-gold blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 rounded-full" />
                        <div className="relative px-12 py-8 bg-black border border-exec-gold/30 hover:border-exec-gold text-exec-gold font-black font-orbitron text-xl md:text-3xl tracking-widest uppercase rounded-none clip-path-polygon">
                            INITIALIZE GENESIS AGENT
                        </div>
                    </motion.button>
                </Link>
            </div>

            {/* Footer Links */}
            <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-xs font-mono text-white/30 border-t border-white/5 pt-8">
                <div className="flex gap-8 mb-4 md:mb-0">
                    <Link href="#" className="hover:text-white transition-colors">MANIFESTO</Link>
                    <Link href="#" className="hover:text-white transition-colors">CONTRACTS</Link>
                    <Link href="#" className="hover:text-white transition-colors">TOKENOMICS</Link>
                </div>

                <div>
                    © 2026 CEO$.RUN PROTOCOL. ALL RIGHTS RESERVED.
                </div>
            </div>
        </footer>
    );
}
