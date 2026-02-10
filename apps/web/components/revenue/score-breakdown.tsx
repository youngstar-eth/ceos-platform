'use client';

import { Heart, TrendingUp, Target, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ScoreBreakdownProps {
  engagement?: number;
  consistency?: number;
  growth?: number;
  quality?: number;
  totalScore?: number;
}

const categories = [
  {
    key: 'engagement' as const,
    label: 'Engagement',
    icon: Heart,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500',
    description: 'Likes, recasts, and replies',
  },
  {
    key: 'consistency' as const,
    label: 'Consistency',
    icon: Target,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
    description: 'Regular posting schedule',
  },
  {
    key: 'growth' as const,
    label: 'Growth',
    icon: TrendingUp,
    color: 'text-green-500',
    bgColor: 'bg-green-500',
    description: 'Follower and reach growth',
  },
  {
    key: 'quality' as const,
    label: 'Quality',
    icon: Star,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
    description: 'Content quality signals',
  },
];

export function ScoreBreakdown({
  engagement = 78,
  consistency = 85,
  growth = 62,
  quality = 91,
  totalScore = 79,
}: ScoreBreakdownProps) {
  const scores = { engagement, consistency, growth, quality };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Creator Score Breakdown</span>
          <span className="text-3xl font-bold brand-gradient-text">
            {totalScore}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {categories.map((category) => {
          const value = scores[category.key];
          return (
            <div key={category.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <category.icon className={cn('h-4 w-4', category.color)} />
                  <span className="text-sm font-medium">{category.label}</span>
                </div>
                <span className="text-sm font-bold">{value}/100</span>
              </div>
              <Progress
                value={value}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                {category.description}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
