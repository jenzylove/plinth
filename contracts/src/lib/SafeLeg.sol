// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IVToken, IVenusComptroller, IResilientOracle, IAavePool} from "../interfaces/External.sol";
import {Market, MarketKind, GateLimits} from "./Types.sol";

/// The safe leg: USDT lent to Venus core or Aave v3, behind a health gate. Runs in the vault's context.
library SafeLeg {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;

    // Health gate results. Zero means healthy.
    uint8 internal constant OK = 0;
    uint8 internal constant PAUSED = 1;
    uint8 internal constant LOW_CASH = 2;
    uint8 internal constant HIGH_UTILIZATION = 3;
    uint8 internal constant PEG_OR_FEED = 4;

    // Venus comptroller actions.
    uint8 internal constant VENUS_MINT = 0;
    uint8 internal constant VENUS_REDEEM = 1;

    /// USDT the vault has lent into `m`.
    function position(Market memory m) internal view returns (uint256) {
        if (m.kind == MarketKind.Venus) {
            IVToken v = IVToken(m.target);
            return v.balanceOf(address(this)) * v.exchangeRateStored() / WAD;
        }
        if (m.kind == MarketKind.Aave) return IERC20(m.receipt).balanceOf(address(this));
        return 0;
    }

    /// Current supply APR of `m` as a WAD fraction. Used as the floor's discount rate (APR <= APY, so
    /// this never overstates what the safe leg earns).
    function rate(Market memory m, address usdt, uint256 venusBlocksPerYear) internal view returns (uint256) {
        if (m.kind == MarketKind.Venus) return IVToken(m.target).supplyRatePerBlock() * venusBlocksPerYear;
        if (m.kind == MarketKind.Aave) {
            return uint256(IAavePool(m.target).getReserveData(usdt).currentLiquidityRate) / 1e9;
        }
        return 0;
    }

    /// Health gate. `size` is the USDT the vault has, or would have, in the market.
    function check(Market memory m, address usdt, IResilientOracle oracle, GateLimits memory g, uint256 size)
        internal
        view
        returns (uint8)
    {
        uint256 cash;
        uint256 borrows;
        if (m.kind == MarketKind.Venus) {
            IVToken v = IVToken(m.target);
            IVenusComptroller c = IVenusComptroller(v.comptroller());
            if (c.actionPaused(m.target, VENUS_MINT) || c.actionPaused(m.target, VENUS_REDEEM)) return PAUSED;
            cash = v.getCash();
            borrows = v.totalBorrows();
            uint256 reserves = v.totalReserves();
            uint256 supplied = cash + borrows > reserves ? cash + borrows - reserves : 0;
            if (supplied > 0 && borrows * WAD / supplied > g.maxUtilization) return HIGH_UTILIZATION;
        } else if (m.kind == MarketKind.Aave) {
            uint256 cfg = IAavePool(m.target).getReserveData(usdt).configuration;
            bool active = (cfg >> 56) & 1 == 1;
            bool frozen = (cfg >> 57) & 1 == 1;
            bool paused = (cfg >> 60) & 1 == 1;
            if (!active || frozen || paused) return PAUSED;
            cash = IERC20(usdt).balanceOf(m.receipt);
            borrows = IERC20(m.debt).totalSupply();
            if (cash + borrows > 0 && borrows * WAD / (cash + borrows) > g.maxUtilization) {
                return HIGH_UTILIZATION;
            }
        } else {
            return OK; // holding plain USDT has no market to fail
        }
        if (cash < size * g.minCashMultiple) return LOW_CASH;
        try oracle.getPrice(usdt) returns (uint256 p) {
            uint256 dev = p > WAD ? p - WAD : WAD - p;
            if (dev > g.maxPegDeviation) return PEG_OR_FEED;
        } catch {
            return PEG_OR_FEED;
        }
        return OK;
    }

    /// Lend `amount` USDT into `m`. Returns false (and keeps the USDT) if the market refuses it.
    function supply(Market memory m, address usdt, uint256 amount) internal returns (bool) {
        if (amount == 0 || m.kind == MarketKind.None) return true;
        IERC20(usdt).forceApprove(m.target, amount);
        bool ok;
        if (m.kind == MarketKind.Venus) {
            try IVToken(m.target).mint(amount) returns (uint256 err) {
                ok = err == 0;
            } catch {}
        } else {
            try IAavePool(m.target).supply(usdt, amount, address(this), 0) {
                ok = true;
            } catch {}
        }
        IERC20(usdt).forceApprove(m.target, 0);
        return ok;
    }

    /// Take `amount` USDT out of `m` (type(uint256).max: everything). Reverts if the market refuses.
    function redeem(Market memory m, address usdt, uint256 amount) internal {
        if (amount == 0 || m.kind == MarketKind.None) return;
        if (m.kind == MarketKind.Venus) {
            IVToken v = IVToken(m.target);
            uint256 err = amount == type(uint256).max
                ? v.redeem(v.balanceOf(address(this)))
                : v.redeemUnderlying(amount);
            require(err == 0, "venus redeem");
        } else {
            IAavePool(m.target).withdraw(usdt, amount, address(this));
        }
    }

    /// Like redeem, but returns false instead of reverting when the market refuses (paused, out of cash).
    function tryRedeem(Market memory m, address usdt, uint256 amount) internal returns (bool ok) {
        if (amount == 0 || m.kind == MarketKind.None) return true;
        if (m.kind == MarketKind.Venus) {
            IVToken v = IVToken(m.target);
            if (amount == type(uint256).max) {
                uint256 bal = v.balanceOf(address(this));
                if (bal == 0) return true;
                try v.redeem(bal) returns (uint256 err) {
                    ok = err == 0;
                } catch {}
            } else {
                try v.redeemUnderlying(amount) returns (uint256 err) {
                    ok = err == 0;
                } catch {}
            }
        } else {
            if (amount == type(uint256).max && IERC20(m.receipt).balanceOf(address(this)) == 0) return true;
            try IAavePool(m.target).withdraw(usdt, amount, address(this)) returns (uint256) {
                ok = true;
            } catch {}
        }
    }

    /// Bring Venus interest up to date so position() is exact.
    function accrue(Market memory m) internal {
        if (m.kind == MarketKind.Venus) IVToken(m.target).accrueInterest();
    }
}
