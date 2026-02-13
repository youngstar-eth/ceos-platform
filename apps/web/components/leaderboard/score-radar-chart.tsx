"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import type { CEOSScoreBreakdown } from "@openclaw/shared/types/ceos-score";

interface ScoreRadarChartProps {
  score: CEOSScoreBreakdown;
}

interface RadarDataPoint {
  dimension: string;
  value: number;
  fullMark: number;
}

export function ScoreRadarChart({ score }: ScoreRadarChartProps) {
  const data: RadarDataPoint[] = [
    { dimension: "Trading", value: score.trading / 100, fullMark: 100 },
    { dimension: "Engagement", value: score.engagement / 100, fullMark: 100 },
    { dimension: "Revenue", value: score.revenue / 100, fullMark: 100 },
    { dimension: "Quality", value: score.quality / 100, fullMark: 100 },
    { dimension: "Reliability", value: score.reliability / 100, fullMark: 100 },
  ];

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            name="Score"
            dataKey="value"
            stroke="rgba(255,255,255,0.8)"
            fill="rgba(255,255,255,0.2)"
            fillOpacity={1}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
