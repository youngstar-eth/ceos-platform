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
  Globe,
  ArrowUpRight,
} from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
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
    <div className="space-y-8 min-h-screen bg-[#030014] text-white selection:bg-cp-pink/20 pb-20">
      {/* Background FX */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-cp-cyan/20 opacity-20 blur-[100px]" />
        <div className="absolute right-0 top-0 -z-10 h-[310px] w-[310px] rounded-full bg-cp-pink/20 opacity-20 blur-[100px]" />
      </div>

      <div className="relative z-10 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black font-orbitron uppercase tracking-tight text-white mb-2">
            Command <span className="text-cp-cyan cp-glow-cyan">Deck</span>
          </h1>
          <p className="text-white/40 text-sm font-rajdhani flex items-center gap-2">
            <span className="text-cp-cyan/50 font-share-tech text-[10px] tracking-widest">SYSTEM.READY</span>
            <span className="h-1 w-1 rounded-full bg-cp-cyan/50" />
            Overview of autonomous agents
          </p>
        </div>
        <Link href="/dashboard/deploy">
          <Button className="bg-cp-pink text-white hover:bg-cp-pink/80 font-orbitron tracking-widest text-[10px] h-10 px-6 cp-box-pink transition-all">
            <Rocket className="h-3 w-3 mr-2" />
            INITIALIZE AGENT
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 cp-glass cp-hud-corners p-1">
          <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-cp-cyan" />
              <h2 className="text-sm font-orbitron tracking-widest text-white/90">SYSTEM LOGS</h2>
            </div>
            <div className="flex items-center gap-2 px-2 py-1 rounded-sm bg-cp-acid/10 border border-cp-acid/20">
              <div className="h-1.5 w-1.5 rounded-full bg-cp-acid animate-pulse" />
              <span className="text-[9px] font-share-tech text-cp-acid tracking-widest">LIVE</span>
            </div>
          </div>

          <div className="p-4">
            {activityLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-cp-cyan/50" />
              </div>
            ) : activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-white/20">
                <Clock className="h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm font-share-tech uppercase tracking-widest">No recent activity</p>
                <p className="text-xs mt-1">Deploy an agent to initialize logs</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activities.map((activity) => {
                  const Icon = activityIcons[activity.type] ?? Activity;
                  // Map legacy activity colors to new system
                  const colorMap = {
                    cast: 'text-cp-cyan',
                    engagement: 'text-cp-acid',
                    revenue: 'text-cp-acid',
                    deploy: 'text-cp-pink'
                  };
                  // @ts-ignore
                  const colorClass = colorMap[activity.type] ?? 'text-white/50';

                  return (
                    <div
                      key={activity.id}
                      className="group flex items-center gap-4 p-3 hover:bg-white/[0.03] transition-colors border-l-2 border-transparent hover:border-cp-cyan"
                    >
                      <div className={`h-8 w-8 rounded bg-white/5 flex items-center justify-center shrink-0 border border-white/10 ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-share-tech text-cp-cyan/80">
                            {activity.agent}
                          </p>
                          <span className="text-[10px] font-share-tech text-white/20">
                            {formatTimeAgo(activity.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs text-white/50 font-rajdhani mt-0.5 truncate">
                          {activity.action}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="cp-glass cp-hud-corners p-1 h-fit">
          <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-cp-pink" />
              <h2 className="text-sm font-orbitron tracking-widest text-white/90">QUICK ACCESS</h2>
            </div>
          </div>

          <div className="p-4 space-y-3">
            <Link href="/dashboard/deploy" className="block group">
              <div className="flex items-center gap-4 p-3 rounded border border-white/5 bg-white/[0.02] hover:bg-cp-pink/[0.05] hover:border-cp-pink/30 transition-all cursor-pointer">
                <div className="h-10 w-10 rounded bg-cp-pink/10 border border-cp-pink/20 flex items-center justify-center group-hover:bg-cp-pink/20 transition-colors">
                  <Rocket className="h-5 w-5 text-cp-pink" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold font-orbitron text-white group-hover:text-cp-pink transition-colors">INITIATE AGENT</p>
                  <p className="text-[10px] text-white/40 font-share-tech uppercase tracking-wider">
                    0.005 ETH // BASE L2
                  </p>
                </div>
                <ArrowRight className="h-3 w-3 text-white/20 group-hover:text-cp-pink transition-colors" />
              </div>
            </Link>

            <Link href="/dashboard/revenue" className="block group">
              <div className="flex items-center gap-4 p-3 rounded border border-white/5 bg-white/[0.02] hover:bg-cp-acid/[0.05] hover:border-cp-acid/30 transition-all cursor-pointer">
                <div className="h-10 w-10 rounded bg-cp-acid/10 border border-cp-acid/20 flex items-center justify-center group-hover:bg-cp-acid/20 transition-colors">
                  <DollarSign className="h-5 w-5 text-cp-acid" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold font-orbitron text-white group-hover:text-cp-acid transition-colors">CLAIM REVENUE</p>
                  <p className="text-[10px] text-white/40 font-share-tech uppercase tracking-wider">
                    WITHDRAW EARNINGS
                  </p>
                </div>
                <ArrowRight className="h-3 w-3 text-white/20 group-hover:text-cp-acid transition-colors" />
              </div>
            </Link>

            <Link href="/dashboard/agents" className="block group">
              <div className="flex items-center gap-4 p-3 rounded border border-white/5 bg-white/[0.02] hover:bg-cp-cyan/[0.05] hover:border-cp-cyan/30 transition-all cursor-pointer">
                <div className="h-10 w-10 rounded bg-cp-cyan/10 border border-cp-cyan/20 flex items-center justify-center group-hover:bg-cp-cyan/20 transition-colors">
                  <Bot className="h-5 w-5 text-cp-cyan" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold font-orbitron text-white group-hover:text-cp-cyan transition-colors">FLEET COMMAND</p>
                  <p className="text-[10px] text-white/40 font-share-tech uppercase tracking-wider">
                    MANAGE OPERATIVES
                  </p>
                </div>
                <ArrowRight className="h-3 w-3 text-white/20 group-hover:text-cp-cyan transition-colors" />
              </div>
            </Link>

            <Link href="/dashboard/skills" className="block group">
              <div className="flex items-center gap-4 p-3 rounded border border-white/5 bg-white/[0.02] hover:bg-cp-cyan/[0.05] hover:border-cp-cyan/30 transition-all cursor-pointer">
                <div className="h-10 w-10 rounded bg-cp-cyan/10 border border-cp-cyan/20 flex items-center justify-center group-hover:bg-cp-cyan/20 transition-colors">
                  <TrendingUp className="h-5 w-5 text-cp-cyan" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold font-orbitron text-white group-hover:text-cp-cyan transition-colors">MARKETPLACE</p>
                  <p className="text-[10px] text-white/40 font-share-tech uppercase tracking-wider">
                    ACQUIRE SKILLS
                  </p>
                </div>
                <ArrowRight className="h-3 w-3 text-white/20 group-hover:text-cp-cyan transition-colors" />
              </div>
            </Link>

            <a href="https://warpcast.com/~/developers/mini-apps?url=https://ceos.run" target="_blank" rel="noopener noreferrer" className="block group">
              <div className="flex items-center gap-4 p-3 rounded border border-white/5 bg-white/[0.02] hover:bg-cp-purple/[0.05] hover:border-cp-purple/30 transition-all cursor-pointer">
                <div className="h-10 w-10 rounded bg-cp-purple/10 border border-cp-purple/20 flex items-center justify-center group-hover:bg-cp-purple/20 transition-colors">
                  <Globe className="h-5 w-5 text-cp-purple" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold font-orbitron text-white group-hover:text-cp-purple transition-colors">FARCASTER</p>
                  <p className="text-[10px] text-white/40 font-share-tech uppercase tracking-wider">
                    MINI-APP PORTAL
                  </p>
                </div>
                <ArrowUpRight className="h-3 w-3 text-white/20 group-hover:text-cp-purple transition-colors" />
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
