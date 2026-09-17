// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ChildToken} from "./ChildToken.sol";
import {ChildMarket} from "./ChildMarket.sol";
import {
    IEmergencyPauseController,
    INestedPadRegistry
} from "./interfaces/ICanopy.sol";

contract ChildTokenFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    INestedPadRegistry public immutable registry;
    IEmergencyPauseController public immutable pauseController;
    address public immutable configRegistry;
    address public immutable feeRouter;

    mapping(address token => string uri) public metadataUri;

    event ChildLaunched(
        address indexed parentToken,
        address indexed childToken,
        address indexed market,
        address creator,
        uint256 supply,
        uint256 initialQuoteSeed,
        uint64 configVersion,
        string metadataUri
    );

    constructor(address registry_, address configs_, address feeRouter_, address pauseController_) {
        if (
            registry_ == address(0) || configs_ == address(0) || feeRouter_ == address(0)
                || pauseController_ == address(0)
        ) revert InvalidAddress();
        registry = INestedPadRegistry(registry_);
        configRegistry = configs_;
        feeRouter = feeRouter_;
        pauseController = IEmergencyPauseController(pauseController_);
    }

    function launchChild(
        address parentToken,
        string calldata name,
        string calldata symbol,
        uint256 supply,
        uint256 initialQuoteSeed,
        string calldata metadataUri_
    ) external nonReentrant returns (address childToken, address market) {
        if (pauseController.paused()) revert ProtocolPaused();
        INestedPadRegistry.Pad memory pad = registry.getPad(parentToken);
        if (!pad.active) revert PadNotActive();
        if (supply == 0 || initialQuoteSeed == 0) revert InvalidAmount();

        ChildToken token = new ChildToken(name, symbol, supply, msg.sender, parentToken, address(this));
        ChildMarket childMarket = new ChildMarket(
            parentToken,
            address(token),
            msg.sender,
            pad.configVersion,
            configRegistry,
            feeRouter,
            address(pauseController)
        );
        childToken = address(token);
        market = address(childMarket);

        IERC20(childToken).safeTransfer(market, supply);
        uint256 beforeBalance = IERC20(parentToken).balanceOf(market);
        IERC20(parentToken).safeTransferFrom(msg.sender, market, initialQuoteSeed);
        if (IERC20(parentToken).balanceOf(market) - beforeBalance != initialQuoteSeed) revert UnsupportedToken();

        metadataUri[childToken] = metadataUri_;
        registry.registerChild(parentToken, childToken, market, msg.sender);
        emit ChildLaunched(
            parentToken,
            childToken,
            market,
            msg.sender,
            supply,
            initialQuoteSeed,
            pad.configVersion,
            metadataUri_
        );
    }

    error InvalidAddress();
    error ProtocolPaused();
    error PadNotActive();
    error InvalidAmount();
    error UnsupportedToken();
}

