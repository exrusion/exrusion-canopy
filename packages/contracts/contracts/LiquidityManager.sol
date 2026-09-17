// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract LiquidityManager is AccessControl {
    using SafeERC20 for IERC20;
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");

    mapping(address market => mapping(address token => uint256 amount)) public cumulativeLiquidityFees;

    event LiquidityFeeAdded(address indexed market, address indexed token, uint256 amount);

    constructor(address admin) {
        if (admin == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function addToMarket(address market, address token, uint256 amount) external onlyRole(ROUTER_ROLE) {
        if (market == address(0) || token == address(0) || amount == 0) revert InvalidInput();
        IERC20(token).safeTransferFrom(msg.sender, market, amount);
        cumulativeLiquidityFees[market][token] += amount;
        emit LiquidityFeeAdded(market, token, amount);
    }

    error InvalidAddress();
    error InvalidInput();
}

