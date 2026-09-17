"use client";

import { AsyncData } from "./AsyncData";
import { AddressLink } from "./AddressLink";
import { formatDate } from "@/lib/api";

type Event = { event_type: string; token: string | null; actor: string | null; amount_in: string | null; amount_out: string | null; fee_amount: string | null; tx_hash: string; block_number: string; block_time: string | null };
type Payload = { state: string; items: Event[] };

export function PulseFeed() {
  return <AsyncData<Payload> path="/v1/pulse" poll={12000} emptyTitle="No confirmed protocol activity yet">{({ items }) => <div className="timeline">{items.map((event, index) => <article className="timeline-row" key={`${event.tx_hash}-${index}`}>
    <div className="timeline-mark"><i /></div><div className="timeline-copy"><div><span className="event-type">{event.event_type.replaceAll("_", " ")}</span><span className="muted">Block {event.block_number}</span></div><p>{event.token ? <>Token <AddressLink address={event.token} /></> : "Protocol event"}{event.actor ? <> · by <AddressLink address={event.actor} /></> : null}</p><small>{formatDate(event.block_time)}</small></div>
    <AddressLink address={event.tx_hash} label="Transaction" type="tx" />
  </article>)}</div>}</AsyncData>;
}
