"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { encodeFunctionData, erc20Abi, isAddress, parseUnits, type Address } from "viem";
import { useState } from "react";
import { AsyncData } from "./AsyncData";
import { AddressLink } from "./AddressLink";
import { ensureChain, injected, walletClients } from "@/lib/chain";
import { useWallet } from "./WalletProvider";
import { shortAddress } from "@/lib/api";

type Pad = { parent_token: string; owner_address: string; config_version: string; depth: number; pons_root: boolean; active: boolean };
type Child = { token: string; token_name: string | null; token_symbol: string | null; market: string; creator: string };
type Payload = { state: string; pad: Pad; children: Child[] };
const factory = process.env.NEXT_PUBLIC_CHILD_TOKEN_FACTORY as Address | undefined;
const launchAbi = [{ type: "function", name: "launchChild", stateMutability: "nonpayable", inputs: [
  { name: "parentToken", type: "address" }, { name: "name", type: "string" }, { name: "symbol", type: "string" },
  { name: "supply", type: "uint256" }, { name: "initialQuoteSeed", type: "uint256" }, { name: "metadataUri", type: "string" }
], outputs: [{ name: "childToken", type: "address" }, { name: "market", type: "address" }] }] as const;

function ChildLaunch({ parent, active }: { parent: Address; active: boolean }) {
  const { account, connect } = useWallet();
  const [form, setForm] = useState({ name: "", symbol: "", supply: "1000000000", seed: "", metadata: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  const launch = async () => {
    if (!factory || !active) return;
    if (!account) { await connect(); return; }
    setBusy(true); setMessage(null);
    try {
      const provider = injected(); if (!provider) throw new Error("Install MetaMask or Trust Wallet."); await ensureChain(provider);
      const { wallet, publicClient } = await walletClients();
      const parentDecimals = await publicClient.readContract({ address: parent, abi: erc20Abi, functionName: "decimals" });
      const seed = parseUnits(form.seed, parentDecimals);
      const approval = await wallet.writeContract({ account, address: parent, abi: erc20Abi, functionName: "approve", args: [factory, seed] });
      await publicClient.waitForTransactionReceipt({ hash: approval });
      const data = encodeFunctionData({ abi: launchAbi, functionName: "launchChild", args: [parent, form.name, form.symbol, parseUnits(form.supply, 18), seed, form.metadata] });
      const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: account, to: factory, data }] });
      setMessage(`Launch submitted: ${shortAddress(String(hash))}`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Launch failed"); }
    finally { setBusy(false); }
  };
  return <aside className="child-launch"><span className="eyebrow">Create a branch</span><h2>Launch a child</h2><p>The initial quote seed is transferred in the parent token. Approve the factory first.</p><div className="form-grid"><label><span>Name</span><input value={form.name} onChange={update("name")} placeholder="Branch name" /></label><label><span>Symbol</span><input value={form.symbol} onChange={update("symbol")} placeholder="LEAF" /></label><label><span>Supply</span><input value={form.supply} onChange={update("supply")} inputMode="decimal" /></label><label><span>Parent seed</span><input value={form.seed} onChange={update("seed")} placeholder="0.00" inputMode="decimal" /></label><label className="span-two"><span>Metadata URI</span><input value={form.metadata} onChange={update("metadata")} placeholder="ipfs://…" /></label></div>{factory ? <button className="button primary full" onClick={() => void launch()} disabled={busy || !active || !form.name || !form.symbol || !form.seed}>{account ? busy ? "Confirming…" : "Launch child" : "Connect wallet"}</button> : <div className="integration-warning"><strong>Integration not verified</strong><span>The child factory is not configured.</span></div>}{message && <p className="form-message">{message}</p>}</aside>;
}

export function PadDetail() {
  const value = useParams<{ address: string }>().address;
  if (!isAddress(value)) return <p className="form-message">Invalid pad address.</p>;
  return <AsyncData<Payload> path={`/v1/pad/${value}`} emptyTitle="Pad is not indexed">{({ pad, children }) => <><div className="pad-heading"><div><span className="eyebrow">{pad.pons_root ? "Verified pons root" : `Canopy depth ${pad.depth}`}</span><h1>{shortAddress(pad.parent_token)} pad</h1><p>Child markets are quoted in this parent token.</p></div><span className={`state-label ${pad.active ? "live" : "not_available"}`}>{pad.active ? "active" : "paused"}</span></div><div className="detail-layout"><section className="detail-main"><div className="facts-grid"><div><small>Parent token</small><AddressLink address={pad.parent_token} /></div><div><small>Pad owner</small><AddressLink address={pad.owner_address} /></div><div><small>Fee config</small><strong>Version {pad.config_version}</strong></div><div><small>Children</small><strong>{children.length}</strong></div></div><div className="subheading"><span className="eyebrow">Direct descendants</span><h2>Child markets</h2></div>{children.length ? <div className="child-list">{children.map((child) => <Link key={child.token} href={`/token/${child.token}`}><span className="token-avatar">{child.token_symbol?.slice(0, 2) ?? "•"}</span><span><strong>{child.token_name ?? shortAddress(child.token)}</strong><small>{child.token_symbol ?? "Onchain token"}</small></span><span>Trade →</span></Link>)}</div> : <p className="empty-inline">No confirmed child launches yet.</p>}</section><ChildLaunch parent={pad.parent_token as Address} active={pad.active} /></div></>}</AsyncData>;
}
