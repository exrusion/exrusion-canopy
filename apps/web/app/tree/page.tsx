import { PageIntro } from "@/components/PageIntro";
import { TreeView } from "@/components/TreeView";

export const metadata = { title: "Token tree" };
export default function TreePage() { return <><PageIntro eyebrow="Recursive graph" title="The token tree">Trace each market from a verified pons root through every parent-quoted branch.</PageIntro><section className="content-width page-section"><TreeView /></section></>; }
