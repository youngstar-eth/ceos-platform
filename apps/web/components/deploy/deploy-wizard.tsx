'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Rocket, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AgentConfigForm,
  type AgentConfig,
} from '@/components/agent-builder/agent-config-form';
import { ConfirmationCard } from './confirmation-card';
import { TransactionStatus } from './transaction-status';
import { useDeploy, type DeployStatus } from '@/hooks/use-deploy';
import { cn } from '@/lib/utils';

const STEPS = [
  { label: 'Persona', description: 'Define your agent identity' },
  { label: 'Skills', description: 'Choose agent capabilities' },
  { label: 'Strategy', description: 'Set content strategy' },
  { label: 'Deploy', description: 'Deploy on-chain' },
];

const DEFAULT_CONFIG: AgentConfig = {
  persona: {
    name: '',
    description: '',
    personality: '',
    traits: [],
  },
  skills: [],
  strategy: 'balanced',
};

export function DeployWizard() {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const { deploy, status, txHash, error, reset } = useDeploy();

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return config.persona.name.length > 0 && config.persona.description.length > 0;
      case 1:
        return config.skills.length > 0;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleDeploy = async () => {
    await deploy({
      name: config.persona.name,
      metadataUri: `ipfs://placeholder/${config.persona.name}`,
    });
  };

  const isDeploying = status !== 'idle' && status !== 'failed';

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-all',
                  i < step
                    ? 'bg-primary border-primary text-primary-foreground'
                    : i === step
                    ? 'border-primary text-primary'
                    : 'border-muted text-muted-foreground'
                )}
              >
                {i < step ? <Check className="h-5 w-5" /> : i + 1}
              </div>
              <span className="text-xs font-medium mt-2 hidden sm:block">
                {s.label}
              </span>
              <span className="text-[10px] text-muted-foreground hidden sm:block">
                {s.description}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-12 sm:w-24 mx-2',
                  i < step ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step < 3 ? (
        <AgentConfigForm config={config} onChange={setConfig} step={step} />
      ) : (
        <div className="space-y-6">
          <ConfirmationCard config={config} />
          {(status !== 'idle') && (
            <TransactionStatus
              status={status}
              txHash={txHash}
              error={error}
            />
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => {
            if (step === 3 && status === 'failed') {
              reset();
            }
            setStep(Math.max(0, step - 1));
          }}
          disabled={step === 0 || isDeploying}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {step < 3 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
          >
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleDeploy}
            disabled={isDeploying || status === 'confirmed'}
            className="brand-gradient text-white hover:opacity-90"
          >
            <Rocket className="h-4 w-4 mr-2" />
            {status === 'confirmed'
              ? 'Deployed!'
              : isDeploying
              ? 'Deploying...'
              : 'Deploy Agent (0.005 ETH)'}
          </Button>
        )}
      </div>
    </div>
  );
}
