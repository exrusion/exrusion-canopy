"use client";

import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import { readClient, walletClients } from "@/lib/chain";
import { useWallet } from "./WalletProvider";

const marketAbi = [
  { type: "function", name: "previewBuy", stateMutability: "view", inputs: [{ name: "quoteIn", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "previewSell", stateMutability: "view", inputs: [{ name: "tokensIn", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "buy", stateMutability: "nonpayable", inputs: [{ name: "quoteIn", type: "uint256" }, { name: "minTokensOut", type: "uint256" }, { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sell", stateMutability: "nonpayable", inputs: [{ name: "tokensIn", type: "uint256" }, { name: "minQuoteOut", type: "uint256" }, { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ type: "uint256" }] }
] as const;

export function TradeCard({ market, token, parent }: { market: Address; token: Address; parent: Address }) {
  const { account, connect } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [decimals, setDecimals] = useState({ parent: 18, token: 18 });

  useEffect(() => {
    const publicClient = readClient();
    void Promise.all([
      publicClient.readContract({ address: parent, abi: erc20Abi, functionName: "decimals" }),
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" })
    ]).then(([parentDecimals, tokenDecimals]) => {
      setDecimals({ parent: parentDecimals, token: tokenDecimals });
    }).catch(() => undefined);
  }, [parent, token]);

  useEffect(() => {
    let live = true;
    if (!amount || Number(amount) <= 0) { setPreview(null); return; }
    const timer = setTimeout(() => void Promise.resolve().then(async () => {
      const publicClient = readClient();
      const inputDecimals = side === "buy" ? decimals.parent : decimals.token;
      const outputDecimals = side === "buy" ? decimals.token : decimals.parent;
      const output = await publicClient.readContract({ address: market, abi: marketAbi, functionName: side === "buy" ? "previewBuy" : "previewSell", args: [parseUnits(amount, inputDecimals)] });
      if (live) setPreview(formatUnits(output, outputDecimals));
    }).catch(() => live && setPreview(null)), 300);
    return () => { live = false; clearTimeout(timer); };
  }, [amount, side, decimals, market]);

  const trade = async () => {
    if (!account) { await connect(); return; }
    if (!amount || Number(amount) <= 0 || !preview) return;
    setBusy(true); setMessage(null);
    try {
      const { wallet, publicClient } = await walletClients();
      const inputToken = side === "buy" ? parent : token;
      const inputDecimals = side === "buy" ? decimals.parent : decimals.token;
      const outputDecimals = side === "buy" ? decimals.token : decimals.parent;
      const input = parseUnits(amount, inputDecimals);
      const expected = parseUnits(preview, outputDecimals);
      const minimum = expected * 99n / 100n;
      const approval = await wallet.writeContract({ account, address: inputToken, abi: erc20Abi, functionName: "approve", args: [market, input] });
      await publicClient.waitForTransactionReceipt({ hash: approval });
      const hash = side === "buy"
        ? await wallet.writeContract({ account, address: market, abi: marketAbi, functionName: "buy", args: [input, minimum, account, BigInt(Math.floor(Date.now() / 1000) + 1200)] })
        : await wallet.writeContract({ account, address: market, abi: marketAbi, functionName: "sell", args: [input, minimum, account, BigInt(Math.floor(Date.now() / 1000) + 1200)] });
      setMessage(`Submitted ${hash.slice(0, 10)}…`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Trade failed"); }
    finally { setBusy(false); }
  };

  return <aside className="trade-card"><div className="trade-tabs"><button className={side === "buy" ? "active" : ""} onClick={() => setSide("buy")}>Buy</button><button className={side === "sell" ? "active" : ""} onClick={() => setSide("sell")}>Sell</button></div><label className="trade-input"><span>You pay</span><div><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /><b>{side === "buy" ? "PARENT" : "CHILD"}</b></div></label><div className="trade-output"><span>Estimated output</span><strong>{preview ?? "—"} {side === "buy" ? "CHILD" : "PARENT"}</strong></div><p className="slippage">Minimum output uses 1% slippage · 20 minute deadline</p><button className="button primary full" disabled={busy || (!!account && !preview)} onClick={() => void trade()}>{busy ? "Confirming…" : account ? `${side === "buy" ? "Buy" : "Sell"} token` : "Connect wallet"}</button>{message && <p className="form-message">{message}</p>}</aside>;
}
