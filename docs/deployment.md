# Deployment runbook

This runbook intentionally stops before any mainnet contract deployment.

## 1. Testnet contracts

Obtain the official pons v2 Robinhood Chain testnet factory from pons. Do not substitute the documented mainnet address.

Set:

- `RPC_HTTP_URL` to an archive-capable Robinhood Chain testnet endpoint.
- `DEPLOYER_PRIVATE_KEY` to the funded testnet deployer.
- `PONS_V2_FACTORY` to the independently verified testnet factory.
- `ADMIN_ADDRESS`, `PAUSER_ADDRESS`, `PUBLISHER_ADDRESS`, `ANCHORER_ADDRESS`, and `PROTOCOL_TREASURY` to reviewed role holders. Use a multisig where the network supports it.

Then run:

```bash
pnpm --filter @canopy/contracts deploy:testnet
```

The script rejects every chain except `46630` and writes `deployments/robinhood-testnet.json`. Verify each contract on the explorer, record the deployment block, and run the contract acceptance flow before configuring public services.

## 2. Railway services

Create one Railway project with PostgreSQL plus three services pointing at the same GitHub repository:

| Service | Config path | Required variables |
| --- | --- | --- |
| Web | `apps/web/railway.toml` | `NEXT_PUBLIC_API_URL`, chain/explorer URLs, deployed public contract addresses |
| API | `apps/api/railway.toml` | `DATABASE_URL`, RPC/explorer URLs, verified contract addresses |
| Indexer | `apps/indexer/railway.toml` | `DATABASE_URL`, archive RPC, exact deployment blocks, verified contract addresses |

Run `pnpm --filter @canopy/api db:migrate` once against Railway PostgreSQL. Confirm `/healthz` first, then `/v1/status`. The status response must show bytecode-backed Canopy contracts before the UI is treated as live.

## 3. Acceptance gate

Before a public testnet launch:

1. Verify the official pons root check against at least one real test token.
2. Open a pad from the exact recorded deployer wallet.
3. Launch a child with parent-token seed liquidity.
4. Execute buy, sell, slippage failure, pause, and two-hop route cases.
5. Confirm fee splits reconcile to the emitted fee amount.
6. Rebuild a holder snapshot independently and compare the Merkle root.
7. Confirm the indexer recovers from an induced local reorg or forked-chain rewind.
8. Confirm the UI never shows inferred prices, rewards, liquidity, or activity.

## 4. Mainnet gate

There is no mainnet deployment script. Add one only after an independent audit, fixed deployment manifest, verified external integration addresses, multisig handoff, completed testnet acceptance report, and explicit owner approval.
