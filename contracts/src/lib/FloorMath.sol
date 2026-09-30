// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FixedPointMathLib as FPM} from "solady/utils/FixedPointMathLib.sol";

/// CPPI math. Mirrors packages/core/src/cppi.ts. Amounts are USD with 18 decimals, rates and
/// multipliers are WAD fractions (1e18 = 1).
library FloorMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant YEAR = 365 days;

    /// Value today of `promised` paid in `secondsLeft`, discounted at `rate` compounded yearly.
    function floorValue(uint256 promised, uint256 rate, uint256 secondsLeft) internal pure returns (uint256) {
        if (secondsLeft == 0 || rate == 0) return promised;
        int256 years_ = int256(FPM.divWad(secondsLeft, YEAR));
        uint256 growth = uint256(FPM.powWad(int256(WAD + rate), years_));
        return FPM.mulDiv(promised, WAD, growth);
    }

    /// How much the vault can lose before it touches the floor. Never negative.
    function cushion(uint256 total, uint256 floor_) internal pure returns (uint256) {
        return total > floor_ ? total - floor_ : 0;
    }

    /// multiplier x cushion, never more than the whole vault (no leverage).
    function targetStock(uint256 total, uint256 floor_, uint256 multiplier) internal pure returns (uint256) {
        return FPM.min(total, FPM.mulWad(multiplier, cushion(total, floor_)));
    }

    /// The single instant drop in the stock (WAD fraction) that would push the vault to the floor.
    /// type(uint256).max when nothing is held in stock.
    function breakDistance(uint256 stock, uint256 total, uint256 floor_) internal pure returns (uint256) {
        if (stock == 0) return type(uint256).max;
        return FPM.divWad(cushion(total, floor_), stock);
    }

    enum Reason {
        WithinBand,
        Drift,
        CushionGone,
        BelowMinTrade
    }

    /// Trade only when the stock leg drifts more than `band` from target, or when the cushion is gone.
    /// Returns the signed trade size: positive buys stock, negative sells it.
    function decide(uint256 stock, uint256 target, uint256 band, uint256 minTrade)
        internal
        pure
        returns (int256 delta, Reason reason)
    {
        if (target == 0 && stock > 0) return (-int256(stock), Reason.CushionGone);
        int256 d = int256(target) - int256(stock);
        uint256 absd = d >= 0 ? uint256(d) : uint256(-d);
        if (absd < minTrade) return (0, Reason.BelowMinTrade);
        if (FPM.divWad(absd, target) <= band) return (0, Reason.WithinBand);
        return (d, Reason.Drift);
    }
}
