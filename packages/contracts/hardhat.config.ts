import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import type { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 500 },
      viaIR: true
    }
  },
  networks: {
    hardhat: { chainId: 31337 },
    robinhoodTestnet: {
      chainId: 46630,
      url: process.env.RPC_HTTP_URL ?? "https://rpc.testnet.chain.robinhood.com",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []
    }
  }
};

export default config;

