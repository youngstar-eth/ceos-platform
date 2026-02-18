'use client';

import { Header } from '@/components/shared/header';
import { Sidebar } from '@/components/shared/sidebar';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { DebugDeploy } from '@/components/debug-deploy';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col relative">
      {/* Subtle grid texture on entire dashboard */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.02] bg-[linear-gradient(to_right,rgba(5,217,232,0.4)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,42,109,0.3)_1px,transparent_1px)] bg-[length:40px_40px]" />

      {/* Very subtle CRT scanlines */}
      <div className="fixed inset-0 pointer-events-none z-[60] crt-scanlines-subtle" />

      <Header />
      <div className="flex flex-1 relative z-10">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="container py-6 lg:py-8 max-w-7xl">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>

      {/* 🚨 DEBUG — Remove after testing */}
      <DebugDeploy />
    </div>
  );
}
