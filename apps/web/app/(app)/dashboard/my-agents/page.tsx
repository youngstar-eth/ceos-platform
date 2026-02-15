'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, Rocket, Search, Filter, Loader2, Wallet } from 'lucide-react';
import { useAccount } from 'wagmi';
import { AgentCard } from '@/components/shared/agent-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useMyAgents, type Agent } from '@/hooks/use-agent';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | 'ACTIVE' | 'PAUSED' | 'TERMINATED' | 'PENDING' | 'DEPLOYING';

export default function MyAgentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const { address, isConnected } = useAccount();
  const { data: response, isLoading, error } = useMyAgents(address, 1, 50);

  const agents: Agent[] = response?.data ?? [];

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.description ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || agent.status.toUpperCase() === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: agents.length,
    ACTIVE: agents.filter((a) => a.status.toUpperCase() === 'ACTIVE').length,
    PAUSED: agents.filter((a) => a.status.toUpperCase() === 'PAUSED').length,
    PENDING: agents.filter((a) => a.status.toUpperCase() === 'PENDING').length,
  };

  // Wallet not connected
  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">My Agents</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your deployed AI agents
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Connect your wallet to see your deployed agents.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Agents</h1>
          <p className="text-muted-foreground mt-1">
            View and manage your deployed AI agents
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
            placeholder="Search your agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(['all', 'ACTIVE', 'PAUSED', 'PENDING'] as const).map(
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
                {status.toLowerCase()} ({statusCounts[status]})
              </Badge>
            )
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading your agents...</p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to Load Agents</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {error.message}. Please try again later.
          </p>
        </div>
      )}

      {/* Agent Grid */}
      {!isLoading && !error && filteredAgents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredAgents.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Agents Found</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {searchQuery || statusFilter !== 'all'
              ? 'No agents match your current filters. Try adjusting your search.'
              : 'You haven\'t deployed any agents yet. Deploy your first agent to get started!'}
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
