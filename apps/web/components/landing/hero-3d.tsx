'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Float, OrbitControls, Stars } from '@react-three/drei';
import { StickerObject } from './sticker-object';
import { SwissType } from './swiss-section';
import { motion } from 'framer-motion';

function Scene() {
    return (
        <>
            {/* Studio Lighting */}
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={500} castShadow />
            <pointLight position={[-10, -10, -10]} intensity={200} color="#ff00ff" />
            <pointLight position={[10, -10, 10]} intensity={200} color="#00ffff" />

            {/* Environment for reflections */}
            <Environment preset="city" />

            {/* Main Object */}
            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                <StickerObject position={[2, 0, 0]} scale={1.8} />
            </Float>

            {/* Background Particles/Stars for depth */}
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        </>
    );
}

export function Hero3D() {
    return (
        <div className="relative w-full h-screen bg-black overflow-hidden">
            {/* 3D Scene Layer */}
            <div className="absolute inset-0 z-0">
                <Canvas shadows camera={{ position: [0, 0, 8], fov: 45 }}>
                    <Suspense fallback={null}>
                        <Scene />
                        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
                    </Suspense>
                </Canvas>
            </div>

            {/* Swiss Layout Overlay */}
            <div className="absolute inset-0 z-10 pointer-events-none flex items-center">
                <div className="w-full h-full max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-8 pointer-events-auto">

                    {/* Left Content */}
                    <div className="col-span-12 md:col-span-7 flex flex-col justify-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                        >
                            <div className="mb-6 flex items-center gap-4">
                                <span className="h-px w-12 bg-white/30"></span>
                                <SwissType as="span" variant="label" className="text-white/60">
                                    System v2.4
                                </SwissType>
                            </div>

                            <SwissType as="h1" variant="display" emboss className="text-white mb-8">
                                AUTONOMOUS<br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cp-pink via-cp-acid to-cp-cyan">
                                    EXECUTIVE
                                </span><br />
                                PROTOCOL
                            </SwissType>

                            <SwissType as="p" variant="body" className="text-white/60 max-w-lg mb-10">
                                Deploy AI agents that never sleep. The first decentralized workforce operating entirely on-chain. Permissionless. Persistent. Profitable.
                            </SwissType>

                            <div className="flex flex-wrap gap-4">
                                <a
                                    href="/dashboard/deploy"
                                    className="px-8 py-4 bg-white text-black font-bold uppercase tracking-widest text-xs hover:bg-cp-acid transition-colors"
                                >
                                    Confirm Deployment
                                </a>
                                <a
                                    href="/dashboard"
                                    className="px-8 py-4 border border-white/20 text-white font-bold uppercase tracking-widest text-xs hover:bg-white/10 transition-colors backdrop-blur-sm"
                                >
                                    View Dashboard
                                </a>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Area (Visual space for 3D object) */}
                    <div className="hidden md:block col-span-5 relative">
                        {/* Optional: Floating UI elements or captions could go here */}
                        <div className="absolute bottom-20 right-0 text-right">
                            <SwissType as="span" variant="label" className="text-white/30 block mb-2">
                                Coordinates
                            </SwissType>
                            <span className="font-mono text-xs text-cp-acid">
                                35.6895° N, 139.6917° E
                            </span>
                        </div>
                    </div>

                </div>
            </div>

            {/* Decorative Grid Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.05]"
                style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
            </div>
        </div>
    );
}
