// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {FixedPointMathLib as FPM} from "solady/utils/FixedPointMathLib.sol";
import {IResilientOracle, IUniV3Pool, IPancakeV3Router, IUniV3Router02} from "../interfaces/External.sol";
import {StockConfig} from "./Types.sol";

/// The stock leg: a price that a single trade cannot move, and swaps that refuse to fill worse than that
/// price minus the allowed slippage. Runs in the vault's context.
library StockLeg {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    int256 internal constant LN_TICK_BASE = 99995000333308; // ln(1.0001) in WAD

    /// The slow reference: Venus's oracle when the stock has a Venus feed, otherwise the pool's TWAP over
    /// `twapWindow` seconds. USDT per bStock, WAD.
    function refPrice(StockConfig memory s, address usdt, IResilientOracle oracle) internal view returns (uint256) {
        if (s.venusPriced) return oracle.getPrice(s.token);
        return twap(s, usdt, s.twapWindow);
    }

    /// The fast reference: the pool's TWAP over `fastWindow` seconds. It follows a crash within about a
    /// minute while still taking a minute of real trading to move. Falls back to the slow reference if the
    /// pool cannot answer.
    function fastPrice(StockConfig memory s, address usdt, uint256 slow) internal view returns (uint256) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = s.fastWindow;
        try IUniV3Pool(s.pool).observe(ago) returns (int56[] memory cum, uint160[] memory) {
            return _tickPrice(s, usdt, cum, s.fastWindow);
        } catch {
            return slow;
        }
    }

    /// The price the vault values and trades at: min(slow, max(fast, spot)).
    /// - A crash that lasts: the 60-second average and the live pool price both drop, so the vault marks itself
    ///   down within about a minute and its sells fill.
    /// - A hole that recovers: the live price is back, so max(fast, spot) is back and nothing is sold. (Fork test
    ///   test_M5_shortDownsidePrints measures 5 to 120 second holes.)
    /// - A spike: the slow reference stays lower, so the vault does not chase it with buys.
    /// - Pushing the pool up cannot lower the mark; it can only delay a sale, and any sale then fills at the pushed price.
    function mark(StockConfig memory s, address usdt, IResilientOracle oracle)
        internal
        view
        returns (uint256 price, uint256 slow, uint256 fast)
    {
        slow = refPrice(s, usdt, oracle);
        fast = fastPrice(s, usdt, slow);
        uint256 confirmed = FPM.max(fast, spotPrice(s, usdt));
        price = confirmed < slow ? confirmed : slow;
    }

    /// The pool's live price, USDT per bStock, WAD (both tokens have 18 decimals).
    function spotPrice(StockConfig memory s, address usdt) internal view returns (uint256) {
        (uint160 sqrtP,,,,,,) = IUniV3Pool(s.pool).slot0();
        uint256 p1per0 = FPM.fullMulDiv(FPM.fullMulDiv(sqrtP, sqrtP, 1 << 96), WAD, 1 << 96);
        if (IUniV3Pool(s.pool).token0() == s.token) return p1per0;
        require(IUniV3Pool(s.pool).token0() == usdt, "pool pair");
        return p1per0 == 0 ? type(uint256).max : FPM.fullMulDiv(WAD, WAD, p1per0);
    }

    function twap(StockConfig memory s, address usdt, uint32 window) internal view returns (uint256) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = window;
        (int56[] memory cum,) = IUniV3Pool(s.pool).observe(ago);
        return _tickPrice(s, usdt, cum, window);
    }

    function _tickPrice(StockConfig memory s, address usdt, int56[] memory cum, uint32 window)
        private
        view
        returns (uint256)
    {
        int256 delta = int256(cum[1] - cum[0]);
        int256 avgTick = delta / int256(uint256(window));
        // Round toward negative infinity, like Uniswap's OracleLibrary.
        if (delta < 0 && delta % int256(uint256(window)) != 0) avgTick--;
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
