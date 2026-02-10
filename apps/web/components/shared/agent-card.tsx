'use client';

import Link from 'next/link';
import { Bot, MessageSquare, Heart, Repeat2, Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, formatCompactNumber } from '@/lib/utils';
import { type Agent } from '@/hooks/use-agent';

interface AgentCardProps {
  agent: Agent;
}

const statusColors: Record<Agent['status'], string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  paused: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  terminated: 'bg-red-500/10 text-red-500 border-red-500/20',
  deploying: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export function AgentCard({ agent }: AgentCardProps) {
  return (
    <Link href={`/dashboard/agents/${agent.id}`}>
      <Card className="hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5 cursor-pointer group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">{agent.name}</h3>
                {agent.farcasterUsername && (
                  <p className="text-xs text-muted-foreground">
                    @{agent.farcasterUsername}
                  </p>
                )}
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn('text-[10px] capitalize', statusColors[agent.status])}
            >
              {agent.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
            {agent.description}
          </p>

          <div className="grid grid-cols-4 gap-2">
            <MetricItem
              icon={MessageSquare}
              value={agent.metrics.totalCasts}
              label="Casts"
            />
            <MetricItem
              icon={Heart}
              value={agent.metrics.totalLikes}
              label="Likes"
            />
            <MetricItem
              icon={Repeat2}
              value={agent.metrics.totalRecasts}
              label="Recasts"
            />
            <MetricItem
              icon={Users}
              value={agent.metrics.totalFollowers}
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
