import { encodeAbiParameters, keccak256, type Hex } from "viem";

export function eventLeaf(txHash: Hex, logIndex: number, eventType: string, payload: unknown): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "uint256" }, { type: "string" }, { type: "string" }],
    [txHash, BigInt(logIndex), eventType, JSON.stringify(payload)]
  ));
}

export function merkleRoot(leaves: Hex[]): Hex | null {
  if (leaves.length === 0) return null;
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      const [a, b] = left.toLowerCase() <= right.toLowerCase() ? [left, right] : [right, left];
      next.push(keccak256((a + b.slice(2)) as Hex));
    }
    level = next;
  }
  return level[0]!;
}

