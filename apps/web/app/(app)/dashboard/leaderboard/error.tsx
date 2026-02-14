'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LeaderboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div>
          <h2 className="text-lg font-semibold">Failed to load leaderboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {error.message || 'An unexpected error occurred while loading the leaderboard.'}
          </p>
        </div>
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      </div>
    </div>
  );
}
