// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract LedgerAnchor is AccessControl {
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

    struct LedgerEpoch {
        bytes32 merkleRoot;
        uint64 minute;
        uint32 eventCount;
        bool exists;
    }

    mapping(uint64 => LedgerEpoch) public epochs;

    event LedgerEpochAnchored(uint64 indexed minute, bytes32 indexed merkleRoot, uint32 eventCount);

    constructor(address admin, address anchorer) {
        if (admin == address(0) || anchorer == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ANCHOR_ROLE, anchorer);
    }

    function anchor(uint64 minute, bytes32 merkleRoot, uint32 eventCount) external onlyRole(ANCHOR_ROLE) {
        if (merkleRoot == bytes32(0) || eventCount == 0) revert InvalidEpoch();
        if (epochs[minute].exists) revert DuplicateEpoch();
        epochs[minute] = LedgerEpoch(merkleRoot, minute, eventCount, true);
        emit LedgerEpochAnchored(minute, merkleRoot, eventCount);
    }

    error InvalidAddress();
    error InvalidEpoch();
    error DuplicateEpoch();
}

