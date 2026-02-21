'use client';

import { DeployWizard } from '@/components/deploy/deploy-wizard';

export default function DeployPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Deploy Agent</h1>
        <p className="text-muted-foreground mt-1">
          Configure and deploy your autonomous AI agent on Base
        </p>
      </div>

      <DeployWizard />
    </div>
  );
}
