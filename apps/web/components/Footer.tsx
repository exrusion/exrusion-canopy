import Link from "next/link";

export function Footer() {
  return (
    <footer className="footer content-width">
      <div><span className="eyebrow">Canopy protocol</span><p>Recursive token markets on Robinhood Chain.</p></div>
      <div className="footer-links">
        <Link href="/status">System status</Link>
        <a href="https://docs.ponsfamily.com/v2" target="_blank" rel="noreferrer">Pons v2 docs ↗</a>
        <a href="https://docs.robinhood.com/chain/connecting/" target="_blank" rel="noreferrer">Chain docs ↗</a>
      </div>
      <p className="fine-print">Independent, pre-audit software. Not operated by pons or Robinhood.</p>
    </footer>
  );
}
