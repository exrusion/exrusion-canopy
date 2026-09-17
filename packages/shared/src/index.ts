export const ROBINHOOD_CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com"
} as const;

export const ROBINHOOD_TESTNET = {
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrl: "https://rpc.testnet.chain.robinhood.com",
  explorerUrl: "https://explorer.testnet.chain.robinhood.com"
} as const;

export const PONS_V2 = {
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  memeHook: "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044",
  feeEscrow: "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e",
  buybackVault: "0x42df2a798f82289E177311362e8f5ccC45c1219c",
  launchLocker: "0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952",
  launchAndBuy: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
  launchDeployer: "0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42",
  graduationExecutor: "0xC7819B64A1dAECD7eC19856d026cb14EfBd89046",
  graduationGuard: "0xf5695117b99B6f6401e67d4195BD653628176C6C"
} as const;

export const PONS_TOKEN_LAUNCHED_EVENT = {
  type: "event",
  name: "TokenLaunched",
  inputs: [
    { indexed: true, name: "token", type: "address" },
    { indexed: true, name: "curve", type: "address" },
    { indexed: true, name: "deployer", type: "address" },
    { indexed: false, name: "pairToken", type: "address" },
    { indexed: false, name: "launchConfigId", type: "uint256" },
    { indexed: false, name: "graduationThreshold", type: "uint256" }
  ]
} as const;

export const PONS_GET_LAUNCHED_TOKEN_ABI = [{
  type: "function",
  name: "getLaunchedToken",
  stateMutability: "view",
  inputs: [{ name: "token", type: "address" }],
  outputs: [{
    name: "launch",
    type: "tuple",
    components: [
      { name: "token", type: "address" },
      { name: "curve", type: "address" },
      { name: "deployer", type: "address" },
      { name: "creatorFeeRecipient", type: "address" },
      { name: "pairToken", type: "address" },
      { name: "graduationThreshold", type: "uint256" },
      { name: "poolFee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "creatorTaxBps", type: "uint16" },
      { name: "buybackEnabled", type: "bool" },
      { name: "phase", type: "uint8" },
      { name: "sweptQuote", type: "uint256" },
      { name: "sweptTokens", type: "uint256" },
      { name: "sweptAt", type: "uint256" },
      { name: "exists", type: "bool" }
    ]
  }]
}] as const;

export type LiveState = "live" | "not_indexed" | "not_available" | "integration_not_verified";

export type PadRecord = {
  parentToken: string;
  owner: string;
  configVersion: string;
  depth: number;
  ponsRoot: boolean;
  active: boolean;
  txHash: string;
  blockNumber: string;
};

