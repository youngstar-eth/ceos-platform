'use client';

import { DollarSign, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type PaymentStatus } from '@/hooks/use-x402-payment';
import { cn } from '@/lib/utils';

interface PaymentButtonProps {
  status: PaymentStatus;
  amount?: string | null;
  onPay: () => void;
  disabled?: boolean;
  className?: string;
}

export function PaymentButton({
  status,
  amount,
  onPay,
  disabled,
  className,
}: PaymentButtonProps) {
  const isLoading =
    status === 'fetching' ||
    status === 'paying' ||
    status === 'confirming';

  const getLabel = (): string => {
    switch (status) {
      case 'idle':
        return amount ? `Pay ${amount}` : 'Pay with USDC';
      case 'fetching':
        return 'Loading...';
      case 'payment-required':
        return amount ? `Pay ${amount}` : 'Pay Now';
      case 'paying':
        return 'Signing Payment...';
      case 'confirming':
        return 'Confirming...';
      case 'success':
        return 'Paid!';
      case 'error':
        return 'Retry Payment';
      default:
        return 'Pay with USDC';
    }
  };

  const getIcon = () => {
    if (isLoading) return <Loader2 className="h-4 w-4 mr-2 animate-spin" />;
    if (status === 'success') return <Check className="h-4 w-4 mr-2" />;
    if (status === 'error')
      return <AlertCircle className="h-4 w-4 mr-2" />;
    return <DollarSign className="h-4 w-4 mr-2" />;
  };

  return (
    <Button
      onClick={onPay}
      disabled={disabled || isLoading || status === 'success'}
      className={cn(
        'transition-all',
        status === 'success' && 'bg-green-600 hover:bg-green-600',
        status === 'error' && 'bg-destructive hover:bg-destructive/90',
        !['success', 'error'].includes(status) &&
          'brand-gradient text-white hover:opacity-90',
        className
      )}
    >
      {getIcon()}
      {getLabel()}
    </Button>
  );
}
