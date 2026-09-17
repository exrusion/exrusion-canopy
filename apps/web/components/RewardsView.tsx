"use client";

import { AsyncData } from "./AsyncData";
import { AddressLink } from "./AddressLink";
import { useWallet } from "./WalletProvider";

type Epoch = { epoch_id: string; beneficiary_token: string; reward_token: string; total_reward: string; holder_count: string; snapshot_block: string };
type Payload = { state: string; items: Epoch[] };

export function RewardsView() {
  const { account, connect } = useWallet();
  const path = `/v1/rewards${account ? `?account=${account}` : ""}`;
  return <div className="rewards-layout"><aside className="balance-card"><span className="eyebrow">Connected account</span><h3>{account ? "Wallet connected" : "Connect to inspect"}</h3><p>{account ?? "Your eligible proof and claim amount are never inferred."}</p>{!account && <button className="button primary" onClick={() => void connect()}>Connect wallet</button>}</aside><div className="rewards-list"><AsyncData<Payload> path={path} emptyTitle="No reward epochs published">{({ items }) => items.map((epoch) => <article className="reward-row" key={epoch.epoch_id}><div><small>Epoch {epoch.epoch_id}</small><h3>Parent-holder distribution</h3></div><div><small>Beneficiary</small><AddressLink address={epoch.beneficiary_token} /></div><div><small>Reward token</small><AddressLink address={epoch.reward_token} /></div><div><small>Holders</small><strong>{epoch.holder_count}</strong></div><button className="button secondary small" disabled>Proof required</button></article>)}</AsyncData></div></div>;
}
