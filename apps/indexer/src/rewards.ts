import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublicClient, getAddress, http, keccak256, parseAbiItem, toHex, type Address } from "viem";
import { config } from "./config.js";
import { buildRewardTree } from "./rewardTree.js";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; the snapshot builder will not guess it`);
  return value;
}

const beneficiaryToken = getAddress(required("REWARD_BENEFICIARY_TOKEN"));
const rewardToken = getAddress(required("REWARD_TOKEN"));
const rewardAmount = BigInt(required("REWARD_AMOUNT"));
const epochId = BigInt(required("REWARD_EPOCH_ID"));
const snapshotBlock = BigInt(required("SNAPSHOT_BLOCK"));
const scanStart = BigInt(required("HOLDER_SCAN_START_BLOCK"));
if (scanStart > snapshotBlock) throw new Error("HOLDER_SCAN_START_BLOCK must not exceed SNAPSHOT_BLOCK");

const rpc = createPublicClient({
  chain: {
    id: config.CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.RPC_HTTP_URL] } }
  },
  transport: http(config.RPC_HTTP_URL, { timeout: 20_000, retryCount: 3 })
});
const transfer = parseAbiItem("event Transfer(address indexed from,address indexed to,uint256 value)");
const excluded = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  ...(process.env.REWARD_EXCLUDED_ADDRESSES ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
]);

async function main() {
  const balances = new Map<Address, bigint>();
  const chunk = 500n;
  for (let fromBlock = scanStart; fromBlock <= snapshotBlock; fromBlock += chunk) {
    const toBlock = fromBlock + chunk - 1n > snapshotBlock ? snapshotBlock : fromBlock + chunk - 1n;
    const logs = await rpc.getLogs({ address: beneficiaryToken, event: transfer, fromBlock, toBlock, strict: true });
    for (const log of logs) {
      const from = getAddress(log.args.from);
      const to = getAddress(log.args.to);
      const value = log.args.value;
      if (from.toLowerCase() !== "0x0000000000000000000000000000000000000000") {
        const next = (balances.get(from) ?? 0n) - value;
        if (next < 0n) throw new Error(`negative reconstructed balance for ${from}; scan start is too late`);
        balances.set(from, next);
      }
      balances.set(to, (balances.get(to) ?? 0n) + value);
    }
    console.log(`Scanned blocks ${fromBlock}-${toBlock}`);
  }
  for (const account of [...balances.keys()]) if (excluded.has(account.toLowerCase())) balances.delete(account);
  const tree = buildRewardTree(epochId, balances, rewardAmount);
  const allocationPayload = tree.allocations.map((row) => ({
    account: row.account,
    balance: row.balance.toString(),
    amount: row.amount.toString(),
    proof: row.proof
  }));
  const allocationHash = keccak256(toHex(JSON.stringify(allocationPayload)));
  const file = {
    schema: "canopy.reward-allocation.v1",
    chainId: config.CHAIN_ID,
    epochId: epochId.toString(),
    beneficiaryToken,
    rewardToken,
    rewardAmount: rewardAmount.toString(),
    snapshotBlock: snapshotBlock.toString(),
    holderScanStartBlock: scanStart.toString(),
    exclusions: [...excluded].sort(),
    root: tree.root,
    allocationHash,
    totalEligibleBalance: tree.totalBalance.toString(),
    holderCount: tree.allocations.length,
    allocations: tree.allocations.map((row) => ({
      account: row.account,
      balance: row.balance.toString(),
      amount: row.amount.toString(),
      leaf: row.leaf,
      proof: row.proof
    }))
  };
  const outputDir = resolve(process.env.REWARD_OUTPUT_DIR ?? "reward-allocations");
  await mkdir(outputDir, { recursive: true });
  const output = resolve(outputDir, `epoch-${epochId}.json`);
  await writeFile(output, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`Root ${tree.root}`);
  console.log(`Allocation ${output}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
