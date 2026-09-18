import { Pool, type PoolClient } from "pg";
import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type Hex,
  type Log
} from "viem";
import { PONS_TOKEN_LAUNCHED_EVENT, ROBINHOOD_CHAIN } from "@canopy/shared";
import { config } from "./config.js";
import { factoryEvents, feeEvents, marketEvents, registryEvents, rewardEvents } from "./abis.js";
import { eventLeaf, merkleRoot } from "./merkle.js";

const pool = new Pool({ connectionString: config.DATABASE_URL });
const chain = {
  id: config.CHAIN_ID,
  name: config.CHAIN_ID === ROBINHOOD_CHAIN.id ? ROBINHOOD_CHAIN.name : "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.RPC_HTTP_URL] } }
} as const;
const rpc = createPublicClient({ chain, transport: http(config.RPC_HTTP_URL, { timeout: 20_000, retryCount: 3 }) });

type EventLog = Log<bigint, number, false> & { blockNumber: bigint; blockHash: Hex; transactionHash: Hex; logIndex: number };
type Checkpoint = { block_number: string; block_hash: Hex };

const lower = (value: string) => value.toLowerCase();
const json = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item);

function requiredLog(log: Log): EventLog {
  if (log.blockNumber == null || log.blockHash == null || log.transactionHash == null || log.logIndex == null) {
    throw new Error("RPC returned an unmined log");
  }
  return log as EventLog;
}

async function blockTime(blockNumber: bigint, cache: Map<bigint, Date>): Promise<Date> {
  const cached = cache.get(blockNumber);
  if (cached) return cached;
  const block = await rpc.getBlock({ blockNumber });
  const value = new Date(Number(block.timestamp) * 1_000);
  cache.set(blockNumber, value);
  return value;
}

async function recordBlock(client: PoolClient, log: EventLog, time: Date) {
  const block = await rpc.getBlock({ blockNumber: log.blockNumber });
  await client.query(
    `INSERT INTO chain_blocks (chain_id, block_number, block_hash, parent_hash, block_time)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (chain_id, block_number) DO UPDATE
     SET block_hash = EXCLUDED.block_hash, parent_hash = EXCLUDED.parent_hash, block_time = EXCLUDED.block_time`,
    [config.CHAIN_ID, log.blockNumber.toString(), log.blockHash, block.parentHash, time]
  );
}

async function upsertEvent(client: PoolClient, input: {
  eventType: string;
  token?: string;
  parentToken?: string;
  actor?: string;
  amountIn?: bigint;
  amountOut?: bigint;
  feeAmount?: bigint;
  payload: unknown;
  log: EventLog;
  time: Date;
}) {
  await client.query(
    `INSERT INTO protocol_events
      (event_type, token, parent_token, actor, amount_in, amount_out, fee_amount, payload,
       tx_hash, log_index, block_number, block_hash, block_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)
     ON CONFLICT (tx_hash, log_index) DO UPDATE
     SET event_type=EXCLUDED.event_type, token=EXCLUDED.token, parent_token=EXCLUDED.parent_token,
         actor=EXCLUDED.actor, amount_in=EXCLUDED.amount_in, amount_out=EXCLUDED.amount_out,
         fee_amount=EXCLUDED.fee_amount, payload=EXCLUDED.payload, block_hash=EXCLUDED.block_hash,
         block_time=EXCLUDED.block_time`,
    [
      input.eventType,
      input.token ? lower(input.token) : null,
      input.parentToken ? lower(input.parentToken) : null,
      input.actor ? lower(input.actor) : null,
      input.amountIn?.toString() ?? null,
      input.amountOut?.toString() ?? null,
      input.feeAmount?.toString() ?? null,
      json(input.payload),
      input.log.transactionHash,
      input.log.logIndex,
      input.log.blockNumber.toString(),
      input.log.blockHash,
      input.time
    ]
  );
}

async function checkpoint(worker: string): Promise<Checkpoint | null> {
  const result = await pool.query<Checkpoint>(
    "SELECT block_number::text, block_hash FROM indexer_checkpoints WHERE worker=$1",
    [worker]
  );
  return result.rows[0] ?? null;
}

