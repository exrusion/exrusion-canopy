"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { WalletButton } from "./WalletButton";

const links = [
  ["/pads", "Pads"], ["/tree", "Tree"], ["/pulse", "Pulse"],
  ["/ledger", "Ledger"], ["/rewards", "Rewards"], ["/docs", "Docs"]
] as const;

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="nav-shell">
      <nav className="nav content-width">
        <Link href="/" className="brand" aria-label="Canopy home">
          <span className="brand-mark"><i /><i /><i /></span><span>CANOPY</span>
        </Link>
        <button className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation">Menu</button>
        <div className={`nav-links ${open ? "open" : ""}`}>
          {links.map(([href, label]) => <Link key={href} className={path === href ? "active" : ""} href={href} onClick={() => setOpen(false)}>{label}</Link>)}
          <Link className="launch-link" href="/launch">Open a pad</Link>
          <WalletButton />
        </div>
      </nav>
    </header>
  );
}
