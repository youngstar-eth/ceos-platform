'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

/* ─── Code lines that "compile" the agent ─── */
const CODE_LINES = [
  { text: 'import { AgentFactory } from "@ceosrun/core";', color: '#FFD700' },
  { text: 'const agent = await factory.deploy({', color: '#00FF99' },
  { text: '  model: "openrouter/claude-3.5",', color: '#ffffff80' },
  { text: '  personality: "alpha_trader",', color: '#ffffff80' },
  { text: '  farcasterHandle: "@ceo_alpha",', color: '#00FF99' },
  { text: '  tradingPairs: ["ETH/USDC", "DEGEN/ETH"],', color: '#ffffff80' },
  { text: '  riskTolerance: 0.7,', color: '#FFD700' },
  { text: '  postFrequency: "4h",', color: '#ffffff80' },
  { text: '  buybackEnabled: true,', color: '#00FF99' },
  { text: '});', color: '#00FF99' },
  { text: '// Deploy fee: 0.005 ETH → Base L2', color: '#FFD700' },
  { text: 'await agent.register(baseChain);', color: '#00FF99' },
  { text: '// Agent is LIVE on Farcaster', color: '#FFD700' },
  { text: 'agent.startAutonomousLoop();', color: '#00FF99' },
];

/* ─── Holographic Blueprint Avatar ─── */
function HolographicAvatar({ progress }: { progress: number }) {
  const ringCount = 6;
  const assembledRings = Math.floor(progress * ringCount);

  return (
    <svg viewBox="0 0 300 300" className="w-full h-full" suppressHydrationWarning>
      <defs>
        <filter id="deploy-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feFlood floodColor="#00FF99" floodOpacity="0.7" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="deploy-glow-gold" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feFlood floodColor="#FFD700" floodOpacity="0.6" result="color" />
          <feComposite in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="deploy-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00FF99" stopOpacity={Math.max(0.15, 0.5 * progress)} />
          <stop offset="60%" stopColor="#00FF99" stopOpacity={Math.max(0.05, 0.15 * progress)} />
          <stop offset="100%" stopColor="#00FF99" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background scan grid */}
      <g opacity={0.08 + progress * 0.07}>
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`hg-${i}`} x1="0" y1={i * 30} x2="300" y2={i * 30} stroke="#00FF99" strokeWidth="0.3" />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`vg-${i}`} x1={i * 30} y1="0" x2={i * 30} y2="300" stroke="#00FF99" strokeWidth="0.3" />
        ))}
      </g>

      {/* Hexagonal assembly rings — draw themselves as progress increases */}
      {Array.from({ length: ringCount }).map((_, i) => {
        const r = 40 + i * 18;
        const isAssembled = i < assembledRings;
        const hexPoints = Array.from({ length: 6 }).map((__, j) => {
          const angle = (j * 60 - 90) * (Math.PI / 180);
          return `${150 + r * Math.cos(angle)},${150 + r * Math.sin(angle)}`;
        }).join(' ');

        return (
          <polygon
            key={`hex-${i}`}
            points={hexPoints}
            fill="none"
            stroke={isAssembled ? '#00FF99' : '#FFD700'}
            strokeWidth={isAssembled ? 1.5 : 0.6}
            opacity={isAssembled ? 0.7 + (i * 0.04) : 0.2}
            strokeDasharray={isAssembled ? 'none' : '4 8'}
          >
            {isAssembled && (
              <animateTransform
                attributeName="transform"
                type="rotate"
                from={`${i % 2 === 0 ? 0 : 60} 150 150`}
                to={`${i % 2 === 0 ? 360 : -300} 150 150`}
                dur={`${20 + i * 5}s`}
                repeatCount="indefinite"
              />
            )}
          </polygon>
        );
      })}

      {/* Core — visible from the start, glows brighter with progress */}
      <g filter="url(#deploy-glow)">
        <circle cx="150" cy="150" r={30 + progress * 10} fill="url(#deploy-core)">
          <animate attributeName="r" values={`${28 + progress * 10};${34 + progress * 10};${28 + progress * 10}`} dur="3s" repeatCount="indefinite" />
        </circle>
      </g>

      {/* Agent "face" emerges at high progress */}
      {progress > 0.6 && (
        <g filter="url(#deploy-glow)" opacity={Math.min(1, (progress - 0.6) * 2.5)}>
          <circle cx="137" cy="143" r="3" fill="#00FF99" />
          <circle cx="163" cy="143" r="3" fill="#00FF99" />
          <path d="M 140 160 Q 150 168 160 160" fill="none" stroke="#00FF99" strokeWidth="1.5" />
        </g>
      )}

      {/* Label */}
      <text
        x="150"
        y="230"
        textAnchor="middle"
        fill={progress > 0.8 ? '#00FF99' : '#FFD700'}
        fontSize="10"
        fontFamily="monospace"
        opacity={0.7}
      >
        {progress > 0.8 ? 'AGENT ONLINE' : progress > 0.4 ? 'COMPILING...' : 'INITIALIZING...'}
      </text>

      {/* Data points orbiting */}
      {progress > 0.3 && (
        <g opacity={Math.min(1, (progress - 0.3) * 2)}>
          {Array.from({ length: 4 }).map((_, i) => {
            const angle = (i * 90 * Math.PI) / 180;
            const cx = 150 + 110 * Math.cos(angle);
            const cy = 150 + 110 * Math.sin(angle);
            return (
              <circle key={`dp-${i}`} cx={cx} cy={cy} r="2.5" fill={i % 2 === 0 ? '#FFD700' : '#00FF99'} opacity="0.7">
                <animateTransform attributeName="transform" type="rotate" from="0 150 150" to="360 150 150" dur="15s" repeatCount="indefinite" />
              </circle>
            );
          })}
        </g>
      )}
    </svg>
  );
}

