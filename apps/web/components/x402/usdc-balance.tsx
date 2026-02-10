'use client';

import { Coins } from 'lucide-react';
import { formatUSDC } from '@/lib/utils';
import { useUSDCBalance } from '@/hooks/use-x402-payment';

interface USDCBalanceProps {
  className?: string;
}

export function USDCBalance({ className }: USDCBalanceProps) {
  const { data: balance, isLoading } = useUSDCBalance();

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
          <Coins className="h-4 w-4 text-blue-500" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">USDC Balance</p>
          <p className="text-sm font-semibold">
            {isLoading
              ? '...'
              : balance !== undefined
              ? formatUSDC(balance as bigint)
              : '$0.00 USDC'}
          </p>
        </div>
      </div>
    </div>
  );
}
