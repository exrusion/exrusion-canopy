// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract RewardDistributor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");
    bytes32 public constant PUBLISHER_ROLE = keccak256("PUBLISHER_ROLE");

    struct Epoch {
        address beneficiaryToken;
        address rewardToken;
        bytes32 merkleRoot;
        uint256 totalReward;
        uint256 snapshotBlock;
        uint256 holderCount;
        bytes32 allocationHash;
        bool exists;
    }

    uint256 public nextEpochId = 1;
    mapping(address beneficiaryToken => mapping(address rewardToken => uint256 amount)) public availableRewards;
    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event RewardDeposited(address indexed beneficiaryToken, address indexed rewardToken, uint256 amount);
    event EpochPublished(
        uint256 indexed epochId,
        address indexed beneficiaryToken,
        address indexed rewardToken,
        bytes32 merkleRoot,
        uint256 totalReward,
        uint256 snapshotBlock,
        uint256 holderCount,
        bytes32 allocationHash
    );
    event Claimed(uint256 indexed epochId, address indexed account, uint256 amount);

    constructor(address admin, address publisher) {
        if (admin == address(0) || publisher == address(0)) revert InvalidAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PUBLISHER_ROLE, publisher);
    }

    function depositReward(address beneficiaryToken, address rewardToken, uint256 amount) external onlyRole(ROUTER_ROLE) {
        if (beneficiaryToken == address(0) || rewardToken == address(0) || amount == 0) revert InvalidInput();
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), amount);
        availableRewards[beneficiaryToken][rewardToken] += amount;
        emit RewardDeposited(beneficiaryToken, rewardToken, amount);
    }

    function publishEpoch(
        address beneficiaryToken,
        address rewardToken,
        bytes32 merkleRoot,
        uint256 totalReward,
        uint256 snapshotBlock,
        uint256 holderCount,
        bytes32 allocationHash
    ) external onlyRole(PUBLISHER_ROLE) returns (uint256 epochId) {
        if (merkleRoot == bytes32(0) || totalReward == 0 || holderCount == 0) revert InvalidInput();
        uint256 available = availableRewards[beneficiaryToken][rewardToken];
        if (totalReward > available) revert InsufficientRewards();
        availableRewards[beneficiaryToken][rewardToken] = available - totalReward;
        epochId = nextEpochId++;
        epochs[epochId] = Epoch({
            beneficiaryToken: beneficiaryToken,
            rewardToken: rewardToken,
            merkleRoot: merkleRoot,
            totalReward: totalReward,
            snapshotBlock: snapshotBlock,
            holderCount: holderCount,
            allocationHash: allocationHash,
            exists: true
        });
        emit EpochPublished(
            epochId,
            beneficiaryToken,
            rewardToken,
            merkleRoot,
            totalReward,
            snapshotBlock,
            holderCount,
            allocationHash
        );
    }

    function claim(uint256 epochId, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        Epoch memory epoch = epochs[epochId];
        if (!epoch.exists) revert UnknownEpoch();
        if (claimed[epochId][msg.sender]) revert AlreadyClaimed();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(epochId, msg.sender, amount))));
        if (!MerkleProof.verify(proof, epoch.merkleRoot, leaf)) revert InvalidProof();
        claimed[epochId][msg.sender] = true;
        IERC20(epoch.rewardToken).safeTransfer(msg.sender, amount);
        emit Claimed(epochId, msg.sender, amount);
    }

    error InvalidAddress();
    error InvalidInput();
    error InsufficientRewards();
    error UnknownEpoch();
    error AlreadyClaimed();
    error InvalidProof();
}

