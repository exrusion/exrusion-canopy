import { z } from "zod";
import { PONS_V2, ROBINHOOD_CHAIN } from "@canopy/shared";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/canopy"),
  CHAIN_ID: z.coerce.number().int().default(ROBINHOOD_CHAIN.id),
  RPC_HTTP_URL: z.string().url().default(ROBINHOOD_CHAIN.rpcUrl),
  EXPLORER_URL: z.string().url().default(ROBINHOOD_CHAIN.explorerUrl),
  PONS_V2_FACTORY: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default(PONS_V2.factory),
  NESTED_PAD_REGISTRY: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  CHILD_TOKEN_FACTORY: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  FEE_ROUTER: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  REWARD_DISTRIBUTOR: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
});

export const config = schema.parse(process.env);
