'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Rocket, Check } from 'lucide-react';
import { useAccount, useSignMessage } from 'wagmi';
import { Button } from '@/components/ui/button';
import {
  AgentConfigForm,
  type AgentConfig,
} from '@/components/agent-builder/agent-config-form';
import { ConfirmationCard } from './confirmation-card';
import { TransactionStatus } from './transaction-status';
import { useDeploy, type DeployStatus } from '@/hooks/use-deploy';
import { cn } from '@/lib/utils';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const STEPS = [
  { label: 'Persona', description: 'Define your agent identity' },
  { label: 'Skills', description: 'Choose agent capabilities' },
  { label: 'Strategy', description: 'Set content strategy' },
  { label: 'Deploy', description: DEMO_MODE ? 'Deploy (demo)' : 'Deploy on-chain' },
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
  const [demoStatus, setDemoStatus] = useState<DeployStatus>('idle');
  const [demoError, setDemoError] = useState<string | null>(null);
  const [deployedAgentId, setDeployedAgentId] = useState<string | null>(null);
  const [authCredentials, setAuthCredentials] = useState<{ message: string; signature: string } | null>(null);

  const { deploy, status: onChainStatus, txHash, error: onChainError, reset } = useDeploy();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const router = useRouter();

  const status = DEMO_MODE ? demoStatus : onChainStatus;
  const error = DEMO_MODE ? demoError : onChainError;

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

  const handleDemoDeploy = async () => {
    if (!address) {
      setDemoError('Please connect your wallet first.');
      setDemoStatus('failed');
      return;
    }

    try {
      setDemoError(null);
      setDemoStatus('preparing');

      // In demo mode, skip wallet signature — use placeholder auth
      const message = `demo-deploy:${config.persona.name}:${Date.now()}`;
      const signature = 'demo-mode-signature';

      setDemoStatus('pending');

      // Step 1: Create agent config in database
      const createRes = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address,
          'x-wallet-signature': signature,
          'x-wallet-message': message,
        },
        body: JSON.stringify({
          name: config.persona.name,
          description: config.persona.description,
          persona: {
            tone: config.persona.personality || 'informative',
            style: config.persona.traits.join(', ') || 'engaging',
            topics: config.skills.length > 0 ? config.skills : ['general'],
            language: 'en',
            customPrompt: config.persona.personality,
          },
          skills: config.skills,
          strategy: {
            postingFrequency: config.strategy === 'media-heavy' ? 8 : config.strategy === 'text-heavy' ? 4 : 6,
            engagementMode: 'active' as const,
            trendTracking: true,
            replyProbability: 0.3,
            mediaGeneration: config.strategy !== 'text-heavy',
          },
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error?.message ?? 'Failed to create agent');
      }

      const { data: agent } = await createRes.json();

      // Step 2: Deploy the agent (demo mode skips blockchain)
      const deployRes = await fetch('/api/agents/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address,
          'x-wallet-signature': signature,
          'x-wallet-message': message,
        },
        body: JSON.stringify({ agentId: agent.id }),
      });

      if (!deployRes.ok) {
        const err = await deployRes.json();
        throw new Error(err.error?.message ?? 'Deployment failed');
      }

      setDeployedAgentId(agent.id);
      setDemoStatus('confirmed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deployment failed';
      setDemoError(msg);
      setDemoStatus('failed');
    }
  };

  const handleOnChainDeploy = async () => {
    if (!address) return;

    try {
      // Step 1: Sign a message with the wallet to authenticate
      const message = `deploy:${config.persona.name}:${Date.now()}`;
      const signature = await signMessageAsync({ message });
      setAuthCredentials({ message, signature });

      const createRes = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address,
          'x-wallet-signature': signature,
          'x-wallet-message': message,
        },
        body: JSON.stringify({
          name: config.persona.name,
          description: config.persona.description,
          persona: {
            tone: config.persona.personality || 'informative',
            style: config.persona.traits.join(', ') || 'engaging',
            topics: config.skills.length > 0 ? config.skills : ['general'],
            language: 'en',
            customPrompt: config.persona.personality,
          },
          skills: config.skills,
          strategy: {
            postingFrequency: config.strategy === 'media-heavy' ? 8 : config.strategy === 'text-heavy' ? 4 : 6,
            engagementMode: 'active' as const,
            trendTracking: true,
            replyProbability: 0.3,
            mediaGeneration: config.strategy !== 'text-heavy',
          },
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error?.message ?? 'Failed to create agent');
      }

      const { data: agent } = await createRes.json();
      setDeployedAgentId(agent.id);

      // Step 2: Initiate blockchain transaction
      await deploy({
        name: config.persona.name,
        metadataUri: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://ceos.run'}/api/metadata/${encodeURIComponent(config.persona.name)}`,
      });
    } catch (err) {
      // If DB create fails, the deploy hook error handling will show the error
      console.error('On-chain deploy preparation failed:', err);
    }
  };

  // When on-chain tx is confirmed, notify the backend to activate the agent
  const hasNotifiedBackend = useRef(false);
  useEffect(() => {
    if (
      !DEMO_MODE &&
      onChainStatus === 'confirmed' &&
      txHash &&
      deployedAgentId &&
      authCredentials &&
      !hasNotifiedBackend.current
    ) {
      hasNotifiedBackend.current = true;

      const notifyBackend = async () => {
        try {
          const res = await fetch('/api/agents/deploy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-wallet-address': address ?? '',
              'x-wallet-signature': authCredentials.signature,
              'x-wallet-message': authCredentials.message,
            },
            body: JSON.stringify({ agentId: deployedAgentId, txHash }),
          });

          if (!res.ok) {
            console.error('Failed to notify backend of deployment:', await res.text());
          }
        } catch (err) {
          console.error('Backend notification failed:', err);
        }
      };

      void notifyBackend();
    }
  }, [onChainStatus, txHash, deployedAgentId, address, authCredentials]);

  const handleDeploy = DEMO_MODE ? handleDemoDeploy : handleOnChainDeploy;

  const isDeploying = status !== 'idle' && status !== 'failed';
  const isConfirmed = status === ('confirmed' as DeployStatus);

  return (
    <div className="space-y-8">
      {/* Demo mode indicator */}
      {DEMO_MODE && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-400">
          <strong>Demo Mode</strong> — Blockchain transactions are skipped. Agent will be deployed directly.
        </div>
      )}

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
          {status !== 'idle' && (
            <TransactionStatus
              status={status}
              txHash={DEMO_MODE ? undefined : txHash}
              error={error}
            />
          )}
          {status === 'confirmed' && deployedAgentId && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 text-center">
              <p className="text-green-400 font-medium mb-2">Agent deployed successfully!</p>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/dashboard/agents/${deployedAgentId}`)}
                >
                  View Agent Dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/dashboard/my-agents')}
                >
                  My Agents
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => {
            if (step === 3 && status === 'failed') {
              if (DEMO_MODE) {
                setDemoStatus('idle');
                setDemoError(null);
              } else {
                reset();
              }
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
            disabled={isDeploying || isConfirmed || !address}
            className="brand-gradient text-white hover:opacity-90"
          >
            <Rocket className="h-4 w-4 mr-2" />
            {status === 'confirmed'
              ? 'Deployed!'
              : isDeploying
              ? 'Deploying...'
              : !address
              ? 'Connect Wallet First'
              : DEMO_MODE
              ? 'Deploy Agent (Demo)'
              : 'Deploy Agent (0.005 ETH)'}
          </Button>
        )}
      </div>
    </div>
  );
}
