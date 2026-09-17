"use client";

import { useParams } from "next/navigation";
import { isAddress, type Address } from "viem";
import { AsyncData } from "./AsyncData";
import { AddressLink } from "./AddressLink";
import { TradeCard } from "./TradeCard";
import { shortAddress } from "@/lib/api";

type Token = { token: string; parent_token: string; market: string; creator: string; token_name: string | null; token_symbol: string | null; supply: string; metadata_uri: string | null; has_active_pad: boolean };
type Payload = { state: string; token: Token };

export function TokenDetail() {
  const value = useParams<{ address: string }>().address;
  if (!isAddress(value)) return <p className="form-message">Invalid token address.</p>;
  return <AsyncData<Payload> path={`/v1/token/${value}`} emptyTitle="Token is not indexed">{({ token }) => <div className="detail-layout"><section className="detail-main"><div className="asset-heading"><div className="token-avatar large">{token.token_symbol?.slice(0, 2) ?? "C"}</div><div><span className="eyebrow">Canopy child token</span><h1>{token.token_name ?? shortAddress(token.token)}</h1><p>{token.token_symbol ?? "Symbol not indexed"}</p></div></div><div className="facts-grid"><div><small>Token</small><AddressLink address={token.token} /></div><div><small>Parent quote</small><AddressLink address={token.parent_token} /></div><div><small>Market</small><AddressLink address={token.market} /></div><div><small>Creator</small><AddressLink address={token.creator} /></div><div><small>Initial supply</small><strong>{token.supply}</strong></div><div><small>Own pad</small><strong>{token.has_active_pad ? "Active" : "Not opened"}</strong></div></div>{token.metadata_uri && <div className="metadata-note"><span>Creator metadata URI</span><code>{token.metadata_uri}</code></div>}</section><TradeCard market={token.market as Address} token={token.token as Address} parent={token.parent_token as Address} /></div>}</AsyncData>;
}
