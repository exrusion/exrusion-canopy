// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract EmergencyPauseController is AccessControl {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bool public paused;

    event PauseStateChanged(bool paused, address indexed caller);

    constructor(address admin, address pauser) {
        if (admin == address(0) || pauser == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, pauser);
    }

    function setPaused(bool next) external onlyRole(PAUSER_ROLE) {
        paused = next;
        emit PauseStateChanged(next, msg.sender);
    }

    error InvalidAddress();
}

