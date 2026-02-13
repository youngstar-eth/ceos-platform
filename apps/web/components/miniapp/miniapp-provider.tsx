"use client";

import { useEffect, useState, type ReactNode } from "react";

interface MiniAppContext {
  isReady: boolean;
  userId: string | null;
  userAddress: string | null;
}

/**
 * MiniKit provider for Farcaster Mini App context.
 * Detects if running inside Farcaster client and provides user context.
 */
export function MiniAppProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<MiniAppContext>({
    isReady: false,
    userId: null,
    userAddress: null,
  });

  useEffect(() => {
    // Check if we're inside a Farcaster frame/miniapp context
    const searchParams = new URLSearchParams(window.location.search);
    const fid = searchParams.get("fid");
    const address = searchParams.get("address");

    setContext({
      isReady: true,
      userId: fid,
      userAddress: address,
    });
  }, []);

  if (!context.isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return <>{children}</>;
}
