'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatScore } from '@/lib/leaderboard-utils';

interface RankHistoryDataPoint {
  epoch: number;
  totalScore: number;
  rank?: number;
}

interface RankHistoryChartProps {
  history: RankHistoryDataPoint[];
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
}

function NeonTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="glass-card rounded-lg border border-neon-purple/20 px-3 py-2 shadow-xl">
      <p className="text-[10px] text-vapor-lavender/60 font-rajdhani uppercase tracking-wider mb-1">
        Epoch {label}
      </p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="text-sm font-bold font-rajdhani"
          style={{ color: entry.color }}
        >
          {entry.name}: {entry.name === 'Score' ? formatScore(entry.value) : `#${entry.value}`}
        </p>
      ))}
    </div>
  );
}

export function RankHistoryChart({ history }: RankHistoryChartProps) {
  const hasRankData = history.some((d) => d.rank !== undefined);

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={history} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="scoreLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ff71ce" />
              <stop offset="50%" stopColor="#b967ff" />
              <stop offset="100%" stopColor="#01cdfe" />
            </linearGradient>
            <linearGradient id="rankLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#05ffa1" />
              <stop offset="100%" stopColor="#01cdfe" />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(185, 103, 255, 0.08)"
          />
          <XAxis
            dataKey="epoch"
            tick={{
              fill: 'rgba(199, 116, 232, 0.5)',
              fontSize: 12,
              fontFamily: 'var(--font-rajdhani)',
            }}
            axisLine={{ stroke: 'rgba(185, 103, 255, 0.15)' }}
            tickLine={false}
            label={{
              value: 'Epoch',
              position: 'insideBottom',
              offset: -2,
              fill: 'rgba(199, 116, 232, 0.4)',
              fontSize: 11,
              fontFamily: 'var(--font-rajdhani)',
            }}
          />
          <YAxis
            yAxisId="score"
            tick={{
              fill: 'rgba(199, 116, 232, 0.5)',
              fontSize: 12,
              fontFamily: 'var(--font-rajdhani)',
            }}
            axisLine={{ stroke: 'rgba(185, 103, 255, 0.15)' }}
            tickLine={false}
            domain={[0, 10000]}
          />
          {hasRankData && (
            <YAxis
              yAxisId="rank"
              orientation="right"
              reversed
              tick={{
                fill: 'rgba(5, 255, 161, 0.5)',
                fontSize: 12,
                fontFamily: 'var(--font-rajdhani)',
              }}
              axisLine={{ stroke: 'rgba(5, 255, 161, 0.15)' }}
              tickLine={false}
            />
          )}
          <Tooltip content={<NeonTooltip />} />
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="totalScore"
            name="Score"
            stroke="url(#scoreLineGradient)"
            strokeWidth={2.5}
            dot={{
              fill: '#b967ff',
              stroke: '#ff71ce',
              strokeWidth: 1.5,
              r: 4,
            }}
            activeDot={{
              r: 6,
              fill: '#ff71ce',
              stroke: '#b967ff',
              strokeWidth: 2,
            }}
          />
          {hasRankData && (
            <Line
              yAxisId="rank"
              type="monotone"
              dataKey="rank"
              name="Rank"
              stroke="url(#rankLineGradient)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{
                fill: '#05ffa1',
                stroke: '#01cdfe',
                strokeWidth: 1.5,
                r: 4,
              }}
              activeDot={{
                r: 6,
                fill: '#05ffa1',
                stroke: '#01cdfe',
                strokeWidth: 2,
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
