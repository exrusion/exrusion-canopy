# Canopy

Canopy is a recursive token-tree protocol for Robinhood Chain. A token launched through pons can be verified as a parent, then opened as a separate nested launchpad. Child tokens trade against the parent token through Canopy contracts. Canopy is not a blockchain, L2, or pons-operated product.

## Verified architecture

Pons v2 supports custom quote assets, but only assets approved by the pons owner. That does not permit an arbitrary token to become a pons quote currency. Canopy therefore uses the companion-protocol architecture:

1. Verify the parent token came from the official pons v2 factory.
2. Open a Canopy pad for that parent token.
3. Launch children through Canopy contracts, quoted in the parent token.
4. Route Canopy-generated fees according to an immutable, versioned split.
5. Index both pons and Canopy events into PostgreSQL.
6. Publish holder reward epochs as Merkle roots for pull-based claims.

The current source is pre-audit and must not be deployed to mainnet. No mainnet Canopy addresses exist yet.

## Monorepo

- `apps/web` — responsive Next.js interface
- `apps/api` — read-only public API backed by PostgreSQL
- `apps/indexer` — idempotent, reorg-aware event indexer
- `packages/contracts` — Solidity contracts and tests
- `packages/shared` — chain constants and shared types
- `docs/verification-report.md` — verified sources, addresses, decisions, and blockers

## Local development

```bash
pnpm install
docker compose up -d postgres
pnpm --filter @canopy/api db:migrate
pnpm dev
```

The UI deliberately reports `not_indexed`, `not_available`, or `integration_not_verified` when a canonical dependency is absent. No seed activity, placeholder liquidity, simulated market cap, or fabricated rewards are included.

Contract tests:

```bash
pnpm --filter @canopy/contracts test
```

Run the full verification set with `pnpm typecheck && pnpm test && pnpm build`.

## Indexing and rewards

Both `PONS_V2_DEPLOYMENT_BLOCK` and `NESTED_PAD_REGISTRY_DEPLOYMENT_BLOCK` must be supplied from verified deployment records. The worker refuses to guess either start block. It processes bounded ranges, validates saved block hashes, rewinds on reorgs, and derives one-minute event-ledger roots from canonical Canopy logs.

Holder distributions are built from ERC-20 `Transfer` history at an explicit snapshot block:

```bash
pnpm --filter @canopy/indexer rewards:build
```

All snapshot inputs are required in the environment. The output includes every allocation and Merkle proof and can be published alongside the corresponding onchain epoch.

## Testnet deployment

`pnpm --filter @canopy/contracts deploy:testnet` is hard-blocked unless the connected network is Robinhood Chain testnet (`46630`). It also requires a separately verified pons v2 testnet factory address. See [docs/deployment.md](docs/deployment.md).

## Deployment rule

Frontend, API, PostgreSQL, and worker are designed for Railway. Vercel is not used as an application runtime. Mainnet contract deployment is intentionally absent and requires an audit, verified deployment parameters, multisig ownership, and explicit owner approval.
