'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, Rocket, Search, Filter } from 'lucide-react';
import { AgentCard } from '@/components/shared/agent-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { type Agent } from '@/hooks/use-agent';
import { cn } from '@/lib/utils';

// Mock agents data
const MOCK_AGENTS: Agent[] = [
  {
    id: '1',
    name: 'CryptoSage',
    description:
      'An AI agent focused on cryptocurrency analysis, DeFi insights, and blockchain technology discussions.',
    status: 'active',
    farcasterFid: 12345,
    farcasterUsername: 'cryptosage',
    onChainId: 1,
    personality: 'Analytical and informative',
    skills: ['text-generation', 'trend-analysis', 'news-curation'],
    strategy: 'text-heavy',
    metrics: {
      totalCasts: 1234,
      totalLikes: 5678,
      totalRecasts: 890,
      totalFollowers: 2345,
      engagementRate: 4.2,
    },
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-20T15:30:00Z',
  },
  {
    id: '2',
    name: 'ArtBot',
    description:
      'Creative AI agent that generates and shares digital artwork, illustrations, and visual content.',
    status: 'active',
    farcasterFid: 12346,
    farcasterUsername: 'artbot_ai',
    onChainId: 2,
    personality: 'Creative and inspiring',
    skills: ['image-generation', 'art-creation', 'text-generation'],
    strategy: 'media-heavy',
    metrics: {
      totalCasts: 567,
      totalLikes: 8901,
      totalRecasts: 1234,
      totalFollowers: 4567,
      engagementRate: 6.8,
    },
    createdAt: '2024-01-18T08:00:00Z',
    updatedAt: '2024-01-20T12:00:00Z',
  },
  {
    id: '3',
    name: 'TechInsider',
    description:
      'Technology news curator and commentator covering AI, web3, and emerging tech trends.',
    status: 'active',
    farcasterFid: 12347,
    farcasterUsername: 'techinsider',
    onChainId: 3,
    personality: 'Professional and insightful',
    skills: ['news-curation', 'text-generation', 'thread-creator'],
    strategy: 'balanced',
    metrics: {
      totalCasts: 890,
      totalLikes: 3456,
      totalRecasts: 678,
      totalFollowers: 1890,
      engagementRate: 3.5,
    },
    createdAt: '2024-01-20T14:00:00Z',
    updatedAt: '2024-01-20T16:00:00Z',
  },
  {
    id: '4',
    name: 'MemeKing',
    description:
      'Humorous content creator specializing in crypto memes, viral content, and community engagement.',
    status: 'paused',
    farcasterFid: 12348,
    farcasterUsername: 'memeking_ai',
    onChainId: 4,
    personality: 'Humorous and witty',
    skills: ['image-generation', 'text-generation', 'trend-analysis'],
    strategy: 'media-heavy',
    metrics: {
      totalCasts: 345,
      totalLikes: 12345,
      totalRecasts: 2345,
      totalFollowers: 6789,
      engagementRate: 8.1,
    },
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-19T11:00:00Z',
  },
  {
    id: '5',
    name: 'NewsHound',
    description:
      'Breaking news aggregator and analyzer covering global events with real-time commentary.',
    status: 'terminated',
    farcasterFid: 12349,
    farcasterUsername: 'newshound',
    onChainId: 5,
    personality: 'Fast-paced and factual',
    skills: ['news-curation', 'text-generation', 'auto-reply'],
    strategy: 'text-heavy',
    metrics: {
      totalCasts: 2100,
      totalLikes: 4500,
      totalRecasts: 890,
      totalFollowers: 3200,
      engagementRate: 2.9,
    },
    createdAt: '2024-01-05T07:00:00Z',
    updatedAt: '2024-01-18T09:00:00Z',
  },
];

type StatusFilter = 'all' | 'active' | 'paused' | 'terminated';

export default function AgentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filteredAgents = MOCK_AGENTS.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || agent.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: MOCK_AGENTS.length,
    active: MOCK_AGENTS.filter((a) => a.status === 'active').length,
    paused: MOCK_AGENTS.filter((a) => a.status === 'paused').length,
    terminated: MOCK_AGENTS.filter((a) => a.status === 'terminated').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="text-muted-foreground mt-1">
            Manage your deployed AI agents
          </p>
        </div>
        <Link href="/dashboard/deploy">
          <Button className="brand-gradient text-white hover:opacity-90">
            <Rocket className="h-4 w-4 mr-2" />
            Deploy Agent
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(['all', 'active', 'paused', 'terminated'] as const).map(
            (status) => (
              <Badge
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer capitalize',
                  statusFilter === status && 'bg-primary'
                )}
                onClick={() => setStatusFilter(status)}
              >
                {status} ({statusCounts[status]})
              </Badge>
            )
          )}
        </div>
      </div>

      {/* Agent Grid */}
      {filteredAgents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Agents Found</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {searchQuery || statusFilter !== 'all'
              ? 'No agents match your current filters. Try adjusting your search.'
              : 'You have not deployed any agents yet. Deploy your first agent to get started.'}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <Link href="/dashboard/deploy" className="mt-4">
              <Button className="brand-gradient text-white hover:opacity-90">
                <Rocket className="h-4 w-4 mr-2" />
                Deploy Your First Agent
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
