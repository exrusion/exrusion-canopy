import { z } from "zod";
import { PONS_V2, ROBINHOOD_CHAIN } from "@canopy/shared";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/canopy"),
  CHAIN_ID: z.coerce.number().int().default(ROBINHOOD_CHAIN.id),
  RPC_HTTP_URL: z.string().url().default(ROBINHOOD_CHAIN.rpcUrl),
  PONS_V2_FACTORY: address.default(PONS_V2.factory),
  PONS_V2_DEPLOYMENT_BLOCK: z.coerce.bigint().optional(),
  NESTED_PAD_REGISTRY: address.optional(),
  NESTED_PAD_REGISTRY_DEPLOYMENT_BLOCK: z.coerce.bigint().optional(),
  CHILD_TOKEN_FACTORY: address.optional(),
  FEE_ROUTER: address.optional(),
  REWARD_DISTRIBUTOR: address.optional(),
  LEDGER_ANCHOR: address.optional(),
  INDEXER_CONFIRMATIONS: z.coerce.bigint().default(20n),
  INDEXER_CHUNK_SIZE: z.coerce.bigint().min(10n).max(2_000n).default(500n),
  POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000)
});

export const config = schema.parse(process.env);

