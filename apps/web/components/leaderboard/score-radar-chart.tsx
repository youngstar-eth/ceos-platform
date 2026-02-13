'use client';

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { CEOSScoreBreakdown } from '@openclaw/shared/types/ceos-score';
import { formatScore } from '@/lib/leaderboard-utils';

interface ScoreRadarChartProps {
  score: CEOSScoreBreakdown;
}

interface RadarDataPoint {
  dimension: string;
  value: number;
  fullMark: number;
  raw: number;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: RadarDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function RadarTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0];
  if (!point) return null;

  return (
    <div className="glass-card rounded-lg px-3 py-2 shadow-xl border border-neon-purple/20">
      <p className="text-xs font-rajdhani font-semibold text-neon-cyan mb-0.5">
        {point.payload.dimension}
      </p>
      <p className="text-sm font-bold vaporwave-gradient-text">
        {formatScore(point.payload.raw)} / 10,000
      </p>
    </div>
  );
}

export function ScoreRadarChart({ score }: ScoreRadarChartProps) {
  const data: RadarDataPoint[] = [
    { dimension: 'Trading', value: score.trading / 100, fullMark: 100, raw: score.trading },
    { dimension: 'Engagement', value: score.engagement / 100, fullMark: 100, raw: score.engagement },
    { dimension: 'Revenue', value: score.revenue / 100, fullMark: 100, raw: score.revenue },
    { dimension: 'Quality', value: score.quality / 100, fullMark: 100, raw: score.quality },
    { dimension: 'Reliability', value: score.reliability / 100, fullMark: 100, raw: score.reliability },
  ];

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <defs>
            <linearGradient id="radarFillGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#b967ff" stopOpacity={0.25} />
              <stop offset="50%" stopColor="#ff71ce" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#01cdfe" stopOpacity={0.2} />
            </linearGradient>
            <linearGradient id="radarStrokeGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ff71ce" />
              <stop offset="50%" stopColor="#b967ff" />
              <stop offset="100%" stopColor="#01cdfe" />
            </linearGradient>
          </defs>
          <PolarGrid
            stroke="rgba(185, 103, 255, 0.12)"
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{
              fill: 'rgba(199, 116, 232, 0.7)',
              fontSize: 12,
              fontFamily: 'var(--font-rajdhani)',
              fontWeight: 600,
            }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{
              fill: 'rgba(185, 103, 255, 0.3)',
              fontSize: 9,
            }}
            axisLine={false}
          />
          <Tooltip content={<RadarTooltip />} />
          <Radar
            name="Score"
            dataKey="value"
            stroke="#ff71ce"
            fill="url(#radarFillGradient)"
            fillOpacity={1}
            strokeWidth={2}
            dot={{
              r: 4,
              fill: '#b967ff',
              stroke: '#ff71ce',
              strokeWidth: 1.5,
            }}
            activeDot={{
              r: 6,
              fill: '#ff71ce',
              stroke: '#b967ff',
              strokeWidth: 2,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
