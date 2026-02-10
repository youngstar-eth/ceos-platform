'use client';

import { DollarSign, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatEth } from '@/lib/utils';

interface ClaimButtonProps {
  claimableAmount: bigint;
  onClaim: () => void;
  isPending: boolean;
}

export function ClaimButton({
  claimableAmount,
  onClaim,
  isPending,
}: ClaimButtonProps) {
  const hasClaimable = claimableAmount > 0n;

  return (
    <Card className={hasClaimable ? 'border-green-500/30 glow-teal' : ''}>
      <CardContent className="flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-green-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Claimable Revenue
            </p>
            <p className="text-2xl font-bold">
              {formatEth(claimableAmount)}
            </p>
          </div>
        </div>
        <Button
          onClick={onClaim}
          disabled={!hasClaimable || isPending}
          className="brand-gradient text-white hover:opacity-90"
          size="lg"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Claiming...
            </>
          ) : (
            <>
              <DollarSign className="h-4 w-4 mr-2" />
              Claim Revenue
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
