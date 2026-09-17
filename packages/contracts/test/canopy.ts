// @ts-nocheck -- Hardhat runtime contracts are intentionally used without generated TypeChain wrappers.
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Canopy protocol", function () {
  async function deployFixture() {
    const [admin, creator, trader, publisher, treasury, other] = await ethers.getSigners();

    const Parent = await ethers.getContractFactory("MockERC20");
    const parent = await Parent.deploy("Root", "ROOT");
    await parent.mint(creator.address, ethers.parseEther("100000"));
    await parent.mint(trader.address, ethers.parseEther("100000"));

    const Verifier = await ethers.getContractFactory("MockPonsVerifier");
    const verifier = await Verifier.deploy();
    await verifier.setLaunch(await parent.getAddress(), creator.address);

    const Pause = await ethers.getContractFactory("EmergencyPauseController");
    const pause = await Pause.deploy(admin.address, admin.address);

    const Configs = await ethers.getContractFactory("ConfigVersionRegistry");
    const configs = await Configs.deploy(admin.address);
    const config = {
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
    await configs.publish(config);

    const Registry = await ethers.getContractFactory("NestedPadRegistry");
    const registry = await Registry.deploy(
      admin.address,
      await verifier.getAddress(),
      await configs.getAddress(),
      await pause.getAddress()
    );

    const Rewards = await ethers.getContractFactory("RewardDistributor");
    const rewards = await Rewards.deploy(admin.address, publisher.address);

    const Liquidity = await ethers.getContractFactory("LiquidityManager");
    const liquidity = await Liquidity.deploy(admin.address);

    const Router = await ethers.getContractFactory("FeeRouter");
    const router = await Router.deploy(
      await registry.getAddress(),
      await configs.getAddress(),
      await rewards.getAddress(),
      await liquidity.getAddress(),
      await pause.getAddress(),
      treasury.address
    );

    const Factory = await ethers.getContractFactory("ChildTokenFactory");
    const factory = await Factory.deploy(
      await registry.getAddress(),
      await configs.getAddress(),
      await router.getAddress(),
      await pause.getAddress()
    );

    await registry.grantRole(await registry.FACTORY_ROLE(), await factory.getAddress());
    await rewards.grantRole(await rewards.ROUTER_ROLE(), await router.getAddress());
    await liquidity.grantRole(await liquidity.ROUTER_ROLE(), await router.getAddress());

    await registry.connect(creator).openPad(await parent.getAddress(), 1);
    await parent.connect(creator).approve(await factory.getAddress(), ethers.parseEther("10000"));
    const launchTx = await factory.connect(creator).launchChild(
      await parent.getAddress(),
      "Cat",
      "CAT",
      ethers.parseEther("1000000000"),
      ethers.parseEther("10000"),
      "ipfs://cat"
    );
    const receipt = await launchTx.wait();
    const parsed = receipt!.logs
      .map((log) => { try { return factory.interface.parseLog(log); } catch { return null; } })
      .find((log) => log?.name === "ChildLaunched")!;
    const childAddress = parsed.args.childToken as string;
    const marketAddress = parsed.args.market as string;
    const child = await ethers.getContractAt("ChildToken", childAddress);
    const market = await ethers.getContractAt("ChildMarket", marketAddress);

    return {
      admin, creator, trader, publisher, treasury, other,
      parent, verifier, pause, configs, registry, rewards, liquidity, router, factory, child, market, config
    };
  }

  it("accepts only the verified pons deployer as root pad owner", async function () {
    const { registry, parent, other } = await deployFixture();
    const Second = await ethers.getContractFactory("MockERC20");
    const unverified = await Second.deploy("Nope", "NOPE");
    await expect(registry.connect(other).openPad(await unverified.getAddress(), 1)).to.be.revertedWithCustomError(
      registry,
      "UnverifiedParent"
    );
    expect((await registry.getPad(await parent.getAddress())).ponsRoot).to.equal(true);
  });

  it("executes a real child buy and accounts for the complete fee", async function () {
    const { trader, parent, child, market, rewards, router, creator, treasury, liquidity } = await deployFixture();
    const quoteIn = ethers.parseEther("100");
    await parent.connect(trader).approve(await market.getAddress(), quoteIn);
    await market.connect(trader).buy(quoteIn, 1, trader.address, (await ethers.provider.getBlock("latest"))!.timestamp + 60);

    expect(await child.balanceOf(trader.address)).to.be.gt(0);
    expect(await rewards.availableRewards(await parent.getAddress(), await parent.getAddress())).to.be.gt(0);
    expect(await router.claimable(creator.address, await parent.getAddress())).to.be.gt(0);
    expect(await router.claimable(treasury.address, await parent.getAddress())).to.be.gt(0);
    expect(await parent.balanceOf("0x000000000000000000000000000000000000dEaD")).to.be.gt(0);
    expect(await liquidity.cumulativeLiquidityFees(await market.getAddress(), await parent.getAddress())).to.be.gt(0);
  });

  it("supports sell-side slippage protection", async function () {
    const { trader, parent, child, market } = await deployFixture();
    const quoteIn = ethers.parseEther("100");
    await parent.connect(trader).approve(await market.getAddress(), quoteIn);
    await market.connect(trader).buy(quoteIn, 1, trader.address, (await ethers.provider.getBlock("latest"))!.timestamp + 60);
    const balance = await child.balanceOf(trader.address);
    await child.connect(trader).approve(await market.getAddress(), balance);
    await expect(
      market.connect(trader).sell(balance, ethers.parseEther("1000000"), trader.address, (await ethers.provider.getBlock("latest"))!.timestamp + 60)
    ).to.be.revertedWithCustomError(market, "SlippageExceeded");
  });

  it("opens a child token as its own pad and executes an atomic two-hop route", async function () {
    const { creator, trader, parent, child, market, registry, factory, pause } = await deployFixture();
    const creatorBuy = ethers.parseEther("500");
    await parent.connect(creator).approve(await market.getAddress(), creatorBuy);
    await market.connect(creator).buy(creatorBuy, 1, creator.address, (await ethers.provider.getBlock("latest"))!.timestamp + 60);

    await registry.connect(creator).openPad(await child.getAddress(), 1);
    const seed = (await child.balanceOf(creator.address)) / 2n;
    await child.connect(creator).approve(await factory.getAddress(), seed);
    const tx = await factory.connect(creator).launchChild(
      await child.getAddress(), "Paw", "PAW", ethers.parseEther("1000000000"), seed, "ipfs://paw"
    );
    const receipt = await tx.wait();
    const parsed = receipt!.logs
      .map((log) => { try { return factory.interface.parseLog(log); } catch { return null; } })
      .find((log) => log?.name === "ChildLaunched")!;
    const secondMarketAddress = parsed.args.market as string;
    const grandchildAddress = parsed.args.childToken as string;

    const Executor = await ethers.getContractFactory("RouteExecutor");
    const executor = await Executor.deploy(await registry.getAddress(), await pause.getAddress());
    const amountIn = ethers.parseEther("50");
    await parent.connect(trader).approve(await executor.getAddress(), amountIn);
    await executor.connect(trader).buyRoute(
      [await market.getAddress(), secondMarketAddress],
      amountIn,
      [1, 1],
      trader.address,
      (await ethers.provider.getBlock("latest"))!.timestamp + 60
    );
    const grandchild = await ethers.getContractAt("ChildToken", grandchildAddress);
    expect(await grandchild.balanceOf(trader.address)).to.be.gt(0);
  });

  it("publishes and claims a Merkle reward epoch without duplicate claims", async function () {
    const { trader, parent, market, rewards, publisher } = await deployFixture();
    const quoteIn = ethers.parseEther("100");
    await parent.connect(trader).approve(await market.getAddress(), quoteIn);
    await market.connect(trader).buy(quoteIn, 1, trader.address, (await ethers.provider.getBlock("latest"))!.timestamp + 60);

    const amount = (await rewards.availableRewards(await parent.getAddress(), await parent.getAddress())) / 2n;
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const inner = ethers.keccak256(coder.encode(["uint256", "address", "uint256"], [1, trader.address, amount]));
    const leaf = ethers.keccak256(inner);
    await rewards.connect(publisher).publishEpoch(
      await parent.getAddress(),
      await parent.getAddress(),
      leaf,
      amount,
      await ethers.provider.getBlockNumber(),
      1,
      ethers.keccak256(ethers.toUtf8Bytes("allocation-file"))
    );
    await rewards.connect(trader).claim(1, amount, []);
    await expect(rewards.connect(trader).claim(1, amount, [])).to.be.revertedWithCustomError(rewards, "AlreadyClaimed");
  });

  it("rejects invalid fee totals and blocks trades while paused", async function () {
    const { admin, configs, pause, trader, parent, market } = await deployFixture();
    await expect(configs.publish({
      tradingFeeBps: 100,
      creatorBps: 100,
      parentHoldersBps: 100,
      burnBps: 100,
      liquidityBps: 100,
      ancestorBps: 100,
      padOwnerBps: 100,
      protocolBps: 100,
      ancestorLevels: 1,
      ancestorDecayBps: 5000
    })).to.be.revertedWithCustomError(configs, "InvalidAllocationTotal");

    await pause.connect(admin).setPaused(true);
    await parent.connect(trader).approve(await market.getAddress(), ethers.parseEther("1"));
    await expect(
      market.connect(trader).buy(ethers.parseEther("1"), 1, trader.address, (await ethers.provider.getBlock("latest"))!.timestamp + 60)
    ).to.be.revertedWithCustomError(market, "ProtocolPaused");
  });
});
