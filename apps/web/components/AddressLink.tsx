import { shortAddress } from "@/lib/api";

export function AddressLink({ address, label, type = "address" }: { address: string; label?: string; type?: "address" | "tx" }) {
  const explorer = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://robinhoodchain.blockscout.com";
  return <a className="mono-link" href={`${explorer}/${type}/${address}`} target="_blank" rel="noreferrer">{label ?? shortAddress(address)} ↗</a>;
}
