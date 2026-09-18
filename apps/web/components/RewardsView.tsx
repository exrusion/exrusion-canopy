"use client";

import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, type Address, type Hex } from "viem";
import { AsyncData } from "./AsyncData";
import { AddressLink } from "./AddressLink";
import { useWallet } from "./WalletProvider";
import { readClient, walletClients } from "@/lib/chain";

type Epoch = {
  epoch_id: string;
  beneficiary_token: string;
  reward_token: string;
  total_reward: string;
  holder_count: string;
  snapshot_block: string;
  claim_amount: string | null;
  proof: Hex[] | null;
  claimed: boolean | null;
};
type RewardPayload = { state: string; items: Epoch[] };
type FeeItem = { token: string; amount: string | null; state: string };
type FeePayload = { state: string; router: string; items: FeeItem[] };

const rewardDistributor = process.env.NEXT_PUBLIC_REWARD_DISTRIBUTOR as Address | undefined;
const feeRouter = process.env.NEXT_PUBLIC_FEE_ROUTER as Address | undefined;
const rewardAbi = [{
  type: "function", name: "claim", stateMutability: "nonpayable",
  inputs: [{ name: "epochId", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "proof", type: "bytes32[]" }],
  outputs: []
}] as const;
const feeAbi = [{
  type: "function", name: "claim", stateMutability: "nonpayable",
  inputs: [{ name: "token", type: "address" }], outputs: []
}] as const;

function TokenAmount({ token, amount }: { token: string; amount: string | null }) {
  const [label, setLabel] = useState(amount ?? "—");
  useEffect(() => {
    if (!amount) { setLabel("—"); return; }
    const client = readClient();
    void Promise.all([
      client.readContract({ address: token as Address, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: token as Address, abi: erc20Abi, functionName: "symbol" })
    ]).then(([decimals, symbol]) => setLabel(`${Number(formatUnits(BigInt(amount), decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`))
      .catch(() => setLabel(`${amount} units`));
  }, [amount, token]);
  return <strong>{label}</strong>;
}

export function RewardsView() {
  const { account, connect } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const rewardsPath = `/v1/rewards${account ? `?account=${account}&refresh=${refresh}` : ""}`;

  const claimReward = async (epoch: Epoch) => {
    if (!account) { await connect(); return; }
    if (!rewardDistributor || !epoch.claim_amount || !epoch.proof) return;
    setBusy(`reward-${epoch.epoch_id}`); setMessage(null);
    try {
      const { wallet, publicClient } = await walletClients();
      const hash = await wallet.writeContract({ account, address: rewardDistributor, abi: rewardAbi, functionName: "claim", args: [BigInt(epoch.epoch_id), BigInt(epoch.claim_amount), epoch.proof] });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(`Reward claimed in ${hash.slice(0, 10)}…`);
      setRefresh((value) => value + 1);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Reward claim failed"); }
    finally { setBusy(null); }
  };

  const claimFee = async (token: Address) => {
    if (!account) { await connect(); return; }
    if (!feeRouter) return;
    setBusy(`fee-${token}`); setMessage(null);
    try {
      const { wallet, publicClient } = await walletClients();
      const hash = await wallet.writeContract({ account, address: feeRouter, abi: feeAbi, functionName: "claim", args: [token] });
      await publicClient.waitForTransactionReceipt({ hash });
      setMessage(`Fees claimed in ${hash.slice(0, 10)}…`);
      setRefresh((value) => value + 1);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Fee claim failed"); }
    finally { setBusy(null); }
  };

  return <div className="rewards-layout"><aside className="balance-card"><span className="eyebrow">Connected account</span><h3>{account ? "Wallet connected" : "Connect to inspect"}</h3><p>{account ?? "Eligibility is returned only with a deterministic Merkle proof."}</p>{!account && <button className="button primary" onClick={() => void connect()}>Connect wallet</button>}{message && <p className="form-message">{message}</p>}</aside><div className="rewards-list">
    <div className="subheading rewards-heading"><span className="eyebrow">Holder distributions</span><h2>Merkle rewards</h2></div>
    <AsyncData<RewardPayload> path={rewardsPath} emptyTitle="No reward epochs published">{({ items }) => items.map((epoch) => <article className="reward-row" key={epoch.epoch_id}><div><small>Epoch {epoch.epoch_id}</small><h3>Parent-holder distribution</h3></div><div><small>Beneficiary</small><AddressLink address={epoch.beneficiary_token} /></div><div><small>Your allocation</small><TokenAmount token={epoch.reward_token} amount={epoch.claim_amount} /></div><div><small>Holders</small><strong>{epoch.holder_count}</strong></div><button className="button secondary small" disabled={!account || !rewardDistributor || !epoch.claim_amount || epoch.claimed === true || busy !== null} onClick={() => void claimReward(epoch)}>{epoch.claimed ? "Claimed" : busy === `reward-${epoch.epoch_id}` ? "Claiming…" : epoch.claim_amount ? "Claim reward" : "Not eligible"}</button></article>)}</AsyncData>
    <div className="subheading rewards-heading"><span className="eyebrow">Creator and pad-owner revenue</span><h2>Claimable fees</h2></div>
    {!account ? <p className="empty-inline">Connect a wallet to inspect fee balances.</p> : <AsyncData<FeePayload> path={`/v1/fee-claims/${account}?refresh=${refresh}`} emptyTitle="Fee router is not configured">{({ items }) => items.length ? items.map((item) => <article className="reward-row fee-row" key={item.token}><div><small>Paid in parent token</small><h3><AddressLink address={item.token} /></h3></div><div><small>Claimable</small><TokenAmount token={item.token} amount={item.amount} /></div><button className="button secondary small" disabled={!feeRouter || !item.amount || BigInt(item.amount) === 0n || busy !== null} onClick={() => void claimFee(item.token as Address)}>{busy === `fee-${item.token}` ? "Claiming…" : "Claim fees"}</button></article>) : <p className="empty-inline">No indexed creator or pad-owner fee balances yet.</p>}</AsyncData>}
  </div></div>;
}
