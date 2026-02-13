'use client';

import { Loader2, CheckCircle2, XCircle, Clock, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { type DeployStatus } from '@/hooks/use-deploy';
import { cn, formatAddress } from '@/lib/utils';

interface TransactionStatusProps {
  status: DeployStatus;
  txHash?: `0x${string}`;
  error?: string | null;
}

const statusConfig: Record<
  DeployStatus,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    description: string;
    color: string;
  }
> = {
  idle: {
    icon: Clock,
    label: 'Ready',
    description: 'Waiting to start deployment',
    color: 'text-muted-foreground',
  },
  preparing: {
    icon: Loader2,
    label: 'Preparing',
    description: 'Preparing transaction...',
    color: 'text-blue-500',
  },
  'awaiting-signature': {
    icon: Wallet,
    label: 'Awaiting Signature',
    description: 'Please confirm the transaction in your wallet',
    color: 'text-yellow-500',
  },
  pending: {
    icon: Loader2,
    label: 'Transaction Pending',
    description: 'Waiting for on-chain confirmation...',
    color: 'text-blue-500',
  },
  confirmed: {
    icon: CheckCircle2,
    label: 'Deployed!',
    description: 'Your agent has been deployed successfully',
    color: 'text-green-500',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    description: 'The transaction failed',
    color: 'text-red-500',
  },
};

export function TransactionStatus({
  status,
  txHash,
  error,
}: TransactionStatusProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isAnimated = status === 'preparing' || status === 'pending';

  return (
    <Card
      className={cn(
        'border-2',
        status === 'confirmed' && 'border-green-500/30',
        status === 'failed' && 'border-red-500/30'
      )}
    >
      <CardContent className="flex items-center gap-4 p-6">
        <div
          className={cn(
            'h-12 w-12 rounded-full flex items-center justify-center',
            status === 'confirmed' && 'bg-green-500/10',
            status === 'failed' && 'bg-red-500/10',
            status === 'pending' && 'bg-blue-500/10',
            status === 'awaiting-signature' && 'bg-yellow-500/10',
            (status === 'idle' || status === 'preparing') && 'bg-muted'
          )}
        >
          <Icon
            className={cn(
              'h-6 w-6',
              config.color,
              isAnimated && 'animate-spin'
            )}
          />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold">{config.label}</h4>
          <p className="text-sm text-muted-foreground">
            {error ?? config.description}
          </p>
          {txHash && (
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              View on BaseScan: {formatAddress(txHash)}
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
