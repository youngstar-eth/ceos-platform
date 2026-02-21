'use client';

import Link from 'next/link';
import { Bot, MessageSquare, Heart, Repeat2, Users, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatCompactNumber } from '@/lib/utils';
import { type Agent } from '@/hooks/use-agent';
import { getTierForScore } from '@ceosrun/shared/types';
import { TierBadge } from '@/components/leaderboard/tier-badge';
import { formatScore } from '@/lib/leaderboard-utils';

interface AgentCardProps {
  agent: Agent;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  ACTIVE: 'bg-green-500/10 text-green-500 border-green-500/20',
  paused: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  terminated: 'bg-red-500/10 text-red-500 border-red-500/20',
  TERMINATED: 'bg-red-500/10 text-red-500 border-red-500/20',
  deploying: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  DEPLOYING: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  PENDING: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  FAILED: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export function AgentCard({ agent }: AgentCardProps) {
  const metrics = agent.metrics ?? {
    totalCasts: 0,
    totalLikes: 0,
    totalRecasts: 0,
    totalFollowers: 0,
  };

  const reputationScore = agent.identity?.reputationScore ?? 0;
  const tier = getTierForScore(reputationScore);

  return (
    <Link href={`/dashboard/agents/${agent.id}`}>
      <Card className="hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 cursor-pointer group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {agent.pfpUrl ? (
                <img
                  src={agent.pfpUrl}
                  alt={`${agent.name} avatar`}
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <h3 className="font-semibold text-sm">{agent.name}</h3>
                {agent.farcasterUsername && (
                  <p className="text-xs text-muted-foreground">
                    @{agent.farcasterUsername}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {agent.identity && <TierBadge tier={tier} size="sm" />}
              <Badge
                variant="outline"
                className={cn('text-[10px] capitalize', statusColors[agent.status] ?? '')}
              >
                {agent.status.toLowerCase()}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
            {agent.description ?? 'No description'}
          </p>

          {/* Reputation Score bar */}
          {agent.identity && (
            <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-md bg-muted/50">
              <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-muted-foreground font-medium">Reputation</span>
                  <span className="font-semibold">{formatScore(reputationScore)}</span>
                </div>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (reputationScore / 10000) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <MetricItem
              icon={MessageSquare}
              value={metrics.totalCasts}
              label="Casts"
            />
            <MetricItem
              icon={Heart}
              value={metrics.totalLikes}
              label="Likes"
            />
            <MetricItem
              icon={Repeat2}
              value={metrics.totalRecasts}
              label="Recasts"
            />
            <MetricItem
              icon={Users}
              value={metrics.totalFollowers}
              label="Followers"
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MetricItem({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-semibold">
        {formatCompactNumber(value)}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
