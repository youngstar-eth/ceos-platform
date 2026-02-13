import { type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  description,
  trend,
  className,
}: StatCardProps) {
  return (
    <Card className={cn('glass-card-hover group', className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-neon-purple/10 border border-neon-purple/20 flex items-center justify-center group-hover:neon-box-purple transition-all">
              <Icon className="h-5 w-5 text-neon-purple group-hover:text-neon-pink transition-colors" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold vaporwave-gradient-text font-rajdhani">{value}</p>
            </div>
          </div>
          {trend && (
            <div
              className={cn(
                'text-xs font-medium px-2.5 py-1 rounded-full border',
                trend.isPositive
                  ? 'bg-neon-mint/10 text-neon-mint border-neon-mint/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
              )}
            >
              {trend.isPositive ? '+' : ''}
              {trend.value}%
            </div>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-2">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
