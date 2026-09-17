import { PageIntro } from "@/components/PageIntro";
import { LaunchForm } from "@/components/LaunchForm";

export const metadata = { title: "Open a token pad" };
export default function LaunchPage() { return <><PageIntro eyebrow="Creator flow" title="Let your token branch">Verify ownership at the source, then open a parent-quoted Canopy pad. No asset is automatically approved as a pons pair token.</PageIntro><section className="content-width page-section"><LaunchForm /></section></>; }
