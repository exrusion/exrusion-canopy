"use client";

import { AsyncData } from "./AsyncData";

type Status = { chain: { id: number; rpc: string; latestBlock: string | null }; database: string; indexers: unknown[]; contracts: { name: string; state: string }[] };

export function NetworkSnapshot() {
  return (
    <AsyncData<Status> path="/v1/status" poll={15000} emptyTitle="System status unavailable">
      {(data) => <div className="network-strip">
        <span><b className={data.chain.rpc === "live" ? "live-dot" : "off-dot"} /> RPC {data.chain.rpc}</span>
        <span>Chain <strong>{data.chain.id}</strong></span>
        <span>Block <strong>{data.chain.latestBlock ?? "—"}</strong></span>
        <span>Contracts <strong>{data.contracts.filter((item) => item.state === "live").length}/{data.contracts.length}</strong></span>
      </div>}
    </AsyncData>
  );
}
