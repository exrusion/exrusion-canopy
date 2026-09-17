// @ts-nocheck -- deployment artifacts are consumed from Hardhat's runtime contract wrappers.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ethers, network } from "hardhat";

async function deploy(name: string, args: unknown[]) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  console.log(`${name}: ${await contract.getAddress()}`);
  return contract;
}

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== 46630 || network.name !== "robinhoodTestnet") {
    throw new Error(`Refusing deployment: expected Robinhood Chain testnet 46630, received ${network.name}/${chainId}`);
  }
  const ponsFactory = process.env.PONS_V2_FACTORY;
  if (!ponsFactory || !ethers.isAddress(ponsFactory)) {
    throw new Error("PONS_V2_FACTORY must be an official, independently verified testnet address");
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is not configured");
  const admin = process.env.ADMIN_ADDRESS ?? deployer.address;
  const pauser = process.env.PAUSER_ADDRESS ?? admin;
  const publisher = process.env.PUBLISHER_ADDRESS ?? admin;
  const treasury = process.env.PROTOCOL_TREASURY ?? admin;
  const anchorer = process.env.ANCHORER_ADDRESS ?? publisher;
  for (const [label, value] of Object.entries({ admin, pauser, publisher, treasury, anchorer })) {
    if (!ethers.isAddress(value)) throw new Error(`${label} is not a valid address`);
  }

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
  await writeFile(resolve(outDir, "robinhood-testnet.json"), `${JSON.stringify(deployment, null, 2)}\n`);
  console.log("Deployment manifest: deployments/robinhood-testnet.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
