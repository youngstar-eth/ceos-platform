'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Rocket, Check, Wallet, Loader2 } from 'lucide-react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import {
  AgentConfigForm,
  type AgentConfig,
} from '@/components/agent-builder/agent-config-form';
import { ConfirmationCard } from './confirmation-card';
import { TransactionStatus } from './transaction-status';
import { useAgentDeploy } from '@/hooks/use-agent-deploy';
import { type DeployStatus } from '@/hooks/use-deploy';
import { syncDeployedAgent } from '@/app/actions/sync-agent';
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
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'failed'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── On-chain deploy via useAgentDeploy (direct blockchain tx, no signMessage) ──
  const {
    deployAgent,
    hash: txHash,
    isWalletConfirming,
    isMining,
    isDeployed,
    isFailed,
    error: onChainError,
    status: onChainStatus,
    reset,
  } = useAgentDeploy();

  const { address } = useAccount();
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

  // ── Helper: build the API body from form config ──
  const buildAgentPayload = () => ({
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
  });

  // ── Demo mode deploy (no blockchain) ──
  const handleDemoDeploy = async () => {
    if (!address) {
      setDemoError('Please connect your wallet first.');
      setDemoStatus('failed');
      return;
    }

    try {
      setDemoError(null);
      setDemoStatus('preparing');
      setDemoStatus('pending');

      const createRes = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address,
        },
        body: JSON.stringify(buildAgentPayload()),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error?.message ?? 'Failed to create agent');
      }

      const { data: agent } = await createRes.json();

      const deployRes = await fetch('/api/agents/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address,
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

  // ── On-chain deploy: DB save → direct blockchain tx (NO signMessage) ──
  const handleOnChainDeploy = async () => {
    if (!address) return;

    try {
      // Step 1: Save agent config to database
      // The wallet address header is sufficient for auth — the on-chain tx
      // receipt proves ownership when the backend is notified post-confirmation.
      const createRes = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address,
        },
        body: JSON.stringify(buildAgentPayload()),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error?.message ?? 'Failed to create agent');
      }

      const { data: agent } = await createRes.json();
      setDeployedAgentId(agent.id);

      // Step 2: Fire the 0.005 ETH tx directly to AgentFactory.deployAgent()
      // This is the ONLY wallet popup the user sees.
      const symbol = config.persona.name.toUpperCase().replace(/\s+/g, '').slice(0, 5);
      const metadataUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://ceos.run'}/api/metadata/${encodeURIComponent(config.persona.name)}`;

      deployAgent(config.persona.name, symbol, metadataUri);
    } catch (err) {
      console.error('On-chain deploy preparation failed:', err);
    }
  };

  // ── When on-chain tx is confirmed: sync to DB → notify backend → redirect ──
  const hasNotifiedBackend = useRef(false);
  useEffect(() => {
    if (
      !DEMO_MODE &&
      isDeployed &&
      txHash &&
      !hasNotifiedBackend.current
    ) {
      hasNotifiedBackend.current = true;

      const syncAndActivate = async () => {
        try {
          // Step 1: Sync on-chain data to Prisma (server action)
          setSyncStatus('syncing');
          const syncResult = await syncDeployedAgent(
            txHash,
            address ?? '',
            buildAgentPayload(),
            deployedAgentId ?? undefined,
          );

          if (!syncResult.success) {
            console.error('Sync failed:', syncResult.error);
            setSyncError(syncResult.error ?? 'Sync failed');
            setSyncStatus('failed');
            return;
          }

          // Use the agentId from sync (either existing or newly created)
          const agentId = syncResult.agentId!;
          setDeployedAgentId(agentId);

          // Step 2: Notify backend to activate (Farcaster, wallet provisioning)
          try {
            const res = await fetch('/api/agents/deploy', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-wallet-address': address ?? '',
              },
              body: JSON.stringify({ agentId, txHash }),
            });

            if (!res.ok) {
              console.error('Failed to notify backend of deployment:', await res.text());
              // Non-fatal — agent is still in DEPLOYING state, can be activated later
            }
          } catch (err) {
            console.error('Backend notification failed:', err);
          }

          setSyncStatus('synced');
        } catch (err) {
          console.error('Sync error:', err);
          setSyncError(err instanceof Error ? err.message : 'Sync failed');
          setSyncStatus('failed');
        }
      };

      void syncAndActivate();
    }
  }, [isDeployed, txHash, deployedAgentId, address]);

  const handleDeploy = DEMO_MODE ? handleDemoDeploy : handleOnChainDeploy;

  const isDeploying = status !== 'idle' && status !== 'failed';
  const isConfirmed = status === ('confirmed' as DeployStatus);
  const isFullyComplete = isConfirmed && syncStatus === 'synced';

  // ── Granular button label based on deploy stage ──
  const getButtonLabel = () => {
    if (isFullyComplete) return 'Deployed!';
    if (syncStatus === 'syncing') return 'Syncing Database...';
    if (syncStatus === 'failed') return 'Sync Failed — Retry';
    if (isConfirmed) return 'Syncing...';
    if (isWalletConfirming) return 'Check Wallet...';
    if (isMining) return 'Deploying on Base...';
    if (isDeploying) return 'Preparing...';
    if (!address) return 'Connect Wallet First';
    if (DEMO_MODE) return 'Deploy Agent (Demo)';
    return 'Deploy Agent (0.005 ETH)';
  };

  // ── Granular button icon based on deploy stage ──
  const getButtonIcon = () => {
    if (syncStatus === 'syncing') return <Loader2 className="h-4 w-4 mr-2 animate-spin" />;
    if (isWalletConfirming) return <Wallet className="h-4 w-4 mr-2 animate-pulse" />;
    if (isMining) return <Loader2 className="h-4 w-4 mr-2 animate-spin" />;
    return <Rocket className="h-4 w-4 mr-2" />;
  };

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
          {/* Syncing indicator */}
          {isConfirmed && syncStatus === 'syncing' && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-blue-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="font-medium">Syncing to database...</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Verifying on-chain data and saving agent record
              </p>
            </div>
          )}

          {/* Sync failed */}
          {syncStatus === 'failed' && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
              <p className="text-red-400 font-medium mb-1">Database sync failed</p>
              <p className="text-xs text-muted-foreground mb-3">
                {syncError ?? 'Unknown error — your on-chain deployment is safe.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  hasNotifiedBackend.current = false;
                  setSyncStatus('idle');
                  setSyncError(null);
                }}
              >
                Retry Sync
              </Button>
            </div>
          )}

          {/* Success — fully synced */}
          {isFullyComplete && deployedAgentId && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 text-center">
              <p className="text-green-400 font-medium mb-2">Agent deployed & synced successfully!</p>
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
            if (step === 3 && isFailed) {
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
            disabled={isDeploying || isConfirmed || isFullyComplete || syncStatus === 'syncing' || !address}
            className="brand-gradient text-white hover:opacity-90"
          >
            {getButtonIcon()}
            {getButtonLabel()}
          </Button>
        )}
      </div>
    </div>
  );
}
