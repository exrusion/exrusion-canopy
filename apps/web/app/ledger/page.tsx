import { PageIntro } from "@/components/PageIntro";
import { LedgerTable } from "@/components/LedgerTable";

export const metadata = { title: "Event ledger" };
export default function LedgerPage() { return <><PageIntro eyebrow="One-minute commitments" title="Verifiable event ledger">Deterministic Merkle roots over confirmed Canopy events. “Computed” roots are not represented as onchain anchors.</PageIntro><section className="content-width page-section"><LedgerTable /></section></>; }
