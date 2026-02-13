"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

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

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 shadow-xl">
      <p className="text-xs text-white/50 mb-1">Epoch {label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.name === "Score" ? entry.value.toLocaleString() : `#${entry.value}`}
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
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="epoch"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            tickLine={false}
            label={{ value: "Epoch", position: "insideBottom", offset: -2, fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
          />
          <YAxis
            yAxisId="score"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            tickLine={false}
            domain={[0, 10000]}
          />
          {hasRankData && (
            <YAxis
              yAxisId="rank"
              orientation="right"
              reversed
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="totalScore"
            name="Score"
            stroke="#818cf8"
            strokeWidth={2}
            dot={{ fill: "#818cf8", r: 4 }}
            activeDot={{ r: 6 }}
          />
          {hasRankData && (
            <Line
              yAxisId="rank"
              type="monotone"
              dataKey="rank"
              name="Rank"
              stroke="#34d399"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: "#34d399", r: 4 }}
              activeDot={{ r: 6 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
