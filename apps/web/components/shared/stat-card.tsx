import { type LucideIcon } from 'lucide-react';
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
    <div className={cn('cp-glass cp-hud-corners p-6 relative group overflow-hidden transition-all duration-300 hover:bg-white/[0.02]', className)}>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="h-10 w-10 rounded-lg bg-cp-cyan/10 border border-cp-cyan/20 flex items-center justify-center group-hover:bg-cp-cyan/20 transition-colors">
            <Icon className="h-5 w-5 text-cp-cyan" />
          </div>
          {trend && (
            <div
              className={cn(
                'text-[10px] font-share-tech px-2 py-0.5 rounded-full border',
                trend.isPositive
                  ? 'bg-cp-acid/10 border-cp-acid/20 text-cp-acid'
                  : 'bg-cp-pink/10 border-cp-pink/20 text-cp-pink'
              )}
            >
              {trend.isPositive ? '+' : ''}
              {trend.value}%
            </div>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-share-tech mb-1">{label}</p>
          <p className="text-3xl font-share-tech text-white group-hover:text-cp-cyan transition-colors">{value}</p>
        </div>

        {description && (
          <p className="text-xs text-white/30 mt-3 font-rajdhani border-t border-white/5 pt-3">
            {description}
          </p>
        )}
      </div>

      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cp-cyan/30" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cp-cyan/30" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cp-cyan/30" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cp-cyan/30" />
    </div>
  );
}
