// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IEmergencyPauseController {
    function paused() external view returns (bool);
}

interface IPonsLaunchVerifier {
    function isPonsToken(address token) external view returns (bool);
    function deployerOf(address token) external view returns (address);
}

interface IConfigVersionRegistry {
    struct FeeConfig {
        uint16 tradingFeeBps;
        uint16 creatorBps;
        uint16 parentHoldersBps;
        uint16 burnBps;
        uint16 liquidityBps;
        uint16 ancestorBps;
        uint16 padOwnerBps;
        uint16 protocolBps;
        uint8 ancestorLevels;
        uint16 ancestorDecayBps;
    }

    function getConfig(uint64 version) external view returns (FeeConfig memory);
    function isActive(uint64 version) external view returns (bool);
}

interface INestedPadRegistry {
    struct Pad {
        address parentToken;
        address owner;
        uint64 configVersion;
        uint8 depth;
        bool active;
        bool ponsRoot;
    }

    function getPad(address parentToken) external view returns (Pad memory);
    function parentOf(address token) external view returns (address);
    function creatorOf(address token) external view returns (address);
    function marketOf(address token) external view returns (address);
    function isMarket(address market) external view returns (bool);
    function registerChild(address parentToken, address childToken, address market, address creator) external;
}

interface IRewardDistributor {
    function depositReward(address beneficiaryToken, address rewardToken, uint256 amount) external;
}

interface ILiquidityManager {
    function addToMarket(address market, address token, uint256 amount) external;
}

interface IFeeRouter {
    function routeFee(address childToken, address feeToken, uint256 amount) external;
}

interface IChildMarket {
    function quoteToken() external view returns (address);
    function childToken() external view returns (address);
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient, uint256 deadline) external returns (uint256);
    function previewBuy(uint256 quoteIn) external view returns (uint256);
}

