import { PageIntro } from "@/components/PageIntro";
import { SystemStatus } from "@/components/SystemStatus";
export const metadata = { title: "System status" };
export default function StatusPage() { return <><PageIntro eyebrow="Observable truth" title="System status">Live checks for the chain, data services, contract bytecode, and indexer checkpoints.</PageIntro><section className="content-width page-section"><SystemStatus /></section></>; }
