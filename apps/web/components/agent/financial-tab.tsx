'use client';

import { formatEther, type Address } from 'viem';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Vault,
  Flame,
  TrendingUp,
  Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAgentFinancials,
} from '@/hooks/finance/use-agent-financials';

interface FinancialTabProps {
  treasuryAddress?: Address;
  agentToken?: Address;
  className?: string;
}

// Mock AUM history data — in production, this comes from an API endpoint
// that stores treasury snapshots over time
function generateMockHistory(currentBalance: bigint) {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const points: { date: string; aum: number }[] = [];
  const current = Number(formatEther(currentBalance));

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * DAY);
    const noise = (Math.random() - 0.4) * current * 0.15;
    const growth = current * (1 - i * 0.02);
    points.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      aum: Math.max(0, growth + noise),
    });
  }

  // Ensure the last point matches the actual on-chain balance
  if (points.length > 0) {
    points[points.length - 1]!.aum = current;
  }

  return points;
}

function FinancialStatBox({
  icon: Icon,
  label,
  value,
  color = 'cyan',
}: {
  icon: typeof Vault;
  label: string;
  value: string;
  color?: 'cyan' | 'pink' | 'acid';
}) {
  const colorMap = {
    cyan: { icon: 'text-cp-cyan', bg: 'bg-cp-cyan/10', border: 'border-cp-cyan/20' },
    pink: { icon: 'text-cp-pink', bg: 'bg-cp-pink/10', border: 'border-cp-pink/20' },
    acid: { icon: 'text-cp-acid', bg: 'bg-cp-acid/10', border: 'border-cp-acid/20' },
  };
  const c = colorMap[color];

  return (
    <div className="cp-glass cp-hud-corners p-4 relative group overflow-hidden">
      <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-cp-cyan/20" />
      <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-cp-cyan/20" />

      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center mb-2', c.bg, `border ${c.border}`)}>
        <Icon className={cn('h-4 w-4', c.icon)} />
      </div>
      <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-share-tech">{label}</p>
      <p className="text-xl font-share-tech text-white mt-0.5">{value}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-cp-surface/90 border border-cp-cyan/20 rounded px-3 py-2 backdrop-blur-sm">
      <p className="text-[10px] font-share-tech text-white/50">{label}</p>
      <p className="text-sm font-share-tech text-cp-cyan">
        {payload[0]!.value.toFixed(4)} ETH
      </p>
    </div>
  );
}

export function FinancialTab({ treasuryAddress, className }: FinancialTabProps) {
  const { ethBalance, totalBurns, totalBurnedAmount, isLoading } = useAgentFinancials(treasuryAddress);

  const chartData = ethBalance ? generateMockHistory(ethBalance) : [];

  // ── Skeleton ──
  if (isLoading) {
    return (
      <div className={cn('space-y-4 animate-pulse', className)}>
        <div className="h-48 bg-white/5 rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-white/5 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const aum = ethBalance ? Number(formatEther(ethBalance)).toFixed(4) : '0';
  const burns = totalBurns ? totalBurns.toString() : '0';
  const burnedAmount = totalBurnedAmount ? Number(formatEther(totalBurnedAmount)).toFixed(4) : '0';

  return (
    <div className={cn('space-y-5', className)}>
      {/* ── Treasury Growth Chart ── */}
      <div className="cp-glass cp-hud-corners p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cp-cyan/30" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cp-cyan/30" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cp-cyan/30" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cp-cyan/30" />

        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-orbitron text-xs uppercase tracking-widest text-white">
              Treasury Growth
            </h3>
            <p className="text-[10px] font-share-tech text-white/30 mt-0.5">
              AUM over last 30 days
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-share-tech text-cp-cyan">{aum} ETH</p>
            <p className="text-[10px] font-share-tech text-white/30">Current AUM</p>
          </div>
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="aumGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00F0FF" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00F0FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)', fontFamily: 'Share Tech Mono' }}
                axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.2)', fontFamily: 'Share Tech Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="aum"
                stroke="#00F0FF"
                strokeWidth={1.5}
                fill="url(#aumGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-white/20 font-share-tech text-sm">
            No treasury data
          </div>
        )}
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FinancialStatBox
          icon={Vault}
          label="Total AUM"
          value={`${aum} ETH`}
          color="cyan"
        />
        <FinancialStatBox
          icon={Flame}
          label="Buybacks"
          value={`${burns} (${burnedAmount})`}
          color="pink"
        />
        <FinancialStatBox
          icon={TrendingUp}
          label="Fee Split"
          value="40/40/20"
          color="acid"
        />
        <FinancialStatBox
          icon={Coins}
          label="$RUN Burned"
          value={`${burnedAmount} ETH`}
          color="cyan"
        />
      </div>
    </div>
  );
}
