'use client';

import { useReadContract, useAccount } from 'wagmi';
import { CONTRACT_ADDRESSES, ERC721_BALANCE_ABI } from '@/lib/contracts';

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/**
 * Centralized RΞBØRN NFT gate.
 *
 * Checks ERC-721 `balanceOf(connectedWallet)` on the RΞBØRN NFT contract.
 * Both the Deploy Wizard and Hunt Leads page import this hook to determine
 * whether the connected wallet holds the Phase 1 VIP pass.
 *
 * In DEMO_MODE: always returns VIP access so local dev isn't blocked.
 *
 * @returns isVip   - true when NFT balance > 0 (or DEMO_MODE)
 * @returns isLoading - true while the RPC read is in-flight
 * @returns nftBalance - raw bigint balance from the contract
 * @returns error    - human-readable error message, if any
 */
export function useRebornGate() {
  const { address } = useAccount();

  const { data: balance, isLoading, error } = useReadContract({
    address: CONTRACT_ADDRESSES.rebornNft,
    abi: ERC721_BALANCE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !DEMO_MODE },
  });

  // In DEMO_MODE, always grant VIP access so devs aren't blocked
  if (DEMO_MODE) {
    return { isVip: true, isLoading: false, nftBalance: 1n, error: null };
  }

  const nftBalance = balance ?? 0n;
  const isVip = nftBalance > 0n;

  return { isVip, isLoading, nftBalance, error: error?.message ?? null };
}
