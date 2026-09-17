"use client";

import { useState } from "react";
import { encodeFunctionData, isAddress, type Address } from "viem";
import { api, shortAddress } from "@/lib/api";
import { ensureChain, injected } from "@/lib/chain";
import { useWallet } from "./WalletProvider";

type Verification = { state: string; verified: boolean; factory: string; launch?: { deployer: string; creatorFeeRecipient: string; pairToken: string; phase: number } };
const registry = process.env.NEXT_PUBLIC_NESTED_PAD_REGISTRY as Address | undefined;
const openPadAbi = [{ type: "function", name: "openPad", stateMutability: "nonpayable", inputs: [{ name: "parentToken", type: "address" }, { name: "configVersion", type: "uint64" }], outputs: [] }] as const;

export function LaunchForm() {
  const { account, connect } = useWallet();
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<Verification | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setMessage(null); setResult(null);
    if (!isAddress(address)) { setMessage("Enter a valid EVM token address."); return; }
    setBusy(true);
    try { setResult(await api<Verification>(`/v1/pons/token/${address}`)); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Verification unavailable"); }
    finally { setBusy(false); }
  };

  const openPad = async () => {
    if (!result?.verified || !registry || !isAddress(address)) return;
    if (!account) { await connect(); return; }
    setBusy(true); setMessage(null);
    try {
      const provider = injected();
      if (!provider) throw new Error("Install MetaMask or Trust Wallet to continue.");
      await ensureChain(provider);
      const tx = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: registry, data: encodeFunctionData({ abi: openPadAbi, functionName: "openPad", args: [address, 1n] }) }]
      });
      setMessage(`Transaction submitted: ${shortAddress(String(tx))}`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Transaction failed"); }
    finally { setBusy(false); }
  };

  return <div className="launch-grid"><div className="launch-card"><span className="step-number">01</span><h2>Verify your pons token</h2><p>Canopy reads the official factory directly. The deploying wallet must open the root pad.</p><label className="field"><span>Token contract</span><div><input value={address} onChange={(event) => setAddress(event.target.value.trim())} placeholder="0x…" spellCheck={false} /><button onClick={() => void verify()} disabled={busy}>{busy ? "Checking…" : "Verify"}</button></div></label>{message && <p className="form-message">{message}</p>}</div>
    <div className={`launch-card ${result?.verified ? "verified" : ""}`}><span className="step-number">02</span><h2>Open its launchpad</h2>{!result ? <p>Complete the onchain verification first.</p> : result.verified ? <><div className="verified-badge">✓ Official pons v2 launch</div><dl><div><dt>Deployer</dt><dd>{shortAddress(result.launch?.deployer)}</dd></div><div><dt>Quote asset</dt><dd>{shortAddress(result.launch?.pairToken)}</dd></div><div><dt>Factory</dt><dd>{shortAddress(result.factory)}</dd></div></dl>{registry ? <button className="button primary full" onClick={() => void openPad()} disabled={busy}>{account ? "Open pad with config v1" : "Connect wallet to open"}</button> : <div className="integration-warning"><strong>Integration not verified</strong><span>No Canopy registry address is configured. Mainnet opening remains disabled.</span></div>}</> : <div className="integration-warning"><strong>Not a verified launch</strong><span>This address did not resolve as a pons v2 token.</span></div>}</div>
  </div>;
}