async function setCheckpoint(client: PoolClient, worker: string, blockNumber: bigint, blockHash: Hex) {
  await client.query(
    `INSERT INTO indexer_checkpoints (worker, chain_id, block_number, block_hash)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (worker) DO UPDATE
     SET block_number=EXCLUDED.block_number, block_hash=EXCLUDED.block_hash, updated_at=NOW()`,
    [worker, config.CHAIN_ID, blockNumber.toString(), blockHash]
  );
}

async function canonicalNextBlock(worker: string, configuredStart: bigint, scope: "pons" | "canopy"): Promise<bigint> {
  const saved = await checkpoint(worker);
  if (!saved) return configuredStart;
  const savedNumber = BigInt(saved.block_number);
  try {
    const block = await rpc.getBlock({ blockNumber: savedNumber });
    if (lower(block.hash) === lower(saved.block_hash)) return savedNumber + 1n;
  } catch {
    // A missing block is treated as a reorg and handled by the bounded rewind below.
  }

  const rollback = savedNumber > 100n ? savedNumber - 100n : configuredStart;
  const rollbackBlock = await rpc.getBlock({ blockNumber: rollback });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (scope === "pons") {
      await client.query("DELETE FROM pons_launches WHERE block_number > $1", [rollback.toString()]);
    } else {
      await client.query("DELETE FROM reward_epochs WHERE block_number > $1", [rollback.toString()]);
      await client.query("DELETE FROM protocol_events WHERE block_number > $1", [rollback.toString()]);
      await client.query("DELETE FROM child_tokens WHERE block_number > $1", [rollback.toString()]);
      await client.query("DELETE FROM pads WHERE block_number > $1", [rollback.toString()]);
      await client.query("DELETE FROM ledger_epochs WHERE minute > $1", [Number(rollbackBlock.timestamp) / 60]);
    }
    await client.query("DELETE FROM chain_blocks WHERE chain_id=$1 AND block_number > $2", [config.CHAIN_ID, rollback.toString()]);
    await setCheckpoint(client, worker, rollback, rollbackBlock.hash);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  console.warn(JSON.stringify({ message: "chain reorganization detected", worker, rollback: rollback.toString() }));
  return rollback + 1n;
}

async function indexPons(fromBlock: bigint, toBlock: bigint) {
  const logs = await rpc.getLogs({
    address: getAddress(config.PONS_V2_FACTORY),
    event: PONS_TOKEN_LAUNCHED_EVENT,
    fromBlock,
    toBlock,
    strict: true
  });
  const cache = new Map<bigint, Date>();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const source of logs) {
      const args = source.args;
      const log = requiredLog(source);
      const time = await blockTime(log.blockNumber, cache);
      await recordBlock(client, log, time);
      await client.query(
        `INSERT INTO pons_launches
          (token, curve, deployer, pair_token, launch_config_id, graduation_threshold,
           tx_hash, log_index, block_number, block_hash, block_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (token) DO UPDATE SET
           curve=EXCLUDED.curve, deployer=EXCLUDED.deployer, pair_token=EXCLUDED.pair_token,
           launch_config_id=EXCLUDED.launch_config_id, graduation_threshold=EXCLUDED.graduation_threshold,
           tx_hash=EXCLUDED.tx_hash, log_index=EXCLUDED.log_index, block_number=EXCLUDED.block_number,
           block_hash=EXCLUDED.block_hash, block_time=EXCLUDED.block_time`,
        [
          lower(args.token), lower(args.curve), lower(args.deployer), lower(args.pairToken),
          args.launchConfigId.toString(), args.graduationThreshold.toString(), log.transactionHash,
          log.logIndex, log.blockNumber.toString(), log.blockHash, time
        ]
      );
    }
    const end = await rpc.getBlock({ blockNumber: toBlock });
    await setCheckpoint(client, "pons-v2", toBlock, end.hash);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function contractLogs(address: Address, abi: readonly unknown[], fromBlock: bigint, toBlock: bigint) {
  return rpc.getLogs({ address, events: abi as never, fromBlock, toBlock });
}

async function marketLogs(fromBlock: bigint, toBlock: bigint, markets: Address[]) {
  if (markets.length === 0) return [];
  const [buy, sell] = await Promise.all([
    rpc.getLogs({ address: markets, event: parseAbiItem("event Buy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee)"), fromBlock, toBlock }),
    rpc.getLogs({ address: markets, event: parseAbiItem("event Sell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee)"), fromBlock, toBlock })
  ]);
  return [...buy, ...sell];
}

