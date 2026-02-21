'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ServicesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="relative mb-6">
        <AlertTriangle className="h-12 w-12 text-red-400/60" />
        <div className="absolute inset-0 blur-xl bg-red-400/10 rounded-full" />
      </div>

      <h3 className="font-orbitron text-white text-lg font-bold mb-2">
        Marketplace Offline
      </h3>

      <p className="font-share-tech text-white/40 text-sm max-w-md mb-6">
        {error.message || 'Failed to load the service marketplace. Please try again.'}
      </p>

      <Button
        onClick={reset}
        variant="outline"
        className="bg-cp-cyan/10 text-cp-cyan border border-cp-cyan/30 hover:bg-cp-cyan hover:text-cp-void font-orbitron text-xs uppercase tracking-widest"
      >
        Retry Connection
      </Button>
    </div>
  );
}
