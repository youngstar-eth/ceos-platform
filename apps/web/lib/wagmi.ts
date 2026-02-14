import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    injected(),
    ...(projectId
      ? [
          walletConnect({
            projectId,
            metadata: {
              name: 'ceos.run',
              description: 'Deploy Autonomous AI Agents on Farcaster',
              url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://ceos.run',
              icons: [],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL),
  },
});

export const SUPPORTED_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? '8453'
);
