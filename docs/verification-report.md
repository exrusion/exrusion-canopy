# Verification report

Verified on 2026-09-17. This report separates official facts from implementation decisions. Contract addresses must be rechecked immediately before any deployment.

## Robinhood Chain

Official source: https://docs.robinhood.com/chain/connecting/

| Item | Mainnet | Testnet |
| --- | --- | --- |
| Chain ID | `4663` | `46630` |
| Native gas | ETH | ETH |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | https://robinhoodchain.blockscout.com | https://explorer.testnet.chain.robinhood.com |

Robinhood documents the chain as an Arbitrum Layer 2 using Ethereum blobs for data availability. Public RPCs are rate-limited; Robinhood recommends an archive-capable provider such as Alchemy for production indexing.

Official token source: https://docs.robinhood.com/chain/contracts/

| Token | Mainnet address |
| --- | --- |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |

## Pons v2

Official sources:

- https://docs.ponsfamily.com/v2
- https://www.ponsfamily.com/launchpad
- https://github.com/ponsdotdev/ponsfamily

The official docs state that pons v2 launches on a bonding curve and graduates into a permanently locked Uniswap v4 pool. It has no pons API in the trust path; integrations should read factory and curve events directly.

The public `ponsdotdev/ponsfamily` repository is the official v1/v2 source repository referenced for contract-level verification. Both factory generations are published there; Canopy targets the v2 interfaces and addresses only.

| Contract | Mainnet address |
| --- | --- |
| Factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |
| Meme hook | `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044` |
| Fee escrow | `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e` |
| Buyback vault | `0x42df2a798f82289E177311362e8f5ccC45c1219c` |
| Launch locker | `0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952` |
| Launch and buy | `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948` |
| Launch deployer | `0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42` |
| Graduation executor | `0xC7819B64A1dAECD7eC19856d026cb14EfBd89046` |
| Graduation guard | `0xf5695117b99B6f6401e67d4195BD653628176C6C` |

Canonical launch event:

```solidity
event TokenLaunched(
  address indexed token,
  address indexed curve,
  address indexed deployer,
  address pairToken,
  uint256 launchConfigId,
  uint256 graduationThreshold
);
```

### Capability findings

- Custom pair tokens are supported only when `approvedPairTokens(asset)` is true and non-zero `pairTokenEconomics(asset)` exists.
- Approval is controlled by pons and closed by default; creators cannot approve arbitrary quote assets.
- A launch's quote asset is immutable and its creator payouts arrive in that asset.
- Creator fee recipients can redirect future pons payouts under pons rules.
- These controls do not allow Canopy to redirect pons fees into arbitrary holder, burn, liquidity, or ancestor destinations.
- Pons v2 public launches are currently described as closed to non-whitelisted wallets.
- Pons v2 is deployed but the official docs state all three independent reviews are still in progress; treat v2 as unaudited.
- The docs offer early access to v2 test-network addresses only through `contact@ponsfamily.com`; no public test deployment addresses were published in the reviewed page.

## Architecture decision

Use the companion-protocol path, not native recursive pons composition.

Every root or parent must first be verified as a real pons launch by checking `getLaunchedToken(token)` and the canonical `TokenLaunched` log from the correct factory. A Canopy pad is then opened separately. Only trades executed by Canopy contracts produce Canopy fee routing or holder rewards.

Pons v2 custom pairs can be surfaced as an optional native route only when the exact parent asset is already approved by pons. The interface must check this on-chain and never imply approval.

## DEX and routing

Uniswap officially supports Robinhood Chain and identifies Uniswap as its primary public AMM: https://blog.uniswap.org/robinhood-chain-is-live

For the first Canopy test release, child markets use Canopy's own audited market contracts. External graduation and an atomic router across external venues remain disabled until exact deployment addresses, hook behavior, and router compatibility are reverified and covered by tests. The interface returns `Integration not verified` rather than simulating a route.

## Deployment blockers

1. Obtain official pons v2 test-network addresses or written integration guidance.
2. Complete independent review of Canopy contracts.
3. Decide the audited child-market invariant and graduation destination.
4. Configure a Safe multisig for admin and emergency roles.
5. Deploy to Robinhood Chain testnet (`46630`) and publish verified source.
6. Run the acceptance test with real test transactions.
7. Obtain explicit approval before any mainnet deployment.
