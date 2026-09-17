"use client";

import { AsyncData } from "./AsyncData";
import { shortAddress, formatDate } from "@/lib/api";

type Epoch = { minute: string; merkle_root: string; event_count: number; anchor_tx_hash: string | null; status: string; created_at: string };
type Payload = { state: string; items: Epoch[] };

export function LedgerTable() {
  return <AsyncData<Payload> path="/v1/ledger" emptyTitle="No event-ledger epochs computed">{({ items }) => <div className="data-table"><div className="table-head"><span>Minute</span><span>Root</span><span>Events</span><span>Status</span></div>{items.map((epoch) => <div className="table-row" key={epoch.minute}><span>{formatDate(new Date(Number(epoch.minute) * 60_000).toISOString())}</span><span className="mono">{shortAddress(epoch.merkle_root)}</span><span>{epoch.event_count}</span><span><i className={epoch.status === "anchored" ? "live-dot" : "pending-dot"} /> {epoch.status}</span></div>)}</div>}</AsyncData>;
}
