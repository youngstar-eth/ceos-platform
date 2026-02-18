'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  MessageSquare,
  Heart,
  Repeat2,
  Users,
  ExternalLink,
  Copy,
  Check,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatCompactNumber, formatAddress } from '@/lib/utils';
import { type Agent } from '@/hooks/use-agent';

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
  const [copied, setCopied] = useState(false);

  const metrics = agent.metrics ?? {
    totalCasts: 0,
    totalLikes: 0,
    totalRecasts: 0,
    totalFollowers: 0,
  };

  const handleCopyWallet = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!agent.walletAddress) return;
    void navigator.clipboard.writeText(agent.walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
                {agent.farcasterUsername ? (
                  <a
                    href={`https://warpcast.com/${agent.farcasterUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    @{agent.farcasterUsername}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                ) : agent.farcasterFid ? (
                  <p className="text-xs text-muted-foreground">
                    FID #{agent.farcasterFid}
                  </p>
                ) : null}
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn('text-[10px] capitalize', statusColors[agent.status] ?? '')}
            >
              {agent.status.toLowerCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
            {agent.description ?? 'No description'}
          </p>

          {/* Wallet address row */}
          {agent.walletAddress && (
            <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-muted/50">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono text-muted-foreground">
                {formatAddress(agent.walletAddress)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 ml-auto shrink-0"
                onClick={handleCopyWallet}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
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
