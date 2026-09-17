import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Canopy — Recursive token markets", template: "%s · Canopy" },
  description: "A companion protocol that lets verified pons tokens open recursive, parent-quoted markets on Robinhood Chain."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en"><body><WalletProvider><Nav /><main>{children}</main><Footer /></WalletProvider></body></html>
  );
}
