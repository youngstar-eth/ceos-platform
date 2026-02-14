import { Loader2 } from 'lucide-react';

export default function LeaderboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-neon-green/50" />
        <p className="text-sm text-muted-foreground">Loading leaderboard...</p>
      </div>
    </div>
  );
}
