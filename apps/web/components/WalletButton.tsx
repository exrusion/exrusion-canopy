"use client";

import { useWallet } from "./WalletProvider";
import { shortAddress } from "@/lib/api";

export function WalletButton() {
  const { account, connecting, connect } = useWallet();
  return (
    <button className="wallet-button" onClick={() => void connect()} disabled={connecting}>
      <span className={`wallet-dot ${account ? "connected" : ""}`} />
      {account ? shortAddress(account) : connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
