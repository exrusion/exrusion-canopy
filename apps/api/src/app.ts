import Fastify from "fastify";
import cors from "@fastify/cors";
import { createPublicClient, http, isAddress, type Address } from "viem";
import { PONS_GET_LAUNCHED_TOKEN_ABI } from "@canopy/shared";
import { config } from "./config.js";
import { db } from "./db.js";

const chain = {
  id: config.CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.RPC_HTTP_URL] } }
} as const;

const rpc = createPublicClient({ chain, transport: http(config.RPC_HTTP_URL, { timeout: 8_000 }) });
const rewardClaimStatusAbi = [{
  type: "function", name: "claimed", stateMutability: "view",
  inputs: [{ name: "epochId", type: "uint256" }, { name: "account", type: "address" }],
  outputs: [{ type: "bool" }]
}] as const;
const feeClaimableAbi = [{
  type: "function", name: "claimable", stateMutability: "view",
  inputs: [{ name: "recipient", type: "address" }, { name: "token", type: "address" }],
  outputs: [{ type: "uint256" }]
}] as const;

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, next) => typeof next === "bigint" ? next.toString() : next));
}

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/healthz", async () => ({ ok: true, service: "canopy-api" }));

  app.get("/v1/status", async () => {
    const [database, block, checkpoint] = await Promise.allSettled([
      db.query("SELECT NOW() AS now"),
      rpc.getBlockNumber(),
      db.query("SELECT worker, block_number, block_hash, updated_at FROM indexer_checkpoints ORDER BY worker")
    ]);

    const contractEntries = Object.entries({
      nestedPadRegistry: config.NESTED_PAD_REGISTRY,
      childTokenFactory: config.CHILD_TOKEN_FACTORY,
      feeRouter: config.FEE_ROUTER,
      rewardDistributor: config.REWARD_DISTRIBUTOR
    });
    const contractHealth = await Promise.all(contractEntries.map(async ([name, address]) => {
      if (!address) return { name, state: "integration_not_verified", address: null };
      try {
        const bytecode = await rpc.getBytecode({ address: address as Address });
        return { name, state: bytecode && bytecode !== "0x" ? "live" : "not_available", address };
      } catch {
        return { name, state: "not_available", address };
      }
    }));

    return jsonSafe({
      chain: {
        id: config.CHAIN_ID,
        rpc: block.status === "fulfilled" ? "live" : "not_available",
        latestBlock: block.status === "fulfilled" ? block.value : null,
        explorer: config.EXPLORER_URL
      },
      database: database.status === "fulfilled" ? "live" : "not_available",
      indexers: checkpoint.status === "fulfilled" ? checkpoint.value.rows : [],
      pons: { factory: config.PONS_V2_FACTORY, verification: "official_docs_and_repository" },
      contracts: contractHealth
    });
  });

  app.get("/v1/pads", async (request) => {
    const { limit = "50", cursor } = request.query as { limit?: string; cursor?: string };
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const params: unknown[] = [take];
    const where = cursor ? "WHERE block_number < $2" : "";
    if (cursor) params.push(cursor);
    const result = await db.query(
      `SELECT parent_token, owner_address, config_version, depth, pons_root, active, tx_hash, block_number, block_time
       FROM pads ${where} ORDER BY block_number DESC LIMIT $1`,
      params
    );
    return { state: result.rows.length ? "live" : "not_indexed", source: "indexed_onchain_events", items: result.rows };
  });

  app.get("/v1/tree", async () => {
    const result = await db.query(
      `SELECT c.token, c.parent_token, c.market, c.creator, c.token_name, c.token_symbol,
              c.metadata_uri, c.block_number, p.depth AS parent_depth
       FROM child_tokens c LEFT JOIN pads p ON p.parent_token = c.parent_token
       ORDER BY c.block_number ASC`
    );
    return { state: result.rows.length ? "live" : "not_indexed", source: "indexed_onchain_events", nodes: result.rows };
  });

  app.get("/v1/pulse", async (request) => {
    const { limit = "50" } = request.query as { limit?: string };
    const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const result = await db.query(
      `SELECT event_type, token, parent_token, actor, amount_in, amount_out, fee_amount,
              payload, tx_hash, block_number, block_time
       FROM protocol_events ORDER BY block_number DESC, log_index DESC LIMIT $1`,
      [take]
    );
    return { state: result.rows.length ? "live" : "not_indexed", source: "indexed_onchain_events", items: result.rows };
  });

  app.get("/v1/ledger", async (request) => {
    const { limit = "60" } = request.query as { limit?: string };
    const take = Math.min(Math.max(Number(limit) || 60, 1), 120);
    const result = await db.query(
      `SELECT minute, merkle_root, event_count, anchor_tx_hash, anchor_block_number, status, created_at
       FROM ledger_epochs ORDER BY minute DESC LIMIT $1`,
      [take]
    );
    return { state: result.rows.length ? "live" : "not_indexed", source: "verifiable_application_event_ledger", items: result.rows };
  });

  app.get("/v1/rewards", async (request) => {
    const { account } = request.query as { account?: string };
    if (account && !isAddress(account)) return { state: "not_available", error: "Invalid address" };
    const result = account
      ? await db.query(
          `SELECT e.epoch_id, e.beneficiary_token, e.reward_token, e.merkle_root, e.total_reward,
                  e.snapshot_block, e.holder_count, e.allocation_hash, e.tx_hash, e.block_number,
                  e.block_time, a.amount AS claim_amount, a.proof
           FROM reward_epochs e
           LEFT JOIN reward_allocations a
             ON a.epoch_id = e.epoch_id AND a.account = $1
           ORDER BY e.epoch_id DESC LIMIT 100`,
          [account.toLowerCase()]
        )
      : await db.query(
          `SELECT epoch_id, beneficiary_token, reward_token, merkle_root, total_reward,
                  snapshot_block, holder_count, allocation_hash, tx_hash, block_number, block_time,
                  NULL::numeric AS claim_amount, NULL::jsonb AS proof
           FROM reward_epochs ORDER BY epoch_id DESC LIMIT 100`
        );
    const items = await Promise.all(result.rows.map(async (row) => {
      if (!account || !row.claim_amount || !config.REWARD_DISTRIBUTOR) return { ...row, claimed: false };
      try {
        const claimed = await rpc.readContract({
          address: config.REWARD_DISTRIBUTOR as Address,
          abi: rewardClaimStatusAbi,
          functionName: "claimed",
          args: [BigInt(row.epoch_id), account as Address]
        });
        return { ...row, claimed };
      } catch {
        return { ...row, claimed: null };
      }
    }));
    return {
      state: result.rows.length ? "live" : "not_indexed",
      source: "published_merkle_epochs",
      account: account ?? null,
      items: jsonSafe(items)
    };
  });

  app.get("/v1/fee-claims/:account", async (request, reply) => {
    const { account } = request.params as { account: string };
    if (!isAddress(account)) return reply.code(400).send({ state: "not_available", error: "Invalid address" });
    if (!config.FEE_ROUTER) return { state: "integration_not_verified", source: "onchain_fee_router", items: [] };
    const candidates = await db.query<{ token: string }>(
      `SELECT DISTINCT parent_token AS token FROM child_tokens WHERE creator = $1
       UNION
       SELECT DISTINCT c.parent_token AS token
       FROM child_tokens c JOIN pads p ON p.parent_token = c.parent_token
       WHERE p.owner_address = $1`,
      [account.toLowerCase()]
    );
    const items = await Promise.all(candidates.rows.map(async ({ token }) => {
      try {
        const amount = await rpc.readContract({
          address: config.FEE_ROUTER as Address,
          abi: feeClaimableAbi,
          functionName: "claimable",
          args: [account as Address, token as Address]
        });
        return { token, amount: amount.toString(), state: "live" };
      } catch {
        return { token, amount: null, state: "not_available" };
      }
    }));
    return { state: "live", source: "onchain_fee_router", router: config.FEE_ROUTER, items };
  });

  app.get("/v1/token/:address", async (request, reply) => {
    const { address } = request.params as { address: string };
    if (!isAddress(address)) return reply.code(400).send({ state: "not_available", error: "Invalid address" });
    const result = await db.query(
      `SELECT c.*, p.owner_address AS pad_owner, p.active AS has_active_pad
       FROM child_tokens c LEFT JOIN pads p ON p.parent_token = c.token
       WHERE c.token = $1`,
      [address.toLowerCase()]
    );
    if (!result.rows[0]) return reply.code(404).send({ state: "not_indexed" });
    return { state: "live", source: "indexed_onchain_events", token: result.rows[0] };
  });

  app.get("/v1/pad/:address", async (request, reply) => {
    const { address } = request.params as { address: string };
    if (!isAddress(address)) return reply.code(400).send({ state: "not_available", error: "Invalid address" });
    const [pad, children] = await Promise.all([
      db.query("SELECT * FROM pads WHERE parent_token = $1", [address.toLowerCase()]),
      db.query("SELECT * FROM child_tokens WHERE parent_token = $1 ORDER BY block_number DESC", [address.toLowerCase()])
    ]);
    if (!pad.rows[0]) return reply.code(404).send({ state: "not_indexed" });
    return { state: "live", source: "indexed_onchain_events", pad: pad.rows[0], children: children.rows };
  });

  app.get("/v1/pons/token/:address", async (request, reply) => {
    const { address } = request.params as { address: string };
    if (!isAddress(address)) return reply.code(400).send({ state: "not_available", error: "Invalid address" });
    try {
      const launch = await rpc.readContract({
        address: config.PONS_V2_FACTORY as Address,
        abi: PONS_GET_LAUNCHED_TOKEN_ABI,
        functionName: "getLaunchedToken",
        args: [address as Address]
      });
      return jsonSafe({
        state: launch.exists && launch.token.toLowerCase() === address.toLowerCase() ? "live" : "not_available",
        verified: launch.exists && launch.token.toLowerCase() === address.toLowerCase(),
        factory: config.PONS_V2_FACTORY,
        launch
      });
    } catch (error) {
      request.log.warn({ error }, "pons verification failed");
      return reply.code(503).send({ state: "not_available", verified: false, error: "RPC verification unavailable" });
    }
  });

  return app;
}
