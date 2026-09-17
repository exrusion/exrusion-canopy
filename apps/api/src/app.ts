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
    const result = await db.query(
      `SELECT epoch_id, beneficiary_token, reward_token, merkle_root, total_reward,
              snapshot_block, holder_count, allocation_hash, tx_hash, block_number, block_time
       FROM reward_epochs ORDER BY epoch_id DESC LIMIT 100`
    );
    return {
      state: result.rows.length ? "live" : "not_indexed",
      source: "published_merkle_epochs",
      account: account ?? null,
      items: result.rows
    };
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

