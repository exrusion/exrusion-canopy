import Link from "next/link";
import { PageIntro } from "@/components/PageIntro";
import { PadsList } from "@/components/PadsList";

export const metadata = { title: "Token pads" };

export default function PadsPage() {
  return <><PageIntro eyebrow="Canonical registry" title="Token pads" action={<Link className="button primary small" href="/launch">Open a pad</Link>}>Every pad listed here was emitted by the Canopy registry and confirmed by the indexer.</PageIntro><section className="content-width page-section"><PadsList /></section></>;
}
