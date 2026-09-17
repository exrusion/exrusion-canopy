"use client";

import Link from "next/link";
import { AsyncData } from "./AsyncData";
import { AddressLink } from "./AddressLink";
import { formatDate, shortAddress } from "@/lib/api";

type Pad = { parent_token: string; owner_address: string; config_version: string; depth: number; pons_root: boolean; active: boolean; block_number: string; block_time: string | null };
type Payload = { state: string; items: Pad[] };

export function PadsList() {
  return <AsyncData<Payload> path="/v1/pads" emptyTitle="No indexed pads yet">{({ items }) => (
    <div className="record-list">{items.map((pad) => <article className="record-row" key={pad.parent_token}>
      <div className="token-avatar">{pad.depth === 0 ? "R" : pad.depth}</div>
      <div className="record-main"><div><span className="record-title">{shortAddress(pad.parent_token)}</span><span className={`state-label ${pad.active ? "live" : "not_available"}`}>{pad.active ? "active" : "paused"}</span></div><p>{pad.pons_root ? "Verified pons root" : `Canopy branch · depth ${pad.depth}`} · opened {formatDate(pad.block_time)}</p></div>
      <div className="record-meta"><span>Owner <AddressLink address={pad.owner_address} /></span><span>Config v{pad.config_version}</span></div>
      <Link className="row-action" href={`/pad/${pad.parent_token}`}>View pad →</Link>
    </article>)}</div>
  )}</AsyncData>;
}
