# Security limitations

- The contracts are pre-audit and are not approved for mainnet.
- Pons v2 itself is documented as under three ongoing reviews.
- Pons v2 public launching may be gated; Canopy cannot bypass that gate.
- Arbitrary parent tokens cannot become native pons pair tokens unless pons approves them.
- Holder rewards require an off-chain snapshot builder. The on-chain distributor verifies proofs but cannot prove the indexer chose the correct eligible set; published allocation files and reproducible tooling are required.
- The maximum ancestor depth is three to keep gas bounded.
- The current RouteExecutor supports only Canopy markets. External pons and Uniswap hops are disabled until each deployed integration is verified.
- Emergency pause can stop new pads, launches, trades, and epoch creation. Claims remain available while paused so already-published rewards are not trapped.
- Admin and publisher roles must be held by a multisig before public deployment.

