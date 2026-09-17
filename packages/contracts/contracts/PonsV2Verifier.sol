// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPonsLaunchVerifier} from "./interfaces/ICanopy.sol";

interface IPonsV2Factory {
    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        uint8 phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory launched);
}

contract PonsV2Verifier is IPonsLaunchVerifier {
    address public immutable factory;

    constructor(address factory_) {
        if (factory_ == address(0)) revert InvalidFactory();
        factory = factory_;
    }

    function isPonsToken(address token) external view returns (bool) {
        try IPonsV2Factory(factory).getLaunchedToken(token) returns (IPonsV2Factory.LaunchedToken memory launch) {
            return launch.exists && launch.token == token && launch.deployer != address(0) && launch.curve != address(0);
        } catch {
            return false;
        }
    }

    function deployerOf(address token) external view returns (address) {
        IPonsV2Factory.LaunchedToken memory launch = IPonsV2Factory(factory).getLaunchedToken(token);
        if (!launch.exists || launch.token != token) return address(0);
        return launch.deployer;
    }

    error InvalidFactory();
}
