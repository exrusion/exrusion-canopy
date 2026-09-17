import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export type Allocation = { account: Address; balance: bigint; amount: bigint; leaf: Hex; proof: Hex[] };

export function rewardLeaf(epochId: bigint, account: Address, amount: bigint): Hex {
  const inner = keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "uint256" }],
    [epochId, account, amount]
  ));
  return keccak256(inner);
}

function hashPair(left: Hex, right: Hex): Hex {
  const [a, b] = left.toLowerCase() <= right.toLowerCase() ? [left, right] : [right, left];
  return keccak256((a + b.slice(2)) as Hex);
}

export function buildRewardTree(epochId: bigint, balances: Map<Address, bigint>, totalReward: bigint) {
  if (totalReward <= 0n) throw new Error("totalReward must be positive");
  const holders = [...balances.entries()].filter(([, balance]) => balance > 0n)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const totalBalance = holders.reduce((sum, [, balance]) => sum + balance, 0n);
  if (totalBalance === 0n) throw new Error("no eligible holder balance");

  let allocated = 0n;
  const rows = holders.map(([account, balance]) => {
    const amount = totalReward * balance / totalBalance;
    allocated += amount;
    return { account, balance, amount };
  });
  rows[0]!.amount += totalReward - allocated;
  const leaves = rows.map((row) => rewardLeaf(epochId, row.account, row.amount));

  const layers: Hex[][] = [leaves];
  while (layers.at(-1)!.length > 1) {
    const level = layers.at(-1)!;
    const next: Hex[] = [];
    for (let index = 0; index < level.length; index += 2) {
      next.push(hashPair(level[index]!, level[index + 1] ?? level[index]!));
    }
    layers.push(next);
  }

  const allocations: Allocation[] = rows.map((row, rowIndex) => {
    const proof: Hex[] = [];
    let index = rowIndex;
    for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
      const level = layers[layerIndex]!;
      const pairIndex = index ^ 1;
      proof.push(level[pairIndex] ?? level[index]!);
      index = Math.floor(index / 2);
    }
    return { ...row, leaf: leaves[rowIndex]!, proof };
  });
  return { root: layers.at(-1)![0]!, allocations, totalBalance, totalReward };
}
