'use client';

import { useState } from 'react';
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
  Copy,
  Check,
  Wallet,
  Shield,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { StatCard } from '@/components/shared/stat-card';
import { useAccount } from 'wagmi';
import { useAgent, useActivateAgent } from '@/hooks/use-agent';
import { cn, formatAddress, getBaseScanUrl } from '@/lib/utils';

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

function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-6 w-6 shrink-0', className)}
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { address: connectedAddress } = useAccount();
  const { data: response, isLoading, error } = useAgent(id);
  const activateMutation = useActivateAgent();
  const [farcasterInput, setFarcasterInput] = useState('');
  const [showActivateForm, setShowActivateForm] = useState(false);

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
  const walletPolicy = agent.walletPolicy;

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
              <div className="flex items-center gap-3 mt-0.5">
                {agent.farcasterUsername ? (
                  <a
                    href={`https://warpcast.com/${agent.farcasterUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    @{agent.farcasterUsername}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : agent.farcasterFid ? (
                  <span className="text-sm text-muted-foreground">
                    FID #{agent.farcasterFid}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    ID: {agent.id.slice(0, 8)}...
                  </span>
                )}
                {agent.walletAddress && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5" />
                    <span className="font-mono">{formatAddress(agent.walletAddress)}</span>
                    <CopyButton value={agent.walletAddress} />
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(agent.status === 'PENDING' || agent.status === 'DEPLOYING') && (
            <Button
              size="sm"
              className="bg-primary"
              onClick={() => setShowActivateForm(!showActivateForm)}
            >
              <Zap className="h-4 w-4 mr-2" />
              Activate
            </Button>
          )}
          {agent.farcasterUsername && (
            <a
              href={`https://warpcast.com/${agent.farcasterUsername}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-2" />
                Warpcast
              </Button>
            </a>
          )}
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

      {/* Activate Form */}
      {showActivateForm && (agent.status === 'PENDING' || agent.status === 'DEPLOYING') && (
        <Card className="border-primary/50">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">
              Activate Agent &mdash; Link a Farcaster account and create a CDP MPC wallet
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Farcaster username (e.g. dwr.eth)"
                value={farcasterInput}
                onChange={(e) => setFarcasterInput(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-md border bg-background"
              />
              <Button
                size="sm"
                disabled={!farcasterInput.trim() || activateMutation.isPending}
                onClick={() => {
                  activateMutation.mutate({
                    id: agent.id,
                    farcasterUsername: farcasterInput.trim(),
                    walletAddress: connectedAddress,
                  });
                }}
              >
                {activateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating wallet...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Confirm
                  </>
                )}
              </Button>
            </div>
            {activateMutation.isError && (
              <p className="text-sm text-red-500 mt-2">
                {activateMutation.error.message}
              </p>
            )}
            {activateMutation.isSuccess && (
              <div className="mt-3 p-3 rounded-md bg-green-500/10 border border-green-500/20">
                <p className="text-sm text-green-500 font-medium">
                  {activateMutation.data.data.message}
                </p>
                {activateMutation.data.data.agent.walletAddress && (
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    CDP Wallet: {activateMutation.data.data.agent.walletAddress}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                    <div className="flex items-center gap-3">
                      {agent.farcasterUsername && Boolean(cast.hash) && (
                        <a
                          href={`https://warpcast.com/${agent.farcasterUsername}/${String(cast.hash).slice(0, 10)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          View on Warpcast
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {cast.publishedAt
                          ? new Date(String(cast.publishedAt)).toLocaleDateString()
                          : 'Draft'}
                      </span>
                    </div>
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

        <TabsContent value="identity" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">ERC-8004 Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Agent ID</p>
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-semibold font-mono truncate">{agent.id}</p>
                    <CopyButton value={agent.id} />
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-xs text-muted-foreground">Farcaster</p>
                  {agent.farcasterUsername ? (
                    <a
                      href={`https://warpcast.com/${agent.farcasterUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      @{agent.farcasterUsername}
                      {agent.farcasterFid && (
                        <span className="text-muted-foreground font-normal">
                          (FID #{agent.farcasterFid})
                        </span>
                      )}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : agent.farcasterFid ? (
                    <p className="text-sm font-semibold">FID #{agent.farcasterFid}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not assigned</p>
                  )}
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

          {/* Agent Wallet & Policy Card */}
          {agent.walletAddress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Agent Wallet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-mono">{agent.walletAddress}</span>
                  <CopyButton value={agent.walletAddress} className="ml-auto" />
                  <a
                    href={`${getBaseScanUrl()}/address/${agent.walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>

                {walletPolicy && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium mb-3">Wallet Policy</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {walletPolicy.spendLimit && (
                          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                            <p className="text-xs text-muted-foreground">Spend Limit</p>
                            <p className="text-sm font-semibold">
                              {walletPolicy.spendLimit.amount} {walletPolicy.spendLimit.currency}
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              per {walletPolicy.spendLimit.period}
                            </p>
                          </div>
                        )}
                        <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                          <p className="text-xs text-muted-foreground">Whitelisted Contracts</p>
                          <p className="text-sm font-semibold">
                            {walletPolicy.whitelist?.length ?? 0} addresses
                          </p>
                        </div>
                        {walletPolicy.approvalRequiredFor && walletPolicy.approvalRequiredFor.length > 0 && (
                          <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                            <p className="text-xs text-muted-foreground">Requires Approval</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {walletPolicy.approvalRequiredFor.map((action) => (
                                <Badge key={action} variant="outline" className="text-[10px]">
                                  {action}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
