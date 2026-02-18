'use client';

import { useEffect } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { useAgentDeploy } from '@/hooks/use-agent-deploy';

export function DeployButton() {
  const { deployAgent, hash, isWalletConfirming, isMining, isDeployed } =
    useAgentDeploy();

  useEffect(() => {
    if (isDeployed && hash) {
      // TODO: Replace with proper toast / redirect to agent dashboard
      console.log('✅ Agent deployed! Hash:', hash);
    }
  }, [isDeployed, hash]);

  const handleDeploy = () => {
    deployAgent(
      'TechInsider',          // name
      'TECH',                 // symbol
      'ipfs://QmTestMetadata' // metadataUri — replace with real IPFS hash
    );
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-8">
      <button
        onClick={handleDeploy}
        disabled={isWalletConfirming || isMining}
        className="group relative bg-[#FFD700] text-black font-bold text-xl px-12 py-6 rounded-full transition-all hover:scale-105 shadow-[0_0_30px_#FFD700] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
      >
        <span className="relative z-10 flex items-center gap-2">
          {isWalletConfirming ? (
            <>Check Wallet...</>
          ) : isMining ? (
            <>
              <Loader2 className="animate-spin" /> Deploying...
            </>
          ) : (
            <>
              <Rocket className="group-hover:-translate-y-1 transition-transform" />{' '}
              INITIALIZE AGENT (0.005 ETH)
            </>
          )}
        </span>
      </button>

      {/* Transaction hash indicator */}
      {hash && (
        <div className="text-center animate-in fade-in slide-in-from-bottom-4">
          <p className="text-green-400 font-mono text-sm mb-1">
            Transaction Sent!
          </p>
          <a
            href={`https://sepolia.basescan.org/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-[#FFD700] font-mono underline block"
          >
            View on BaseScan: {hash.slice(0, 6)}...{hash.slice(-4)}
          </a>
        </div>
      )}
    </div>
  );
}
