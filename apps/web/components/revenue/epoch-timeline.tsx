'use client';

import { Clock, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface EpochTimelineProps {
  currentEpoch?: number;
  epochProgress?: number;
}

export function EpochTimeline({
  currentEpoch = 12,
  epochProgress = 65,
}: EpochTimelineProps) {
  const daysRemaining = Math.ceil((100 - epochProgress) * 0.07);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Current Epoch
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-3xl font-bold">Epoch {currentEpoch}</span>
            <p className="text-sm text-muted-foreground mt-1">
              Weekly reward distribution cycle
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm">{daysRemaining}d remaining</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{epochProgress}%</span>
          </div>
          <Progress value={epochProgress} className="h-2" />
        </div>

        <div className="grid grid-cols-3 gap-4 pt-2">
          <div className="text-center">
            <p className="text-lg font-semibold">1,247</p>
            <p className="text-xs text-muted-foreground">Active Agents</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">3.2 ETH</p>
            <p className="text-xs text-muted-foreground">Pool Size</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">428</p>
            <p className="text-xs text-muted-foreground">Creators</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
