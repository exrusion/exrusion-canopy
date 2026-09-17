// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IEmergencyPauseController,
    IFeeRouter,
    IConfigVersionRegistry
} from "./interfaces/ICanopy.sol";

contract ChildMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;

    address public immutable quoteToken;
    address public immutable childToken;
    address public immutable creator;
    uint16 public immutable tradingFeeBps;
    IFeeRouter public immutable feeRouter;
    IEmergencyPauseController public immutable pauseController;

    event Buy(
        address indexed buyer,
        address indexed recipient,
        uint256 quoteIn,
        uint256 tokensOut,
        uint256 fee
    );
    event Sell(
        address indexed seller,
        address indexed recipient,
        uint256 tokensIn,
        uint256 quoteOut,
        uint256 fee
    );

    constructor(
        address quoteToken_,
        address childToken_,
        address creator_,
        uint64 configVersion,
        address configRegistry_,
        address feeRouter_,
        address pauseController_
    ) {
        if (
            quoteToken_ == address(0) || childToken_ == address(0) || creator_ == address(0)
                || configRegistry_ == address(0) || feeRouter_ == address(0) || pauseController_ == address(0)
        ) revert InvalidAddress();
        quoteToken = quoteToken_;
        childToken = childToken_;
        creator = creator_;
        tradingFeeBps = IConfigVersionRegistry(configRegistry_).getConfig(configVersion).tradingFeeBps;
        feeRouter = IFeeRouter(feeRouter_);
        pauseController = IEmergencyPauseController(pauseController_);
    }

    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient, uint256 deadline)
        external
        nonReentrant
        returns (uint256 tokensOut)
    {
        _validateTrade(recipient, deadline);
        uint256 quoteReserve = IERC20(quoteToken).balanceOf(address(this));
        uint256 tokenReserve = IERC20(childToken).balanceOf(address(this));
        _pullExact(IERC20(quoteToken), msg.sender, quoteIn);

        uint256 fee = quoteIn * tradingFeeBps / BPS;
        uint256 netIn = quoteIn - fee;
        tokensOut = _amountOut(netIn, quoteReserve, tokenReserve);
        if (tokensOut == 0 || tokensOut < minTokensOut) revert SlippageExceeded();

        IERC20(childToken).safeTransfer(recipient, tokensOut);
        if (fee > 0) {
            IERC20(quoteToken).safeTransfer(address(feeRouter), fee);
            feeRouter.routeFee(childToken, quoteToken, fee);
        }
        emit Buy(msg.sender, recipient, quoteIn, tokensOut, fee);
    }

    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient, uint256 deadline)
        external
        nonReentrant
        returns (uint256 quoteOut)
    {
        _validateTrade(recipient, deadline);
        uint256 quoteReserve = IERC20(quoteToken).balanceOf(address(this));
        uint256 tokenReserve = IERC20(childToken).balanceOf(address(this));
        _pullExact(IERC20(childToken), msg.sender, tokensIn);

        uint256 grossOut = _amountOut(tokensIn, tokenReserve, quoteReserve);
        uint256 fee = grossOut * tradingFeeBps / BPS;
        quoteOut = grossOut - fee;
        if (quoteOut == 0 || quoteOut < minQuoteOut) revert SlippageExceeded();

        if (fee > 0) IERC20(quoteToken).safeTransfer(address(feeRouter), fee);
        IERC20(quoteToken).safeTransfer(recipient, quoteOut);
        if (fee > 0) feeRouter.routeFee(childToken, quoteToken, fee);
        emit Sell(msg.sender, recipient, tokensIn, quoteOut, fee);
    }

    function previewBuy(uint256 quoteIn) external view returns (uint256) {
        uint256 fee = quoteIn * tradingFeeBps / BPS;
        return _amountOut(
            quoteIn - fee,
            IERC20(quoteToken).balanceOf(address(this)),
            IERC20(childToken).balanceOf(address(this))
        );
    }

    function previewSell(uint256 tokensIn) external view returns (uint256) {
        uint256 gross = _amountOut(
            tokensIn,
            IERC20(childToken).balanceOf(address(this)),
            IERC20(quoteToken).balanceOf(address(this))
        );
        return gross - (gross * tradingFeeBps / BPS);
    }

    function reserves() external view returns (uint256 quoteReserve, uint256 tokenReserve) {
        return (IERC20(quoteToken).balanceOf(address(this)), IERC20(childToken).balanceOf(address(this)));
    }

    function _validateTrade(address recipient, uint256 deadline) internal view {
        if (pauseController.paused()) revert ProtocolPaused();
        if (recipient == address(0)) revert InvalidAddress();
        if (block.timestamp > deadline) revert DeadlineExpired();
    }

    function _pullExact(IERC20 token, address from, uint256 amount) internal {
        if (amount == 0) revert InvalidAmount();
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedToken();
    }

    function _amountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) return 0;
        return amountIn * reserveOut / (reserveIn + amountIn);
    }

    error InvalidAddress();
    error ProtocolPaused();
    error DeadlineExpired();
    error InvalidAmount();
    error UnsupportedToken();
    error SlippageExceeded();
}

