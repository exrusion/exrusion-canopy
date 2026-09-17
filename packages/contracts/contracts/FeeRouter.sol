// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IConfigVersionRegistry,
    IEmergencyPauseController,
    ILiquidityManager,
    INestedPadRegistry,
    IRewardDistributor
} from "./interfaces/ICanopy.sol";

contract FeeRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

    INestedPadRegistry public immutable registry;
    IConfigVersionRegistry public immutable configRegistry;
    IRewardDistributor public immutable rewardDistributor;
    ILiquidityManager public immutable liquidityManager;
    IEmergencyPauseController public immutable pauseController;
    address public immutable protocolTreasury;

    mapping(address recipient => mapping(address token => uint256 amount)) public claimable;

    event FeeRouted(
        address indexed childToken,
        address indexed feeToken,
        uint256 amount,
        uint256 creatorAmount,
        uint256 parentHolderAmount,
        uint256 ancestorAmount,
        uint256 burnAmount,
        uint256 liquidityAmount,
        uint256 padOwnerAmount,
        uint256 protocolAmount
    );
    event Claimed(address indexed recipient, address indexed token, uint256 amount);

    constructor(
        address registry_,
        address configs_,
        address rewards_,
        address liquidity_,
        address pauseController_,
        address protocolTreasury_
    ) {
        if (
            registry_ == address(0) || configs_ == address(0) || rewards_ == address(0)
                || liquidity_ == address(0) || pauseController_ == address(0) || protocolTreasury_ == address(0)
        ) revert InvalidAddress();
        registry = INestedPadRegistry(registry_);
        configRegistry = IConfigVersionRegistry(configs_);
        rewardDistributor = IRewardDistributor(rewards_);
        liquidityManager = ILiquidityManager(liquidity_);
        pauseController = IEmergencyPauseController(pauseController_);
        protocolTreasury = protocolTreasury_;
    }

    function routeFee(address childToken, address feeToken, uint256 amount) external nonReentrant {
        if (pauseController.paused()) revert ProtocolPaused();
        if (!registry.isMarket(msg.sender) || registry.marketOf(childToken) != msg.sender) revert UnauthorizedMarket();
        address parentToken = registry.parentOf(childToken);
        if (parentToken == address(0) || feeToken != parentToken || amount == 0) revert InvalidFee();

        INestedPadRegistry.Pad memory pad = registry.getPad(parentToken);
        IConfigVersionRegistry.FeeConfig memory config = configRegistry.getConfig(pad.configVersion);

        uint256 creatorAmount = amount * config.creatorBps / BPS;
        uint256 parentHolderAmount = amount * config.parentHoldersBps / BPS;
        uint256 burnAmount = amount * config.burnBps / BPS;
        uint256 liquidityAmount = amount * config.liquidityBps / BPS;
        uint256 ancestorAmount = amount * config.ancestorBps / BPS;
        uint256 padOwnerAmount = amount * config.padOwnerBps / BPS;
        uint256 protocolAmount = amount * config.protocolBps / BPS;

        uint256 allocated = creatorAmount + parentHolderAmount + burnAmount + liquidityAmount + ancestorAmount
            + padOwnerAmount + protocolAmount;
        protocolAmount += amount - allocated;

        claimable[registry.creatorOf(childToken)][feeToken] += creatorAmount;
        claimable[pad.owner][feeToken] += padOwnerAmount;
        claimable[protocolTreasury][feeToken] += protocolAmount;

        if (burnAmount > 0) IERC20(feeToken).safeTransfer(BURN_ADDRESS, burnAmount);
        if (liquidityAmount > 0) {
            IERC20(feeToken).forceApprove(address(liquidityManager), liquidityAmount);
            liquidityManager.addToMarket(msg.sender, feeToken, liquidityAmount);
        }

        uint256 routedAncestor = _routeAncestors(
            parentToken,
            feeToken,
            ancestorAmount,
            config.ancestorLevels,
            config.ancestorDecayBps
        );
        parentHolderAmount += ancestorAmount - routedAncestor;
        if (parentHolderAmount > 0) _depositReward(parentToken, feeToken, parentHolderAmount);

        emit FeeRouted(
            childToken,
            feeToken,
            amount,
            creatorAmount,
            parentHolderAmount,
            routedAncestor,
            burnAmount,
            liquidityAmount,
            padOwnerAmount,
            protocolAmount
        );
    }

    function claim(address token) external nonReentrant {
        uint256 amount = claimable[msg.sender][token];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, token, amount);
    }

    function _routeAncestors(
        address parentToken,
        address rewardToken,
        uint256 amount,
        uint8 maxLevels,
        uint16 decayBps
    ) internal returns (uint256 routed) {
        if (amount == 0 || maxLevels == 0) return 0;

        address[3] memory ancestors;
        uint256[3] memory weights;
        uint256 count;
        uint256 totalWeight;
        address cursor = registry.parentOf(parentToken);
        uint256 weight = BPS;
        while (cursor != address(0) && count < maxLevels && count < 3) {
            ancestors[count] = cursor;
            weights[count] = weight;
            totalWeight += weight;
            cursor = registry.parentOf(cursor);
            weight = weight * decayBps / BPS;
            count++;
            if (weight == 0) break;
        }
        if (count == 0 || totalWeight == 0) return 0;

        for (uint256 i; i < count; i++) {
            uint256 share = i + 1 == count ? amount - routed : amount * weights[i] / totalWeight;
            if (share > 0) {
                _depositReward(ancestors[i], rewardToken, share);
                routed += share;
            }
        }
    }

    function _depositReward(address beneficiaryToken, address rewardToken, uint256 amount) internal {
        IERC20(rewardToken).forceApprove(address(rewardDistributor), amount);
        rewardDistributor.depositReward(beneficiaryToken, rewardToken, amount);
    }

    error InvalidAddress();
    error ProtocolPaused();
    error UnauthorizedMarket();
    error InvalidFee();
    error NothingToClaim();
}

