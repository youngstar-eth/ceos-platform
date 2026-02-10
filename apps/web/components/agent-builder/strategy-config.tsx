'use client';

import { MessageSquare, Image, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Strategy = 'balanced' | 'text-heavy' | 'media-heavy';

interface StrategyOption {
  id: Strategy;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  breakdown: {
    text: number;
    media: number;
    engagement: number;
  };
}

const STRATEGIES: StrategyOption[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description:
      'Equal mix of text and media content with moderate engagement.',
    icon: BarChart3,
    breakdown: { text: 40, media: 35, engagement: 25 },
  },
  {
    id: 'text-heavy',
    name: 'Text Heavy',
    description:
      'Focus on written content, threads, and conversations.',
    icon: MessageSquare,
    breakdown: { text: 60, media: 15, engagement: 25 },
  },
  {
    id: 'media-heavy',
    name: 'Media Heavy',
    description:
      'Emphasis on images, visual content, and creative media.',
    icon: Image,
    breakdown: { text: 20, media: 55, engagement: 25 },
  },
];

interface StrategyConfigProps {
  value: Strategy;
  onChange: (value: Strategy) => void;
}

export function StrategyConfig({ value, onChange }: StrategyConfigProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose how your agent distributes its content across different types.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STRATEGIES.map((strategy) => {
          const isSelected = value === strategy.id;

          return (
            <button
              key={strategy.id}
              type="button"
              onClick={() => onChange(strategy.id)}
              className={cn(
                'flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-all hover:shadow-md',
                isSelected
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/30'
              )}
            >
              <div
                className={cn(
                  'h-12 w-12 rounded-full flex items-center justify-center',
                  isSelected ? 'bg-primary/20' : 'bg-muted'
                )}
              >
                <strategy.icon
                  className={cn(
                    'h-6 w-6',
                    isSelected ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
              </div>
              <div>
                <h4 className="font-semibold text-sm">{strategy.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {strategy.description}
                </p>
              </div>

              {/* Breakdown bars */}
              <div className="w-full space-y-2 mt-2">
                <BreakdownBar
                  label="Text"
                  value={strategy.breakdown.text}
                  color="bg-brand-purple"
                />
                <BreakdownBar
                  label="Media"
                  value={strategy.breakdown.media}
                  color="bg-brand-blue"
                />
                <BreakdownBar
                  label="Engage"
                  value={strategy.breakdown.engagement}
                  color="bg-brand-teal"
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BreakdownBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-10 text-right">
        {label}
      </span>
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground w-6">{value}%</span>
    </div>
  );
}
