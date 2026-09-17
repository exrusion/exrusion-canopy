import { PageIntro } from "@/components/PageIntro";
import { RewardsView } from "@/components/RewardsView";

export const metadata = { title: "Rewards" };
export default function RewardsPage() { return <><PageIntro eyebrow="Pull-based claims" title="Holder rewards">Published Merkle epochs distribute real deposited parent-token fees without iterating over holders onchain.</PageIntro><section className="content-width page-section"><RewardsView /></section></>; }
