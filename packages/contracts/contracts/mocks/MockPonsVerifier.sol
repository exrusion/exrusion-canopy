// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPonsLaunchVerifier} from "../interfaces/ICanopy.sol";

contract MockPonsVerifier is IPonsLaunchVerifier {
    mapping(address => address) public deployers;

    function setLaunch(address token, address deployer) external {
        deployers[token] = deployer;
    }

    function isPonsToken(address token) external view returns (bool) {
        return deployers[token] != address(0);
    }

    function deployerOf(address token) external view returns (address) {
        return deployers[token];
    }
}

