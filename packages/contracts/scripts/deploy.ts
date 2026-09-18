// @ts-nocheck -- deployment artifacts are consumed from Hardhat's runtime contract wrappers.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ethers, network } from "hardhat";

const MAINNET_CONFIRMATION = "DEPLOY_CANOPY_TO_ROBINHOOD_MAINNET_4663";

function requiredAddress(name: string) {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) throw new Error(`${name} must be an explicitly configured address`);
  return value;
}

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const isMainnet = chainId === 4663 && network.name === "robinhoodMainnet";
  const isTestnet = chainId === 46630 && network.name === "robinhoodTestnet";
  if (!isMainnet && !isTestnet) {
    throw new Error(`Refusing deployment on unsupported network ${network.name}/${chainId}`);
  }
  if (isMainnet && process.env.CONFIRM_MAINNET_DEPLOYMENT !== MAINNET_CONFIRMATION) {
    throw new Error(`Set CONFIRM_MAINNET_DEPLOYMENT=${MAINNET_CONFIRMATION} to authorize the irreversible mainnet deployment`);
  }

  const ponsFactory = requiredAddress("PONS_V2_FACTORY");
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is not configured");

  const admin = isMainnet ? requiredAddress("ADMIN_ADDRESS") : process.env.ADMIN_ADDRESS ?? deployer.address;
  const pauser = isMainnet ? requiredAddress("PAUSER_ADDRESS") : process.env.PAUSER_ADDRESS ?? admin;
  const publisher = isMainnet ? requiredAddress("PUBLISHER_ADDRESS") : process.env.PUBLISHER_ADDRESS ?? admin;
  const treasury = isMainnet ? requiredAddress("PROTOCOL_TREASURY") : process.env.PROTOCOL_TREASURY ?? admin;
  const anchorer = isMainnet ? requiredAddress("ANCHORER_ADDRESS") : process.env.ANCHORER_ADDRESS ?? publisher;

  let deploymentBlock: number | null = null;
  async function deploy(name: string, args: unknown[]) {
    const factory = await ethers.getContractFactory(name);
    const contract = await factory.deploy(...args);
    const receipt = await contract.deploymentTransaction()?.wait();
    await contract.waitForDeployment();
    deploymentBlock ??= receipt?.blockNumber ?? null;
    console.log(`${name}: ${await contract.getAddress()}`);
    return contract;
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  if (balance === 0n) throw new Error(`Deployer ${deployer.address} has no native gas balance`);
  console.log(`Deploying from ${deployer.address} with ${ethers.formatEther(balance)} ETH`);

  const pause = await deploy("EmergencyPauseController", [admin, pauser]);
  const configs = await deploy("ConfigVersionRegistry", [admin]);
  const verifier = await deploy("PonsV2Verifier", [ponsFactory]);
  const registry = await deploy("NestedPadRegistry", [admin, await verifier.getAddress(), await configs.getAddress(), await pause.getAddress()]);
  const rewards = await deploy("RewardDistributor", [admin, publisher]);
  const liquidity = await deploy("LiquidityManager", [admin]);
  const feeRouter = await deploy("FeeRouter", [
    await registry.getAddress(), await configs.getAddress(), await rewards.getAddress(),
    await liquidity.getAddress(), await pause.getAddress(), treasury
  ]);
  const childFactory = await deploy("ChildTokenFactory", [await registry.getAddress(), await configs.getAddress(), await feeRouter.getAddress(), await pause.getAddress()]);
  const routeExecutor = await deploy("RouteExecutor", [await registry.getAddress(), await pause.getAddress()]);
  const ledgerAnchor = await deploy("LedgerAnchor", [admin, anchorer]);

  const defaultConfig = {
    tradingFeeBps: 100,
    creatorBps: 2000,
    parentHoldersBps: 3000,
    burnBps: 1000,
    liquidityBps: 1000,
    ancestorBps: 1000,
    padOwnerBps: 500,
    protocolBps: 1500,
    ancestorLevels: 3,
    ancestorDecayBps: 5000
  };
  await (await configs.publish(defaultConfig)).wait();
  await (await registry.grantRole(await registry.FACTORY_ROLE(), await childFactory.getAddress())).wait();
  await (await rewards.grantRole(await rewards.ROUTER_ROLE(), await feeRouter.getAddress())).wait();
  await (await liquidity.grantRole(await liquidity.ROUTER_ROLE(), await feeRouter.getAddress())).wait();

  const deployment = {
    network: network.name,
    chainId,
    deploymentBlock,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    roles: { admin, pauser, publisher, treasury, anchorer },
    external: { ponsV2Factory: ponsFactory },
    contracts: {
      emergencyPauseController: await pause.getAddress(),
      configVersionRegistry: await configs.getAddress(),
      ponsV2Verifier: await verifier.getAddress(),
      nestedPadRegistry: await registry.getAddress(),
      rewardDistributor: await rewards.getAddress(),
      liquidityManager: await liquidity.getAddress(),
      feeRouter: await feeRouter.getAddress(),
      childTokenFactory: await childFactory.getAddress(),
      routeExecutor: await routeExecutor.getAddress(),
      ledgerAnchor: await ledgerAnchor.getAddress()
    },
    defaultConfig
  };
  const outDir = resolve("deployments");
  await mkdir(outDir, { recursive: true });
  const output = resolve(outDir, chainId === 4663 ? "robinhood-mainnet.json" : "robinhood-testnet.json");
  await writeFile(output, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`Deployment manifest: ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