async function indexCanopy(fromBlock: bigint, toBlock: bigint) {
  const registry = getAddress(config.NESTED_PAD_REGISTRY!);
  const factory = getAddress(config.CHILD_TOKEN_FACTORY!);
  const [registryLogs, factoryLogs, feeLogs, rewardLogs] = await Promise.all([
    contractLogs(registry, registryEvents, fromBlock, toBlock),
    contractLogs(factory, factoryEvents, fromBlock, toBlock),
    config.FEE_ROUTER ? contractLogs(getAddress(config.FEE_ROUTER), feeEvents, fromBlock, toBlock) : [],
    config.REWARD_DISTRIBUTOR ? contractLogs(getAddress(config.REWARD_DISTRIBUTOR), rewardEvents, fromBlock, toBlock) : []
  ]);
  const knownMarketsResult = await pool.query<{ market: string }>("SELECT market FROM child_tokens");
  const marketAddresses = new Set<Address>(knownMarketsResult.rows.map((row) => getAddress(row.market)));
  for (const source of factoryLogs as Log[]) {
    try {
      const decoded = decodeEventLog({ abi: factoryEvents, data: source.data, topics: source.topics });
      if (decoded.eventName === "ChildLaunched") marketAddresses.add(getAddress((decoded.args as { market: string }).market));
    } catch {
      // Unknown factory logs are ignored; strict decoding happens in the canonical pass below.
    }
  }
  const trades = await marketLogs(fromBlock, toBlock, [...marketAddresses]);
  const all = [...registryLogs, ...factoryLogs, ...feeLogs, ...rewardLogs, ...trades].map(requiredLog)
    .sort((a, b) => a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
  const knownMarkets = new Set(knownMarketsResult.rows.map((row) => lower(row.market)));
  const cache = new Map<bigint, Date>();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const log of all) {
      const time = await blockTime(log.blockNumber, cache);
      const address = lower(log.address);
      let decoded: ReturnType<typeof decodeEventLog>;
      if (address === lower(registry)) decoded = decodeEventLog({ abi: registryEvents, data: log.data, topics: log.topics });
      else if (address === lower(factory)) decoded = decodeEventLog({ abi: factoryEvents, data: log.data, topics: log.topics });
      else if (config.FEE_ROUTER && address === lower(config.FEE_ROUTER)) decoded = decodeEventLog({ abi: feeEvents, data: log.data, topics: log.topics });
      else if (config.REWARD_DISTRIBUTOR && address === lower(config.REWARD_DISTRIBUTOR)) decoded = decodeEventLog({ abi: rewardEvents, data: log.data, topics: log.topics });
      else {
        if (!knownMarkets.has(address)) continue;
        decoded = decodeEventLog({ abi: marketEvents, data: log.data, topics: log.topics });
      }
      const args = decoded.args as Record<string, any>;
      await recordBlock(client, log, time);

      if (decoded.eventName === "PadOpened") {
        await client.query(
          `INSERT INTO pads
            (parent_token, owner_address, config_version, depth, pons_root, active,
             tx_hash, log_index, block_number, block_hash, block_time)
           VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,$9,$10)
           ON CONFLICT (parent_token) DO UPDATE SET
             owner_address=EXCLUDED.owner_address, config_version=EXCLUDED.config_version,
             depth=EXCLUDED.depth, pons_root=EXCLUDED.pons_root, active=TRUE,
             tx_hash=EXCLUDED.tx_hash, log_index=EXCLUDED.log_index, block_number=EXCLUDED.block_number,
             block_hash=EXCLUDED.block_hash, block_time=EXCLUDED.block_time`,
          [lower(args.parentToken), lower(args.owner), args.configVersion.toString(), Number(args.depth), args.ponsRoot,
            log.transactionHash, log.logIndex, log.blockNumber.toString(), log.blockHash, time]
        );
        await upsertEvent(client, { eventType: "pad_opened", token: args.parentToken, actor: args.owner, payload: args, log, time });
      } else if (decoded.eventName === "PadStatusChanged") {
        await client.query("UPDATE pads SET active=$1 WHERE parent_token=$2", [args.active, lower(args.parentToken)]);
        await upsertEvent(client, { eventType: "pad_status_changed", token: args.parentToken, payload: args, log, time });
      } else if (decoded.eventName === "ChildLaunched") {
        knownMarkets.add(lower(args.market));
        const [tokenName, tokenSymbol] = await Promise.all([
          rpc.readContract({ address: getAddress(args.childToken), abi: erc20Abi, functionName: "name", blockNumber: log.blockNumber }).catch(() => null),
          rpc.readContract({ address: getAddress(args.childToken), abi: erc20Abi, functionName: "symbol", blockNumber: log.blockNumber }).catch(() => null)
        ]);
        await client.query(
          `INSERT INTO child_tokens
            (token, parent_token, market, creator, token_name, token_symbol, metadata_uri, supply, initial_quote_seed,
             config_version, tx_hash, log_index, block_number, block_hash, block_time)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (token) DO UPDATE SET
             parent_token=EXCLUDED.parent_token, market=EXCLUDED.market, creator=EXCLUDED.creator,
             token_name=EXCLUDED.token_name, token_symbol=EXCLUDED.token_symbol,
             metadata_uri=EXCLUDED.metadata_uri, supply=EXCLUDED.supply,
             initial_quote_seed=EXCLUDED.initial_quote_seed, config_version=EXCLUDED.config_version,
             tx_hash=EXCLUDED.tx_hash, log_index=EXCLUDED.log_index, block_number=EXCLUDED.block_number,
             block_hash=EXCLUDED.block_hash, block_time=EXCLUDED.block_time`,
          [lower(args.childToken), lower(args.parentToken), lower(args.market), lower(args.creator), tokenName, tokenSymbol,
            args.metadataUri, args.supply.toString(), args.initialQuoteSeed.toString(), args.configVersion.toString(),
            log.transactionHash, log.logIndex, log.blockNumber.toString(), log.blockHash, time]
        );
        await upsertEvent(client, { eventType: "child_launched", token: args.childToken, parentToken: args.parentToken, actor: args.creator, payload: args, log, time });
      } else if (decoded.eventName === "Buy") {
        const tokenResult = await client.query<{ token: string; parent_token: string }>("SELECT token,parent_token FROM child_tokens WHERE market=$1", [address]);
        const token = tokenResult.rows[0];
        if (token) await upsertEvent(client, { eventType: "buy", token: token.token, parentToken: token.parent_token, actor: args.buyer, amountIn: args.quoteIn, amountOut: args.tokensOut, feeAmount: args.fee, payload: args, log, time });
      } else if (decoded.eventName === "Sell") {
        const tokenResult = await client.query<{ token: string; parent_token: string }>("SELECT token,parent_token FROM child_tokens WHERE market=$1", [address]);
        const token = tokenResult.rows[0];
        if (token) await upsertEvent(client, { eventType: "sell", token: token.token, parentToken: token.parent_token, actor: args.seller, amountIn: args.tokensIn, amountOut: args.quoteOut, feeAmount: args.fee, payload: args, log, time });
      } else if (decoded.eventName === "FeeRouted") {
        await upsertEvent(client, { eventType: "fee_routed", token: args.childToken, feeAmount: args.amount, payload: args, log, time });
      } else if (decoded.eventName === "EpochPublished") {
        await client.query(
          `INSERT INTO reward_epochs
            (epoch_id, beneficiary_token, reward_token, merkle_root, total_reward, snapshot_block,
             holder_count, allocation_hash, tx_hash, block_number, block_hash, block_time)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (epoch_id) DO UPDATE SET
             merkle_root=EXCLUDED.merkle_root, total_reward=EXCLUDED.total_reward,
             snapshot_block=EXCLUDED.snapshot_block, holder_count=EXCLUDED.holder_count,
             allocation_hash=EXCLUDED.allocation_hash, tx_hash=EXCLUDED.tx_hash,
             block_number=EXCLUDED.block_number, block_hash=EXCLUDED.block_hash, block_time=EXCLUDED.block_time`,
          [args.epochId.toString(), lower(args.beneficiaryToken), lower(args.rewardToken), args.merkleRoot,
            args.totalReward.toString(), args.snapshotBlock.toString(), args.holderCount.toString(), args.allocationHash,
            log.transactionHash, log.blockNumber.toString(), log.blockHash, time]
        );
        await upsertEvent(client, { eventType: "reward_epoch_published", token: args.beneficiaryToken, payload: args, log, time });
      }
    }
    const end = await rpc.getBlock({ blockNumber: toBlock });
    await setCheckpoint(client, "canopy", toBlock, end.hash);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function computeLedger() {
  const result = await pool.query<{
    minute: string;
    tx_hash: Hex;
    log_index: number;
    event_type: string;
    payload: unknown;
  }>(
    `SELECT FLOOR(EXTRACT(EPOCH FROM block_time) / 60)::bigint::text AS minute,
            tx_hash, log_index, event_type, payload
     FROM protocol_events
     WHERE block_time IS NOT NULL
     ORDER BY minute ASC, tx_hash ASC, log_index ASC`
  );
  const groups = new Map<string, typeof result.rows>();
  for (const row of result.rows) groups.set(row.minute, [...(groups.get(row.minute) ?? []), row]);
  for (const [minute, rows] of groups) {
    const root = merkleRoot(rows.map((row) => eventLeaf(row.tx_hash, row.log_index, row.event_type, row.payload)));
    if (!root) continue;
    await pool.query(
      `INSERT INTO ledger_epochs (minute, merkle_root, event_count, status)
       VALUES ($1,$2,$3,'computed')
       ON CONFLICT (minute) DO UPDATE SET
         merkle_root=EXCLUDED.merkle_root, event_count=EXCLUDED.event_count,
         status=CASE WHEN ledger_epochs.status='anchored' AND ledger_epochs.merkle_root=EXCLUDED.merkle_root
                     THEN 'anchored' ELSE 'computed' END`,
      [minute, root, rows.length]
    );
  }
}

async function processRange(worker: string, start: bigint, safeHead: bigint, scope: "pons" | "canopy", run: (from: bigint, to: bigint) => Promise<void>) {
  let from = await canonicalNextBlock(worker, start, scope);
  while (from <= safeHead) {
    const to = from + config.INDEXER_CHUNK_SIZE - 1n > safeHead ? safeHead : from + config.INDEXER_CHUNK_SIZE - 1n;
    await run(from, to);
    console.info(JSON.stringify({ message: "indexed range", worker, from: from.toString(), to: to.toString() }));
    from = to + 1n;
  }
}

async function tick() {
  const ponsStart = config.PONS_V2_DEPLOYMENT_BLOCK;
  const canopyStart = config.NESTED_PAD_REGISTRY_DEPLOYMENT_BLOCK;
  const ponsEnabled = ponsStart != null;
  const canopyEnabled = Boolean(
    config.NESTED_PAD_REGISTRY &&
    canopyStart != null &&
    config.CHILD_TOKEN_FACTORY
  );

  // Do not poll the public RPC while every indexer is intentionally disabled.
  // This keeps preview deployments idle until verified deployment blocks and
  // contract addresses are provided, instead of generating avoidable 429s.
  if (!ponsEnabled && !canopyEnabled) return;

  const head = await rpc.getBlockNumber();
  if (head <= config.INDEXER_CONFIRMATIONS) return;
  const safeHead = head - config.INDEXER_CONFIRMATIONS;
  if (ponsStart != null) {
    await processRange("pons-v2", ponsStart, safeHead, "pons", indexPons);
  }
  if (canopyEnabled && canopyStart != null) {
    await processRange("canopy", canopyStart, safeHead, "canopy", indexCanopy);
    await computeLedger();
  }
}

async function main() {
  if (config.PONS_V2_DEPLOYMENT_BLOCK == null) {
    console.warn("PONS_V2_DEPLOYMENT_BLOCK is unset; Pons backfill is disabled rather than guessing a start block.");
  }
  if (!config.NESTED_PAD_REGISTRY || config.NESTED_PAD_REGISTRY_DEPLOYMENT_BLOCK == null || !config.CHILD_TOKEN_FACTORY) {
    console.warn("Canopy contract addresses/deployment block are unset; Canopy indexing is in integration_not_verified state.");
  }
  for (;;) {
    try {
      await tick();
    } catch (error) {
      console.error(error);
    }
    await new Promise((resolve) => setTimeout(resolve, config.POLL_INTERVAL_MS));
  }
}

const shutdown = async () => {
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void main();
