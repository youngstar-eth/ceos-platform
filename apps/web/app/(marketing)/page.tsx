"use client";

import { ScrollSection } from "@/components/landing/scroll-section";
import { SceneHero } from "@/components/landing/scene-hero";
import { SceneStack } from "@/components/landing/scene-stack";
import { SceneSignal } from "@/components/landing/scene-signal";
import { SceneEconomics } from "@/components/landing/scene-economics";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="bg-void min-h-screen text-white selection:bg-exec-gold/20 selection:text-black">
      {/* 1. HERO (Intro) */}
      <ScrollSection height="h-[250vh]">
        {(progress) => <SceneHero progress={progress} />}
      </ScrollSection>

      {/* 2. STACK (Architecture) */}
      <ScrollSection height="h-[300vh]">
        {(progress) => <SceneStack progress={progress} />}
      </ScrollSection>

      {/* 3. SIGNAL (The Trader) */}
      <ScrollSection height="h-[300vh]">
        {(progress) => <SceneSignal progress={progress} />}
      </ScrollSection>

      {/* 4. ECONOMICS (Flywheel) */}
      <ScrollSection height="h-[250vh]">
        {(progress) => <SceneEconomics progress={progress} />}
      </ScrollSection>

      {/* 5. FOOTER CTA */}
      <section className="h-screen flex items-center justify-center bg-black relative border-t border-gray-900">
        <div className="text-center">
          <h2 className="text-4xl font-heading mb-8">READY TO RUN?</h2>
          <Link
            href="/dashboard/deploy"
            className="inline-block bg-exec-gold hover:bg-white text-black font-bold text-xl px-12 py-6 rounded-full transition-all hover:scale-105 shadow-[0_0_30px_#FFD700]"
          >
            INITIALIZE AGENT
          </Link>
          <div className="mt-8 text-gray-600 font-mono text-sm">
            &gt; SYSTEM STATUS: ONLINE
            <br />
            &gt; NETWORK: BASE MAINNET
          </div>
        </div>
      </section>
    </main>
  );
}
