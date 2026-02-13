'use client';

import { Header } from '@/components/shared/header';
import { Sidebar } from '@/components/shared/sidebar';
import { ErrorBoundary } from '@/components/shared/error-boundary';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col relative">
      {/* Memphis grid texture on entire dashboard */}
      <div className="fixed inset-0 pointer-events-none z-0 memphis-grid opacity-[0.04]" />

      {/* Very subtle CRT scanlines */}
      <div className="fixed inset-0 pointer-events-none z-[60] crt-scanlines-subtle" />

      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-neon-purple/[0.02] blur-[150px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-neon-pink/[0.02] blur-[120px]" />
      </div>

      <Header />
      <div className="flex flex-1 relative z-10">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="container py-6 lg:py-8 max-w-7xl">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
