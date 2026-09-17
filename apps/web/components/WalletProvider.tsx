"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ensureChain, injected } from "@/lib/chain";

type WalletState = {
  account: `0x${string}` | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
};

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    const provider = injected();
    if (!provider) return;
    const accounts = await provider.request({ method: "eth_accounts" }) as `0x${string}`[];
    setAccount(accounts[0] ?? null);
  }, []);

  useEffect(() => {
    void sync();
    const provider = injected();
    if (!provider?.on) return;
    const onAccounts = (accounts: unknown) => setAccount((accounts as `0x${string}`[])[0] ?? null);
    provider.on("accountsChanged", onAccounts);
    return () => provider.removeListener?.("accountsChanged", onAccounts);
  }, [sync]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const provider = injected();
      if (!provider) throw new Error("Install MetaMask or Trust Wallet to continue.");
      await ensureChain(provider);
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as `0x${string}`[];
      setAccount(accounts[0] ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection failed");
    } finally {
      setConnecting(false);
    }
  }, []);

  const value = useMemo(() => ({ account, connecting, error, connect }), [account, connecting, error, connect]);
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
