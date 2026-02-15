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
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { StatCard } from '@/components/shared/stat-card';
import { useAgent } from '@/hooks/use-agent';
import { cn, getBaseScanUrl } from '@/lib/utils';

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-500/10 text-green-500 border-green-500/20',
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  PAUSED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  paused: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  TERMINATED: 'bg-red-500/10 text-red-500 border-red-500/20',
  terminated: 'bg-red-500/10 text-red-500 border-red-500/20',
  DEPLOYING: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  deploying: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  PENDING: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  FAILED: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: response, isLoading, error } = useAgent(id);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading agent...</p>
      </div>
    );
  }

  if (error || !response?.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Bot className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Agent Not Found</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {error?.message ?? 'The agent you are looking for does not exist.'}
        </p>
        <Link href="/dashboard/agents">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Agents
          </Button>
        </Link>
      </div>
    );
  }

  const agent = response.data;
  const agentRecord = agent as unknown as Record<string, unknown>;
  const persona = agentRecord.persona as Record<string, unknown> | null;
  const strategy = agentRecord.strategy as Record<string, unknown> | null;
  const casts = (agentRecord.casts as Array<Record<string, unknown>>) ?? [];
  const metrics = (agentRecord.metrics as Array<Record<string, unknown>>) ?? [];
  const identity = agentRecord.identity as Record<string, unknown> | null;
  const latestMetrics = metrics[0] ?? null;

  const totalCasts = latestMetrics ? Number(latestMetrics.totalCasts ?? 0) : casts.length;
  const totalLikes = latestMetrics ? Number(latestMetrics.totalLikes ?? 0) : 0;
  const totalRecasts = latestMetrics ? Number(latestMetrics.totalRecasts ?? 0) : 0;
  const engagementRate = latestMetrics ? Number(latestMetrics.engagementRate ?? 0) : 0;

  return (
    <div className="space-y-6">
      {/* Banner */}
      {agent.bannerUrl && (
        <div className="w-full h-32 rounded-xl overflow-hidden -mb-2">
          <img
            src={agent.bannerUrl}
            alt={`${agent.name} banner`}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/agents">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            {agent.pfpUrl ? (
              <img
                src={agent.pfpUrl}
                alt={`${agent.name} avatar`}
                className="h-14 w-14 rounded-xl object-cover"
              />
            ) : (
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bot className="h-7 w-7 text-primary" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <Badge
                  variant="outline"
                  className={cn('capitalize', statusColors[agent.status] ?? '')}
                >
                  {agent.status.toLowerCase()}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {agent.farcasterFid ? (
                  <>FID #{agent.farcasterFid}</>
                ) : (
                  <>ID: {agent.id.slice(0, 8)}...</>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {agent.status === 'ACTIVE' || agent.status === 'active' ? (
            <Button variant="outline" size="sm">
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          ) : (agent.status === 'PAUSED' || agent.status === 'paused') ? (
            <Button variant="outline" size="sm">
              <Play className="h-4 w-4 mr-2" />
              Resume
            </Button>
          ) : null}
          {agent.status !== 'TERMINATED' && agent.status !== 'terminated' && (
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
          value={totalCasts.toLocaleString()}
        />
        <StatCard
          icon={Heart}
          label="Total Likes"
          value={totalLikes.toLocaleString()}
        />
        <StatCard
          icon={Repeat2}
          label="Total Recasts"
          value={totalRecasts.toLocaleString()}
        />
        <StatCard
          icon={Users}
          label="Followers"
          value="—"
        />
        <StatCard
          icon={TrendingUp}
          label="Engagement"
          value={engagementRate > 0 ? `${engagementRate.toFixed(1)}%` : '—'}
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
          {casts.length > 0 ? (
            casts.map((cast) => (
              <Card key={String(cast.id)}>
                <CardContent className="p-4">
                  <p className="text-sm">{String(cast.content ?? '')}</p>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Heart className="h-3.5 w-3.5" />
                        {Number(cast.likes ?? 0)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Repeat2 className="h-3.5 w-3.5" />
                        {Number(cast.recasts ?? 0)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {Number(cast.replies ?? 0)}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {cast.publishedAt
                        ? new Date(String(cast.publishedAt)).toLocaleDateString()
                        : 'Draft'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
                <p>No casts yet. The agent will start posting once activated.</p>
              </CardContent>
            </Card>
          )}
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
                  {agent.description ?? 'No description provided.'}
                </p>
              </div>
              <Separator />
              {persona && (
                <>
                  <div>
                    <p className="text-sm font-medium mb-1">Tone</p>
                    <p className="text-sm text-muted-foreground">
                      {String(persona.tone ?? 'N/A')}
                    </p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-1">Style</p>
                    <p className="text-sm text-muted-foreground">
                      {String(persona.style ?? 'N/A')}
                    </p>
                  </div>
                  <Separator />
                </>
              )}
              <div>
                <p className="text-sm font-medium mb-2">Skills</p>
                <div className="flex flex-wrap gap-2">
                  {(agent.skills ?? []).map((skill: string) => (
                    <Badge key={skill} variant="outline" className="text-xs capitalize">
                      {skill.replace(/-/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
              <Separator />
              {strategy && (
                <div>
                  <p className="text-sm font-medium mb-1">Strategy</p>
                  <div className="flex gap-2">
                    <Badge>Frequency: {String(strategy.postingFrequency ?? 'N/A')}h</Badge>
                    <Badge variant="outline">Mode: {String(strategy.engagementMode ?? 'N/A')}</Badge>
                  </div>
                </div>
              )}
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
                  <p className="text-xs text-muted-foreground">Agent ID</p>
                  <p className="text-sm font-semibold font-mono">{agent.id}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Farcaster FID</p>
                  <p className="text-sm font-semibold">
                    {agent.farcasterFid ? `#${agent.farcasterFid}` : 'Not assigned'}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-semibold">
                    {new Date(agent.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">On-Chain</p>
                  {agent.onChainId ? (
                    <a
                      href={`${getBaseScanUrl()}/address/${String(agentRecord.onChainAddress ?? '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      View on BaseScan
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not registered</p>
                  )}
                </div>
                {identity && (
                  <>
                    <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                      <p className="text-xs text-muted-foreground">Token ID</p>
                      <p className="text-sm font-semibold">#{String(identity.tokenId)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                      <p className="text-xs text-muted-foreground">Reputation</p>
                      <p className="text-sm font-semibold">{String(identity.reputationScore ?? 0)}/100</p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
