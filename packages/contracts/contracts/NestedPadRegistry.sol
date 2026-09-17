// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    IConfigVersionRegistry,
    IEmergencyPauseController,
    INestedPadRegistry,
    IPonsLaunchVerifier
} from "./interfaces/ICanopy.sol";

contract NestedPadRegistry is AccessControl, INestedPadRegistry {
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    uint8 public constant MAX_TREE_DEPTH = 16;

    IPonsLaunchVerifier public immutable ponsVerifier;
    IConfigVersionRegistry public immutable configRegistry;
    IEmergencyPauseController public immutable pauseController;

    mapping(address => Pad) private _pads;
    mapping(address => address) public override parentOf;
    mapping(address => address) public override creatorOf;
    mapping(address => address) public override marketOf;
    mapping(address => bool) private _markets;

    event PadOpened(
        address indexed parentToken,
        address indexed owner,
        uint64 indexed configVersion,
        uint8 depth,
        bool ponsRoot
    );
    event ChildRegistered(
        address indexed parentToken,
        address indexed childToken,
        address indexed market,
        address creator,
        uint8 depth
    );
    event PadStatusChanged(address indexed parentToken, bool active);

    constructor(address admin, address verifier, address configs, address pauseController_) {
        if (admin == address(0) || verifier == address(0) || configs == address(0) || pauseController_ == address(0)) {
            revert InvalidAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        ponsVerifier = IPonsLaunchVerifier(verifier);
        configRegistry = IConfigVersionRegistry(configs);
        pauseController = IEmergencyPauseController(pauseController_);
    }

    function openPad(address parentToken, uint64 configVersion) external {
        _requireNotPaused();
        if (parentToken == address(0)) revert InvalidAddress();
        if (_pads[parentToken].owner != address(0)) revert PadAlreadyExists();
        if (!configRegistry.isActive(configVersion)) revert InactiveConfig();

        bool ponsRoot = ponsVerifier.isPonsToken(parentToken);
        address expectedOwner;
        uint8 depth;
        if (ponsRoot) {
            expectedOwner = ponsVerifier.deployerOf(parentToken);
            depth = 0;
        } else {
            expectedOwner = creatorOf[parentToken];
            address parent = parentOf[parentToken];
            if (expectedOwner == address(0) || parent == address(0)) revert UnverifiedParent();
            depth = _pads[parent].depth + 1;
        }
        if (msg.sender != expectedOwner) revert NotParentCreator();
        if (depth >= MAX_TREE_DEPTH) revert TreeTooDeep();

        _pads[parentToken] = Pad({
            parentToken: parentToken,
            owner: msg.sender,
            configVersion: configVersion,
            depth: depth,
            active: true,
            ponsRoot: ponsRoot
        });
        emit PadOpened(parentToken, msg.sender, configVersion, depth, ponsRoot);
    }

    function registerChild(address parentToken, address childToken, address market, address creator)
        external
        override
        onlyRole(FACTORY_ROLE)
    {
        _requireNotPaused();
        Pad memory pad = _pads[parentToken];
        if (!pad.active) revert PadNotActive();
        if (childToken == address(0) || market == address(0) || creator == address(0)) revert InvalidAddress();
        if (parentOf[childToken] != address(0)) revert ChildAlreadyRegistered();
        uint8 childDepth = pad.depth + 1;
        if (childDepth > MAX_TREE_DEPTH) revert TreeTooDeep();
        parentOf[childToken] = parentToken;
        creatorOf[childToken] = creator;
        marketOf[childToken] = market;
        _markets[market] = true;
        emit ChildRegistered(parentToken, childToken, market, creator, childDepth);
    }

    function setPadActive(address parentToken, bool active) external {
        Pad storage pad = _pads[parentToken];
        if (msg.sender != pad.owner && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotPadOwner();
        pad.active = active;
        emit PadStatusChanged(parentToken, active);
    }

    function getPad(address parentToken) external view override returns (Pad memory) {
        return _pads[parentToken];
    }

    function isMarket(address market) external view override returns (bool) {
        return _markets[market];
    }

    function _requireNotPaused() internal view {
        if (pauseController.paused()) revert ProtocolPaused();
    }

    error InvalidAddress();
    error ProtocolPaused();
    error PadAlreadyExists();
    error InactiveConfig();
    error UnverifiedParent();
    error NotParentCreator();
    error TreeTooDeep();
    error PadNotActive();
    error ChildAlreadyRegistered();
    error NotPadOwner();
}

