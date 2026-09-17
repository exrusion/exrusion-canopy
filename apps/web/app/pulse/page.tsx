import { PageIntro } from "@/components/PageIntro";
import { PulseFeed } from "@/components/PulseFeed";

export const metadata = { title: "Protocol pulse" };
export default function PulsePage() { return <><PageIntro eyebrow="Live canonical events" title="Protocol pulse">A human-readable stream backed by confirmed logs—not an offchain activity feed.</PageIntro><section className="content-width page-section"><PulseFeed /></section></>; }
