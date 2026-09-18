import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isHex,
  type Address,
  type Hex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

const rewardAbi = [
  { type: "function", name: "nextEpochId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableRewards", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "publishEpoch", stateMutability: "nonpayable",
    inputs: [
      { name: "beneficiaryToken", type: "address" }, { name: "rewardToken", type: "address" },
      { name: "merkleRoot", type: "bytes32" }, { name: "totalReward", type: "uint256" },
      { name: "snapshotBlock", type: "uint256" }, { name: "holderCount", type: "uint256" },
      { name: "allocationHash", type: "bytes32" }
    ],
    outputs: [{ name: "epochId", type: "uint256" }]
  }
] as const;

type AllocationFile = {
  schema: string;
  chainId: number;
  epochId: string;
  beneficiaryToken: Address;
  rewardToken: Address;
  rewardAmount: string;
  snapshotBlock: string;
  root: Hex;
  allocationHash: Hex;
  holderCount: number;
  allocations: Array<{ account: Address; balance: string; amount: string; leaf: Hex; proof: Hex[] }>;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const rewardDistributor = getAddress(required("REWARD_DISTRIBUTOR"));
  const privateKey = required("PUBLISHER_PRIVATE_KEY") as Hex;
  if (!isHex(privateKey) || privateKey.length !== 66) throw new Error("PUBLISHER_PRIVATE_KEY is invalid");
  const file = JSON.parse(await readFile(required("REWARD_ALLOCATION_FILE"), "utf8")) as AllocationFile;
  if (file.schema !== "canopy.reward-allocation.v1" || file.chainId !== config.CHAIN_ID) throw new Error("Allocation file network or schema mismatch");
  if (file.allocations.length !== file.holderCount || file.holderCount === 0) throw new Error("Allocation holder count mismatch");
  if (!isHex(file.root, { strict: true }) || !isHex(file.allocationHash, { strict: true })) throw new Error("Invalid allocation commitment");

  const chain = {
    id: config.CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.RPC_HTTP_URL] } }
  } as const;
  const transport = http(config.RPC_HTTP_URL, { timeout: 30_000, retryCount: 3 });
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });
  const [nextEpochId, available] = await Promise.all([
    publicClient.readContract({ address: rewardDistributor, abi: rewardAbi, functionName: "nextEpochId" }),
    publicClient.readContract({ address: rewardDistributor, abi: rewardAbi, functionName: "availableRewards", args: [getAddress(file.beneficiaryToken), getAddress(file.rewardToken)] })
  ]);
  if (nextEpochId !== BigInt(file.epochId)) throw new Error(`Expected epoch ${file.epochId}, contract reports ${nextEpochId}`);
  if (available < BigInt(file.rewardAmount)) throw new Error("Reward distributor balance is below the allocation total");

  const hash = await wallet.writeContract({
    address: rewardDistributor,
    abi: rewardAbi,
    functionName: "publishEpoch",
    args: [getAddress(file.beneficiaryToken), getAddress(file.rewardToken), file.root, BigInt(file.rewardAmount), BigInt(file.snapshotBlock), BigInt(file.holderCount), file.allocationHash]
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: Number(config.INDEXER_CONFIRMATIONS) });
  if (receipt.status !== "success") throw new Error(`Epoch publication reverted: ${hash}`);

  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of file.allocations) {
      await client.query(
        `INSERT INTO reward_allocations (epoch_id, account, balance, amount, leaf, proof)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (epoch_id, account) DO UPDATE SET
           balance=EXCLUDED.balance, amount=EXCLUDED.amount, leaf=EXCLUDED.leaf, proof=EXCLUDED.proof`,
        [file.epochId, row.account.toLowerCase(), row.balance, row.amount, row.leaf, JSON.stringify(row.proof)]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  console.log(JSON.stringify({ message: "reward epoch published", epochId: file.epochId, transactionHash: hash, allocations: file.holderCount }));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
