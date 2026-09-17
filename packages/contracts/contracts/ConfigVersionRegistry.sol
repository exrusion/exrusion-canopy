// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IConfigVersionRegistry} from "./interfaces/ICanopy.sol";

contract ConfigVersionRegistry is AccessControl, IConfigVersionRegistry {
    bytes32 public constant CONFIG_ADMIN_ROLE = keccak256("CONFIG_ADMIN_ROLE");
    uint16 public constant BPS = 10_000;
    uint16 public constant MIN_TRADE_FEE_BPS = 10;
    uint16 public constant MAX_TRADE_FEE_BPS = 1_000;

    uint64 public latestVersion;
    mapping(uint64 => FeeConfig) private _configs;
    mapping(uint64 => bool) public override isActive;

    event ConfigPublished(uint64 indexed version, bytes32 indexed configHash);
    event ConfigStatusChanged(uint64 indexed version, bool active);

    constructor(address admin) {
        if (admin == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONFIG_ADMIN_ROLE, admin);
    }

    function publish(FeeConfig calldata config) external onlyRole(CONFIG_ADMIN_ROLE) returns (uint64 version) {
        _validate(config);
        version = ++latestVersion;
        _configs[version] = config;
        isActive[version] = true;
        emit ConfigPublished(version, keccak256(abi.encode(config)));
    }

    function setActive(uint64 version, bool active) external onlyRole(CONFIG_ADMIN_ROLE) {
        if (version == 0 || version > latestVersion) revert UnknownConfig();
        isActive[version] = active;
        emit ConfigStatusChanged(version, active);
    }

    function getConfig(uint64 version) external view override returns (FeeConfig memory) {
        if (version == 0 || version > latestVersion) revert UnknownConfig();
        return _configs[version];
    }

    function _validate(FeeConfig calldata config) internal pure {
        if (config.tradingFeeBps < MIN_TRADE_FEE_BPS || config.tradingFeeBps > MAX_TRADE_FEE_BPS) {
            revert InvalidTradingFee();
        }
        uint256 total = uint256(config.creatorBps) + config.parentHoldersBps + config.burnBps
            + config.liquidityBps + config.ancestorBps + config.padOwnerBps + config.protocolBps;
        if (total != BPS) revert InvalidAllocationTotal(total);
        if (config.ancestorLevels > 3) revert InvalidAncestorDepth();
        if (config.ancestorBps > 0 && (config.ancestorLevels == 0 || config.ancestorDecayBps > BPS)) {
            revert InvalidAncestorConfig();
        }
    }

    error InvalidAddress();
    error UnknownConfig();
    error InvalidTradingFee();
    error InvalidAllocationTotal(uint256 total);
    error InvalidAncestorDepth();
    error InvalidAncestorConfig();
}

