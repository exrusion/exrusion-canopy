import { describe, expect, it } from "vitest";
import { getAddress, keccak256, type Hex } from "viem";
import { buildRewardTree } from "./rewardTree.js";

function verify(leaf: Hex, proof: Hex[], root: Hex) {
  return proof.reduce((hash, sibling) => {
    const [a, b] = hash.toLowerCase() <= sibling.toLowerCase() ? [hash, sibling] : [sibling, hash];
    return keccak256((a + b.slice(2)) as Hex);
  }, leaf) === root;
}

describe("reward tree", () => {
  it("allocates the exact reward and produces valid proofs", () => {
    const balances = new Map([
      [getAddress("0x0000000000000000000000000000000000000001"), 1n],
      [getAddress("0x0000000000000000000000000000000000000002"), 3n],
      [getAddress("0x0000000000000000000000000000000000000003"), 6n]
    ]);
    const tree = buildRewardTree(7n, balances, 101n);
    expect(tree.allocations.reduce((sum, row) => sum + row.amount, 0n)).toBe(101n);
    for (const row of tree.allocations) expect(verify(row.leaf, row.proof, tree.root)).toBe(true);
  });
});
