'use client';

import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { type PaymentRequirements } from '@/lib/x402';
import { formatX402Amount } from '@/lib/x402';

interface PaymentStatusProps {
  requirements: PaymentRequirements | null;
  isPaid: boolean;
  resource?: string;
}

export function PaymentStatusCard({
  requirements,
  isPaid,
  resource,
}: PaymentStatusProps) {
  if (!requirements && !isPaid) return null;

  return (
    <Card className={isPaid ? 'border-green-500/30' : 'border-yellow-500/30'}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isPaid && (
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            )}
            <div>
              <p className="text-sm font-medium">
                {isPaid ? 'Payment Confirmed' : 'Payment Required'}
              </p>
              <p className="text-xs text-muted-foreground">
                {resource ?? requirements?.resource ?? 'Premium Resource'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {requirements && (
              <Badge variant={isPaid ? 'default' : 'outline'}>
                {formatX402Amount(requirements.maxAmountRequired)}
              </Badge>
            )}
            {isPaid && (
              <a
                href="#"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Receipt <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
