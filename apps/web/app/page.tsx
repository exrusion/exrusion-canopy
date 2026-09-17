import Link from "next/link";
import { NetworkSnapshot } from "@/components/NetworkSnapshot";

export default function HomePage() {
  return (
    <>
      <section className="hero content-width">
        <div className="hero-copy">
          <span className="eyebrow"><i className="live-dot" /> Built for Robinhood Chain</span>
          <h1>Every token can grow a market of its own.</h1>
          <p className="lede">Canopy verifies a pons-launched token, then lets its creator open an independent launchpad where children trade against the parent—and can branch again.</p>
          <div className="hero-actions"><Link className="button primary" href="/launch">Open a token pad</Link><Link className="button secondary" href="/tree">Explore the tree</Link></div>
          <p className="disclaimer">Companion protocol. Canopy trades and fees are separate from pons.</p>
        </div>
        <div className="hero-visual" aria-label="A recursive token tree">
          <div className="tree-rings"><span /><span /><span /></div>
          <div className="tree-node root">PONS<br /><small>root</small></div>
          <div className="branch branch-a" /><div className="branch branch-b" /><div className="branch branch-c" />
          <div className="tree-node node-a">A</div><div className="tree-node node-b">B</div><div className="tree-node node-c">C</div>
          <div className="mini-branch m1" /><div className="mini-branch m2" /><div className="tree-node leaf l1">A1</div><div className="tree-node leaf l2">A2</div>
        </div>
      </section>
      <div className="content-width"><NetworkSnapshot /></div>
      <section className="section content-width">
        <div className="section-heading"><span className="eyebrow">Protocol shape</span><h2>One root. Permissioned ownership. Endless branches.</h2></div>
        <div className="feature-grid">
          <article><span>01</span><h3>Verify the root</h3><p>The root must resolve through the official pons v2 factory. No API or curator can substitute for the onchain check.</p></article>
          <article><span>02</span><h3>Quote in the parent</h3><p>Each child market is paired with its direct parent token, making the hierarchy economically visible.</p></article>
          <article><span>03</span><h3>Route every fee</h3><p>Immutable config versions split fees among creators, holders, liquidity, ancestors, burn, pad owners, and protocol.</p></article>
        </div>
      </section>
      <section className="manifesto">
        <div className="content-width split"><h2>A public family tree for token economies.</h2><div><p>Every launch, trade, reward epoch, and routing event is read from canonical chain history. When data is absent, Canopy says so.</p><Link href="/ledger" className="text-link">Inspect the event ledger →</Link></div></div>
      </section>
    </>
  );
}
