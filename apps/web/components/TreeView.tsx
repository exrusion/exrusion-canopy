"use client";

import Link from "next/link";
import { AsyncData } from "./AsyncData";
import { shortAddress } from "@/lib/api";

type Node = { token: string; parent_token: string; token_name: string | null; token_symbol: string | null; parent_depth: number | null };
type Payload = { state: string; nodes: Node[] };

export function TreeView() {
  return <AsyncData<Payload> path="/v1/tree" emptyTitle="The token tree has no indexed branches">{({ nodes }) => {
    const parents = [...new Set(nodes.map((node) => node.parent_token))];
    return <div className="forest">{parents.map((parent) => <section className="tree-family" key={parent}>
      <Link href={`/pad/${parent}`} className="family-root"><span className="token-avatar root-avatar">R</span><span><small>Parent token</small><strong>{shortAddress(parent)}</strong></span></Link>
      <div className="children-line" />
      <div className="family-children">{nodes.filter((node) => node.parent_token === parent).map((node) => <Link href={`/token/${node.token}`} className="family-child" key={node.token}><span className="token-avatar">{node.token_symbol?.slice(0, 2) ?? "•"}</span><strong>{node.token_symbol ?? shortAddress(node.token)}</strong><small>{node.token_name ?? "Onchain token"}</small></Link>)}</div>
    </section>)}</div>;
  }}</AsyncData>;
}