/* ─── Scroll-driven code compilation — lines appear as user scrolls ─── */
function CompilationTerminal({ visibleLines }: { visibleLines: number }) {
  return (
    <div className="font-mono text-[10px] md:text-xs leading-relaxed space-y-1">
      {CODE_LINES.slice(0, visibleLines).map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          style={{ color: line.color }}
        >
          <span className="text-white/20 mr-3 select-none">{String(i + 1).padStart(2, '0')}</span>
          {line.text}
        </motion.div>
      ))}
      {/* Blinking cursor */}
      {visibleLines < CODE_LINES.length && visibleLines > 0 && (
        <motion.span
          className="inline-block w-2 h-3 bg-[#00FF99] ml-6"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        />
      )}
    </div>
  );
}

/**
 * Scene 2: Agent Deployment — "Genesis of an Agent"
 *
 * PINNED SCROLLYTELLING: 250vh tall track → sticky 100vh viewport.
 * As the user scrolls:
 *   0-10%   → Title fades in
 *   10-80%  → Blueprint draws itself ring by ring, code lines type
 *   80-100% → Scene fades out, next scene enters
 * The scene does NOT move up until the blueprint is fully complete.
 */
export function SceneDeploy() {
  const trackRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  // Title — fades in immediately, persists until 80%
  const titleOpacity = useTransform(scrollYProgress, [0, 0.05, 0.8, 0.95], [0, 1, 1, 0]);
  const titleY = useTransform(scrollYProgress, [0, 0.05], [30, 0]);

  // Content — visible from 5%, fades at end
  const contentOpacity = useTransform(scrollYProgress, [0, 0.08, 0.8, 0.95], [0, 1, 1, 0]);

  // Avatar blueprint compilation: 0% → 100% across the scroll
  const avatarProgress = useTransform(scrollYProgress, [0.05, 0.75], [0, 1]);

  // Code lines: map scroll to visible line count
  const codeProgress = useTransform(scrollYProgress, [0.05, 0.7], [0, 1]);

  // Step label
  const stepOpacity = useTransform(scrollYProgress, [0.05, 0.15], [0, 1]);

  // Track as state for SVG and code terminal
  const [progress, setProgress] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const unsubAvatar = avatarProgress.on('change', (v: number) => setProgress(v));
    const unsubCode = codeProgress.on('change', (v: number) => {
      setVisibleLines(Math.floor(v * CODE_LINES.length));
    });
    return () => {
      unsubAvatar();
      unsubCode();
    };
  }, [avatarProgress, codeProgress]);

  return (
    <section
      ref={trackRef}
      className="relative"
      style={{ height: '250vh' }}
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#050505]">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(0,255,153,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,153,0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* Section heading */}
        <motion.div
          className="absolute top-8 md:top-10 left-0 right-0 z-20 text-center px-4"
          style={{ opacity: titleOpacity, y: titleY }}
        >
          <span className="font-mono text-[10px] tracking-[0.6em] text-[#00FF99]/60 uppercase block mb-2">
            &lt;AGENT_GENESIS&gt;
          </span>
          <h2 className="font-unbounded font-black text-3xl md:text-5xl lg:text-6xl text-white tracking-tighter">
            DEPLOY YOUR
            <span
              className="block"
              style={{
                background: 'linear-gradient(135deg, #00FF99, #00CC77)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              AGENT
            </span>
          </h2>
        </motion.div>

        {/* Main content — Two columns */}
        <motion.div
          className="absolute inset-0 z-10 flex items-center justify-center px-4 md:px-16 pt-28 md:pt-32"
          style={{ opacity: contentOpacity }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 max-w-5xl w-full">
            {/* Left: Code compilation — scroll-driven line reveal */}
            <div className="relative">
              <div
                className="rounded-lg p-4 md:p-6 overflow-hidden"
                style={{
                  background: 'rgba(5,5,5,0.9)',
                  border: '1px solid rgba(0,255,153,0.15)',
                  boxShadow: '0 0 60px rgba(0,0,0,0.5), 0 0 30px rgba(0,255,153,0.06)',
                }}
              >
                {/* Terminal chrome */}
                <div className="flex items-center gap-1.5 mb-4 pb-3 border-b border-white/[0.06]">
                  <div className="w-2 h-2 rounded-full bg-[#FF5F57]/40" />
                  <div className="w-2 h-2 rounded-full bg-[#FEBC2E]/40" />
                  <div className="w-2 h-2 rounded-full bg-[#28C840]/40" />
                  <span className="ml-3 font-mono text-[9px] text-white/20">agent.deploy.ts</span>
                </div>
                <CompilationTerminal visibleLines={visibleLines} />
              </div>

              {/* Step label below code */}
              <motion.div
                className="mt-4 text-center md:text-left"
                style={{ opacity: stepOpacity }}
              >
                <span className="font-mono text-[10px] tracking-[0.3em] text-[#FFD700]/60 uppercase">
                  STEP 1
                </span>
                <p className="font-mono text-xs md:text-sm text-white/40 mt-2 max-w-sm">
                  Initialize your AI on Base L2. 0.005 ETH deploys an autonomous agent with its own Farcaster identity.
                </p>
              </motion.div>
            </div>

            {/* Right: Holographic Blueprint Avatar — scroll-driven assembly */}
            <div className="relative flex items-center justify-center">
              <div className="w-[240px] h-[240px] md:w-[300px] md:h-[300px] lg:w-[360px] lg:h-[360px]">
                <HolographicAvatar progress={progress} />
              </div>

              {/* Status indicators — driven by avatar progress */}
              <motion.div
                className="absolute top-4 right-4 md:top-8 md:right-0"
                style={{ opacity: stepOpacity }}
              >
                <div className="space-y-2">
                  {[
                    { label: 'CHAIN', value: 'BASE (8453)', active: progress > 0.1 },
                    { label: 'MODEL', value: 'CLAUDE-3.5', active: progress > 0.25 },
                    { label: 'FARCASTER', value: '@ceo_alpha', active: progress > 0.4 },
                    { label: 'STATUS', value: progress > 0.8 ? 'LIVE' : 'DEPLOYING', active: true },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2 font-mono text-[9px] md:text-[10px]">
                      <span className={item.active ? 'text-[#00FF99]/70' : 'text-white/20'}>{item.label}</span>
                      <span className={item.active ? 'text-white/60' : 'text-white/15'}>{item.value}</span>
                      {item.active && item.label === 'STATUS' && (
                        <span className="relative flex h-1.5 w-1.5 ml-1">
                          <span className={`absolute inline-flex h-full w-full rounded-full ${progress > 0.8 ? 'bg-[#00FF99]' : 'bg-[#FFD700]'} opacity-75 animate-ping`} />
                          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${progress > 0.8 ? 'bg-[#00FF99]' : 'bg-[#FFD700]'}`} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Ambient glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none z-0"
          style={{
            background: 'radial-gradient(circle, rgba(0,255,153,0.06) 0%, transparent 60%)',
            filter: 'blur(60px)',
          }}
        />
      </div>
    </section>
  );
}
