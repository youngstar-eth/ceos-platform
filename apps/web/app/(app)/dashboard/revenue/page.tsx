'use client';

import { DollarSign, TrendingUp, Award, History } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { RevenueChart, ScoreChart } from '@/components/revenue/revenue-chart';
import { EpochTimeline } from '@/components/revenue/epoch-timeline';
import { ClaimButton } from '@/components/revenue/claim-button';
import { ScoreBreakdown } from '@/components/revenue/score-breakdown';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Mock data
const MOCK_HISTORY = [
  { epoch: 12, amount: '0.071 ETH', claimedAt: '2024-01-20', status: 'available' },
  { epoch: 11, amount: '0.058 ETH', claimedAt: '2024-01-13', status: 'claimed' },
  { epoch: 10, amount: '0.062 ETH', claimedAt: '2024-01-06', status: 'claimed' },
  { epoch: 9, amount: '0.055 ETH', claimedAt: '2023-12-30', status: 'claimed' },
  { epoch: 8, amount: '0.038 ETH', claimedAt: '2023-12-23', status: 'claimed' },
  { epoch: 7, amount: '0.042 ETH', claimedAt: '2023-12-16', status: 'claimed' },
];

export default function RevenuePage() {
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
          label="Total Earned"
          value="1.24 ETH"
          trend={{ value: 15, isPositive: true }}
        />
        <StatCard
          icon={DollarSign}
          label="Total Claimed"
          value="1.169 ETH"
          description="Across 11 epochs"
        />
        <StatCard
          icon={TrendingUp}
          label="Creator Score"
          value="79"
          description="Top 15%"
          trend={{ value: 5, isPositive: true }}
        />
        <StatCard
          icon={Award}
          label="Rank"
          value="#64"
          description="Out of 428 creators"
          trend={{ value: 12, isPositive: true }}
        />
      </div>

      {/* Claim */}
      <ClaimButton
        claimableAmount={71000000000000000n}
        onClaim={() => {}}
        isPending={false}
      />

      {/* Epoch */}
      <EpochTimeline currentEpoch={12} epochProgress={65} />

      {/* Charts and Score */}
      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="score">Creator Score</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <RevenueChart />
            </div>
            <ScoreBreakdown
              engagement={78}
              consistency={85}
              growth={62}
              quality={91}
              totalScore={79}
            />
          </div>
        </TabsContent>

        <TabsContent value="score" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ScoreChart />
            </div>
            <ScoreBreakdown
              engagement={78}
              consistency={85}
              growth={62}
              quality={91}
              totalScore={79}
            />
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5" />
                Claim History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {MOCK_HISTORY.map((item) => (
                  <div
                    key={item.epoch}
                    className="flex items-center justify-between py-3 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">
                          E{item.epoch}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Epoch {item.epoch}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.claimedAt}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {item.amount}
                      </span>
                      <Badge
                        variant={
                          item.status === 'claimed' ? 'secondary' : 'default'
                        }
                        className="text-xs"
                      >
                        {item.status === 'claimed' ? 'Claimed' : 'Available'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
