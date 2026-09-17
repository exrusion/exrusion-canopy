// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ChildToken is ERC20 {
    address public immutable creator;
    address public immutable parentToken;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        address creator_,
        address parentToken_,
        address initialHolder
    ) ERC20(name_, symbol_) {
        if (creator_ == address(0) || parentToken_ == address(0) || initialHolder == address(0)) revert InvalidAddress();
        creator = creator_;
        parentToken = parentToken_;
        _mint(initialHolder, supply_);
    }

    error InvalidAddress();
}

