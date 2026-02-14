'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import {
  Bot,
  DollarSign,
  TrendingUp,
  Rocket,
  ArrowRight,
  Activity,
  Clock,
  Loader2,
} from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAgents } from '@/hooks/use-agent';
import { useClaimableAmount, useOnChainCreatorScore, useCurrentEpoch } from '@/hooks/use-revenue';

interface ActivityItem {
  id: string;
  type: 'cast' | 'engagement' | 'revenue' | 'deploy';
  agent: string;
  action: string;
  timestamp: string;
}

function useRecentActivity() {
  const { address } = useAccount();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch('/api/dashboard/activity?limit=5', {
      headers: { 'x-wallet-address': address },
    })
      .then((res) => res.json())
      .then((json: { success: boolean; data: ActivityItem[] }) => {
        if (json.success) {
          setActivities(json.data);
        }
      })
      .catch(() => {
        // Silently fail — activity is non-critical
      })
      .finally(() => setIsLoading(false));
  }, [address]);

  return { activities, isLoading };
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  cast: Activity,
  engagement: TrendingUp,
  revenue: DollarSign,
  deploy: Rocket,
};

const activityColors: Record<string, string> = {
  cast: 'text-neon-cyan bg-neon-cyan/10 border-neon-cyan/20',
  engagement: 'text-neon-green bg-neon-green/10 border-neon-green/20',
  revenue: 'text-neon-yellow bg-neon-yellow/10 border-neon-yellow/20',
  deploy: 'text-neon-purple bg-neon-purple/10 border-neon-purple/20',
};

export default function DashboardPage() {
  const { data: agentsResponse, isLoading: agentsLoading } = useAgents(1, 100);
  const { data: epochRaw } = useCurrentEpoch();
  const currentEpochBigInt = epochRaw as bigint | undefined;
  const { data: claimableRaw } = useClaimableAmount(currentEpochBigInt);
  const { data: scoreRaw } = useOnChainCreatorScore(currentEpochBigInt);
  const { activities, isLoading: activityLoading } = useRecentActivity();

  const agents = agentsResponse?.data ?? [];
  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.status === 'ACTIVE').length;

  // Format claimable as ETH
  const claimableWei = claimableRaw as bigint | undefined;
  const claimableEth = claimableWei
    ? (Number(claimableWei) / 1e18).toFixed(4)
    : '0';

  // Creator score from on-chain
  const creatorScore = scoreRaw ? Number(scoreRaw) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-orbitron text-neon-green">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            <span className="text-neon-green/30 font-pixel text-[10px]">{'>'}</span> Overview of your agents and revenue
          </p>
        </div>
        <Link href="/dashboard/deploy">
          <Button className="brand-gradient text-void hover:opacity-90 font-semibold">
            <Rocket className="h-4 w-4 mr-2" />
            Deploy Agent
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Bot}
          label="Total Agents"
          value={agentsLoading ? '...' : String(totalAgents)}
          description={`${activeAgents} currently active`}
        />
        <StatCard
          icon={DollarSign}
          label="Claimable Revenue"
          value={`${claimableEth} ETH`}
          description="Available to claim"
        />
        <StatCard
          icon={TrendingUp}
          label="Creator Score"
          value={creatorScore > 0 ? String(creatorScore) : '--'}
          description="On-chain score"
        />
        <StatCard
          icon={Activity}
          label="Active Agents"
          value={agentsLoading ? '...' : String(activeAgents)}
          description="Publishing content"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-2 border-neon-green/10 bg-void/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-rajdhani">Recent Activity</CardTitle>
            <Badge variant="outline" className="text-xs border-neon-green/20 text-neon-green">
              <div className="h-1.5 w-1.5 rounded-full bg-neon-green animate-neon-pulse mr-1.5" />
              Live
            </Badge>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-neon-green/50" />
              </div>
            ) : activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Deploy an agent to get started
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {activities.map((activity) => {
                  const Icon = activityIcons[activity.type] ?? Activity;
                  const colorClass = activityColors[activity.type] ?? 'text-muted-foreground bg-muted';
                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 pb-4 border-b border-neon-green/5 last:border-0 last:pb-0"
                    >
                      <div className={`h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium text-foreground">{activity.agent}</span>
                          {' '}
                          <span className="text-muted-foreground">
                            {activity.action}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-0.5 font-pixel">
                          {formatTimeAgo(activity.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-neon-green/10 bg-void/50">
          <CardHeader>
            <CardTitle className="text-lg font-rajdhani">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/dashboard/deploy" className="block">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-neon-green/10 hover:border-neon-green/25 hover:bg-neon-green/[0.03] transition-all cursor-pointer cyber-card">
                <div className="h-10 w-10 rounded-lg bg-neon-green/10 border border-neon-green/20 flex items-center justify-center">
                  <Rocket className="h-5 w-5 text-neon-green" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Deploy New Agent</p>
                  <p className="text-xs text-muted-foreground">
                    0.005 ETH on Base
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-neon-green/30" />
              </div>
            </Link>
            <Link href="/dashboard/revenue" className="block">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-neon-green/10 hover:border-neon-cyan/25 hover:bg-neon-cyan/[0.03] transition-all cursor-pointer cyber-card">
                <div className="h-10 w-10 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-neon-cyan" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Claim Revenue</p>
                  <p className="text-xs text-muted-foreground">
                    Check your earnings
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-neon-cyan/30" />
              </div>
            </Link>
            <Link href="/dashboard/agents" className="block">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-neon-green/10 hover:border-neon-purple/25 hover:bg-neon-purple/[0.03] transition-all cursor-pointer cyber-card">
                <div className="h-10 w-10 rounded-lg bg-neon-purple/10 border border-neon-purple/20 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-neon-purple" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Manage Agents</p>
                  <p className="text-xs text-muted-foreground">
                    View all your agents
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-neon-purple/30" />
              </div>
            </Link>
            <Link href="/dashboard/skills" className="block">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-neon-green/10 hover:border-neon-yellow/25 hover:bg-neon-yellow/[0.03] transition-all cursor-pointer cyber-card">
                <div className="h-10 w-10 rounded-lg bg-neon-yellow/10 border border-neon-yellow/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-neon-yellow" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Browse Skills</p>
                  <p className="text-xs text-muted-foreground">
                    Free & premium skills
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-neon-yellow/30" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
