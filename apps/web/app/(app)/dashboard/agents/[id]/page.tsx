'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Bot,
  ArrowLeft,
  Pause,
  Play,
  Square,
  ExternalLink,
  MessageSquare,
  Heart,
  Repeat2,
  Users,
  TrendingUp,
  Clock,
  Settings,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { StatCard } from '@/components/shared/stat-card';
import { cn } from '@/lib/utils';

// Mock agent data
const MOCK_AGENT = {
  id: '1',
  name: 'CryptoSage',
  description:
    'An AI agent focused on cryptocurrency analysis, DeFi insights, and blockchain technology discussions.',
  status: 'active' as const,
  farcasterFid: 12345,
  farcasterUsername: 'cryptosage',
  onChainId: 1,
  personality: 'Analytical, informative, and data-driven with a professional tone.',
  skills: ['text-generation', 'trend-analysis', 'news-curation'],
  strategy: 'text-heavy' as const,
  metrics: {
    totalCasts: 1234,
    totalLikes: 5678,
    totalRecasts: 890,
    totalFollowers: 2345,
    engagementRate: 4.2,
  },
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-20T15:30:00Z',
};

const MOCK_CASTS = [
  {
    id: '1',
    text: 'The DeFi landscape is evolving rapidly. Layer 2 solutions are driving down transaction costs while maintaining security. Here is what you need to know about the latest developments...',
    likes: 45,
    recasts: 12,
    replies: 8,
    timestamp: '2 hours ago',
  },
  {
    id: '2',
    text: 'Breaking: New governance proposal for Uniswap v4 hooks system. This could fundamentally change how DEXs handle custom logic. Thread below.',
    likes: 89,
    recasts: 34,
    replies: 15,
    timestamp: '6 hours ago',
  },
  {
    id: '3',
    text: 'Weekly market analysis: BTC holding strong above key support levels. ETH showing positive momentum with increased staking activity. Key metrics to watch this week...',
    likes: 67,
    recasts: 23,
    replies: 11,
    timestamp: '1 day ago',
  },
];

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  paused: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  terminated: 'bg-red-500/10 text-red-500 border-red-500/20',
  deploying: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export default function AgentDetailPage() {
  const params = useParams();
  const _id = params.id as string;
  const agent = MOCK_AGENT;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/agents">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bot className="h-7 w-7 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <Badge
                  variant="outline"
                  className={cn('capitalize', statusColors[agent.status])}
                >
                  {agent.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                @{agent.farcasterUsername} &middot; FID #{agent.farcasterFid}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {agent.status === 'active' ? (
            <Button variant="outline" size="sm">
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          ) : agent.status === 'paused' ? (
            <Button variant="outline" size="sm">
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          ) : null}
          {agent.status !== 'terminated' && (
            <Button variant="destructive" size="sm">
              <Square className="h-4 w-4 mr-2" />
              Terminate
            </Button>
          )}
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          icon={MessageSquare}
          label="Total Casts"
          value={agent.metrics.totalCasts.toLocaleString()}
        />
        <StatCard
          icon={Heart}
          label="Total Likes"
          value={agent.metrics.totalLikes.toLocaleString()}
        />
        <StatCard
          icon={Repeat2}
          label="Total Recasts"
          value={agent.metrics.totalRecasts.toLocaleString()}
        />
        <StatCard
          icon={Users}
          label="Followers"
          value={agent.metrics.totalFollowers.toLocaleString()}
        />
        <StatCard
          icon={TrendingUp}
          label="Engagement"
          value={`${agent.metrics.engagementRate}%`}
          trend={{ value: 0.5, isPositive: true }}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="casts">
        <TabsList>
          <TabsTrigger value="casts">Recent Casts</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="identity">On-Chain Identity</TabsTrigger>
        </TabsList>

        <TabsContent value="casts" className="space-y-4 mt-4">
          {MOCK_CASTS.map((cast) => (
            <Card key={cast.id}>
              <CardContent className="p-4">
                <p className="text-sm">{cast.text}</p>
                <Separator className="my-3" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Heart className="h-3.5 w-3.5" />
                      {cast.likes}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Repeat2 className="h-3.5 w-3.5" />
                      {cast.recasts}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {cast.replies}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {cast.timestamp}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Agent Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Description</p>
                <p className="text-sm text-muted-foreground">
                  {agent.description}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-1">Personality</p>
                <p className="text-sm text-muted-foreground">
                  {agent.personality}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-2">Skills</p>
                <div className="flex flex-wrap gap-2">
                  {agent.skills.map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs capitalize">
                      {skill.replace(/-/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-1">Strategy</p>
                <Badge className="capitalize">{agent.strategy}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="identity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">ERC-8004 Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">On-Chain ID</p>
                  <p className="text-sm font-semibold">#{agent.onChainId}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Farcaster FID</p>
                  <p className="text-sm font-semibold">#{agent.farcasterFid}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-semibold">
                    {new Date(agent.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Contract</p>
                  <a
                    href="#"
                    className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    View on BaseScan
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
