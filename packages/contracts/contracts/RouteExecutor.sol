// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IChildMarket,
    IEmergencyPauseController,
    INestedPadRegistry
} from "./interfaces/ICanopy.sol";

contract RouteExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant MAX_HOPS = 4;

    INestedPadRegistry public immutable registry;
    IEmergencyPauseController public immutable pauseController;

    event RouteExecuted(
        address indexed sender,
        address indexed recipient,
        address indexed inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 hops
    );

    constructor(address registry_, address pauseController_) {
        if (registry_ == address(0) || pauseController_ == address(0)) revert InvalidAddress();
        registry = INestedPadRegistry(registry_);
        pauseController = IEmergencyPauseController(pauseController_);
    }

    function buyRoute(
        address[] calldata markets,
        uint256 amountIn,
        uint256[] calldata minOutputs,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        if (pauseController.paused()) revert ProtocolPaused();
        if (
            markets.length == 0 || markets.length > MAX_HOPS || markets.length != minOutputs.length
                || recipient == address(0) || amountIn == 0
        ) revert InvalidRoute();
        if (block.timestamp > deadline) revert DeadlineExpired();

        address inputToken = IChildMarket(markets[0]).quoteToken();
        _pullExact(IERC20(inputToken), msg.sender, amountIn);
        address currentToken = inputToken;
        amountOut = amountIn;

        for (uint256 i; i < markets.length; i++) {
            address market = markets[i];
            if (!registry.isMarket(market) || IChildMarket(market).quoteToken() != currentToken) revert InvalidRoute();
            IERC20(currentToken).forceApprove(market, amountOut);
            address hopRecipient = i + 1 == markets.length ? recipient : address(this);
            amountOut = IChildMarket(market).buy(amountOut, minOutputs[i], hopRecipient, deadline);
            currentToken = IChildMarket(market).childToken();
        }

        emit RouteExecuted(msg.sender, recipient, inputToken, currentToken, amountIn, amountOut, markets.length);
    }

    function _pullExact(IERC20 token, address from, uint256 amount) internal {
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedToken();
    }

    error InvalidAddress();
    error ProtocolPaused();
    error InvalidRoute();
    error DeadlineExpired();
    error UnsupportedToken();
}

