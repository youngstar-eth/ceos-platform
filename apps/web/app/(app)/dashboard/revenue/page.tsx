'use client';

import { DollarSign, TrendingUp, Award } from 'lucide-react';
import { useAccount } from 'wagmi';
import { StatCard } from '@/components/shared/stat-card';
import { RevenueChart, ScoreChart } from '@/components/revenue/revenue-chart';
import { EpochTimeline } from '@/components/revenue/epoch-timeline';
import { ClaimButton } from '@/components/revenue/claim-button';
import { ScoreBreakdown } from '@/components/revenue/score-breakdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useClaimableAmount,
  useClaimRevenue,
  useCurrentEpoch,
  useCreatorScore,
} from '@/hooks/use-revenue';

export default function RevenuePage() {
  const { address } = useAccount();
  const { data: claimableRaw } = useClaimableAmount();
  const { claim, isPending: isClaimPending } = useClaimRevenue();
  const { data: epochRaw } = useCurrentEpoch();
  const { data: scoreResponse, isLoading: scoreLoading } = useCreatorScore(address);

  const claimableAmount = (claimableRaw as bigint) ?? 0n;
  const currentEpoch = epochRaw ? Number(epochRaw) : 0;

  const scoreData = scoreResponse?.data;
  const totalScore = scoreData?.totalScore ?? 0;
  const rank = scoreData?.rank ?? 0;
  const percentile = scoreData?.percentile ?? 0;
  const breakdown = scoreData?.breakdown ?? {
    engagement: 0,
    consistency: 0,
    growth: 0,
    quality: 0,
  };

  const claimableEth = claimableAmount > 0n
    ? (Number(claimableAmount) / 1e18).toFixed(4)
    : '0';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Revenue</h1>
        <p className="text-muted-foreground mt-1">
          Track your earnings and Creator Score
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Claimable"
          value={`${claimableEth} ETH`}
          description="Available to claim"
        />
        <StatCard
          icon={DollarSign}
          label="Current Epoch"
          value={currentEpoch > 0 ? String(currentEpoch) : '--'}
          description="Weekly distribution cycle"
        />
        <StatCard
          icon={TrendingUp}
          label="Creator Score"
          value={scoreLoading ? '...' : String(totalScore)}
          description={percentile > 0 ? `Top ${100 - percentile}%` : 'Not yet calculated'}
        />
        <StatCard
          icon={Award}
          label="Rank"
          value={rank > 0 ? `#${rank}` : '--'}
          description={rank > 0 ? 'Among all creators' : 'Not ranked yet'}
        />
      </div>

      {/* Claim */}
      <ClaimButton
        claimableAmount={claimableAmount}
        onClaim={claim}
        isPending={isClaimPending}
      />

      {/* Epoch */}
      <EpochTimeline currentEpoch={currentEpoch} />

      {/* Charts and Score */}
      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="score">Creator Score</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <RevenueChart />
            </div>
            <ScoreBreakdown
              engagement={breakdown.engagement}
              consistency={breakdown.consistency}
              growth={breakdown.growth}
              quality={breakdown.quality}
              totalScore={totalScore}
            />
          </div>
        </TabsContent>

        <TabsContent value="score" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ScoreChart />
            </div>
            <ScoreBreakdown
              engagement={breakdown.engagement}
              consistency={breakdown.consistency}
              growth={breakdown.growth}
              quality={breakdown.quality}
              totalScore={totalScore}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
