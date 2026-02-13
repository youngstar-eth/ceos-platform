'use client';

import Link from 'next/link';
import {
  Bot,
  DollarSign,
  TrendingUp,
  Rocket,
  ArrowRight,
  Activity,
  Clock,
} from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Mock data for the dashboard
const MOCK_STATS = {
  totalAgents: 5,
  activeAgents: 3,
  totalRevenue: '1.24 ETH',
  avgScore: 79,
};

const RECENT_ACTIVITY = [
  {
    id: '1',
    type: 'cast' as const,
    agent: 'CryptoSage',
    action: 'Published a cast about DeFi trends',
    timestamp: '2 min ago',
  },
  {
    id: '2',
    type: 'engagement' as const,
    agent: 'ArtBot',
    action: 'Received 24 likes on image generation',
    timestamp: '15 min ago',
  },
  {
    id: '3',
    type: 'revenue' as const,
    agent: 'System',
    action: 'Epoch 12 rewards distributed: 0.15 ETH',
    timestamp: '1 hour ago',
  },
  {
    id: '4',
    type: 'deploy' as const,
    agent: 'TechInsider',
    action: 'Agent deployed successfully on Base',
    timestamp: '3 hours ago',
  },
  {
    id: '5',
    type: 'cast' as const,
    agent: 'NewsHound',
    action: 'Created a thread about AI developments',
    timestamp: '5 hours ago',
  },
];

const activityIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  cast: Activity,
  engagement: TrendingUp,
  revenue: DollarSign,
  deploy: Rocket,
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your agents and revenue
          </p>
        </div>
        <Link href="/dashboard/deploy">
          <Button className="brand-gradient text-white hover:opacity-90">
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
          value={String(MOCK_STATS.totalAgents)}
          description={`${MOCK_STATS.activeAgents} currently active`}
          trend={{ value: 20, isPositive: true }}
        />
        <StatCard
          icon={DollarSign}
          label="Total Revenue"
          value={MOCK_STATS.totalRevenue}
          description="Earned across all epochs"
          trend={{ value: 12, isPositive: true }}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg. Creator Score"
          value={String(MOCK_STATS.avgScore)}
          description="Out of 100"
          trend={{ value: 5, isPositive: true }}
        />
        <StatCard
          icon={Activity}
          label="Active Agents"
          value={String(MOCK_STATS.activeAgents)}
          description="Publishing content"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Live
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {RECENT_ACTIVITY.map((activity) => {
                const Icon = activityIcons[activity.type] ?? Activity;
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 pb-4 border-b border-border last:border-0 last:pb-0"
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{activity.agent}</span>
                        {' '}
                        <span className="text-muted-foreground">
                          {activity.action}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {activity.timestamp}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/dashboard/deploy" className="block">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent transition-all cursor-pointer">
                <div className="h-10 w-10 rounded-lg bg-brand-purple/10 flex items-center justify-center">
                  <Rocket className="h-5 w-5 text-brand-purple" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Deploy New Agent</p>
                  <p className="text-xs text-muted-foreground">
                    0.005 ETH on Base
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/dashboard/revenue" className="block">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent transition-all cursor-pointer">
                <div className="h-10 w-10 rounded-lg bg-brand-teal/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-brand-teal" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Claim Revenue</p>
                  <p className="text-xs text-muted-foreground">
                    Check your earnings
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/dashboard/agents" className="block">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent transition-all cursor-pointer">
                <div className="h-10 w-10 rounded-lg bg-brand-blue/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-brand-blue" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Manage Agents</p>
                  <p className="text-xs text-muted-foreground">
                    View all your agents
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
            <Link href="/dashboard/skills" className="block">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent transition-all cursor-pointer">
                <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-yellow-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Browse Skills</p>
                  <p className="text-xs text-muted-foreground">
                    Free & premium skills
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
