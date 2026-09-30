// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {FixedPointMathLib as FPM} from "solady/utils/FixedPointMathLib.sol";
import {IResilientOracle, IUniV3Pool, IPancakeV3Router, IUniV3Router02} from "../interfaces/External.sol";
import {StockConfig} from "./Types.sol";

/// The stock leg: a reference price that a single trade cannot move, and swaps that refuse to fill
/// worse than that price minus the allowed slippage. Runs in the vault's context.
library StockLeg {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    int256 internal constant LN_TICK_BASE = 99995000333308; // ln(1.0001) in WAD

    /// USDT per bStock, WAD. Venus's oracle when the stock has a Venus feed, otherwise the pool's
    /// time-weighted average price over `twapWindow` seconds.
    function refPrice(StockConfig memory s, address usdt, IResilientOracle oracle) internal view returns (uint256) {
        if (s.venusPriced) return oracle.getPrice(s.token);
        return twap(s, usdt);
    }

    function twap(StockConfig memory s, address usdt) internal view returns (uint256) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = s.twapWindow;
        (int56[] memory cum,) = IUniV3Pool(s.pool).observe(ago);
        int256 avgTick = int256(cum[1] - cum[0]) / int256(uint256(s.twapWindow));
        // Price of token1 in token0 is 1.0001^tick. Both tokens have 18 decimals.
        bool stockIsToken0 = IUniV3Pool(s.pool).token0() == s.token;
        require(stockIsToken0 || IUniV3Pool(s.pool).token0() == usdt, "pool pair");
        int256 exponent = (stockIsToken0 ? avgTick : -avgTick) * LN_TICK_BASE;
        return uint256(FPM.expWad(exponent));
    }

    /// Swap exactly `amountIn` of `tokenIn`. Reverts if it returns less than `minOut`.
    function swap(StockConfig memory s, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        internal
        returns (uint256 out)
    {
        IERC20(tokenIn).forceApprove(s.router, amountIn);
        if (s.pancake) {
            out = IPancakeV3Router(s.router).exactInputSingle(
                IPancakeV3Router.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: s.fee,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: amountIn,
                    amountOutMinimum: minOut,
                    sqrtPriceLimitX96: 0
                })
            );
        } else {
            out = IUniV3Router02(s.router).exactInputSingle(
                IUniV3Router02.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: s.fee,
                    recipient: address(this),
                    amountIn: amountIn,
                    amountOutMinimum: minOut,
                    sqrtPriceLimitX96: 0
                })
            );
        }
        IERC20(tokenIn).forceApprove(s.router, 0);
    }

    /// Spend `usd` USDT on the stock at no worse than the reference price minus slippage.
    function buy(StockConfig memory s, address usdt, uint256 usd, uint256 price) internal returns (uint256) {
        uint256 minOut = FPM.mulDiv(FPM.divWad(usd, price), WAD - s.maxSlippage, WAD);
        return swap(s, usdt, s.token, usd, minOut);
    }

    /// Sell `tokens` of the stock for at least their reference value minus slippage.
    function sell(StockConfig memory s, address usdt, uint256 tokens, uint256 price) internal returns (uint256) {
        uint256 minOut = FPM.mulDiv(FPM.mulWad(tokens, price), WAD - s.maxSlippage, WAD);
        return swap(s, s.token, usdt, tokens, minOut);
    }
}
