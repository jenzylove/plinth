// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {FloorMath} from "../src/lib/FloorMath.sol";

/// The contract math must match packages/core/src/cppi.ts. Expected values come from running the
/// TypeScript functions with the same inputs.
contract FloorMathTest is Test {
    uint256 constant Y = 365 days;

    function _near(uint256 got, uint256 wantMilli) internal pure {
        // wantMilli is the TS result x 1e9; allow 1e-9 relative error.
        uint256 want = wantMilli * 1e9;
        assertApproxEqRel(got, want, 1e9);
    }

    function test_floorValueMatchesTs() public pure {
        _near(FloorMath.floorValue(1000e18, 0.035e18, Y), 966_183574879);
        _near(FloorMath.floorValue(1000e18, 0.0324e18, Y / 2), 984_183323974);
        _near(FloorMath.floorValue(950e18, 0.05e18, Y / 12), 946_145286984);
        _near(FloorMath.floorValue(1000e18, 0.1e18, 3 * Y), 751_314800902);
    }

    function test_floorIsPromiseAtMaturityOrWithNoRate() public pure {
        assertEq(FloorMath.floorValue(1000e18, 0.035e18, 0), 1000e18);
        assertEq(FloorMath.floorValue(1000e18, 0, Y), 1000e18);
    }

    function test_startingExposureMatchesTs() public pure {
        uint256 floor_ = FloorMath.floorValue(1000e18, 0.035e18, Y);
        _near(FloorMath.targetStock(1000e18, floor_, 4.1e18), 138_647342995);
    }

    function test_targetNeverAboveTotal() public pure {
        assertEq(FloorMath.targetStock(1000e18, 900e18, 20e18), 1000e18);
    }

    function test_decide() public pure {
        (int256 d, FloorMath.Reason r) = FloorMath.decide(100e18, 105e18, 0.1e18, 1e18);
        assertEq(uint8(r), uint8(FloorMath.Reason.WithinBand));
        assertEq(d, 0);
        (d, r) = FloorMath.decide(100e18, 150e18, 0.1e18, 1e18);
        assertEq(uint8(r), uint8(FloorMath.Reason.Drift));
        assertEq(d, 50e18);
        (d, r) = FloorMath.decide(100e18, 0, 0.1e18, 1e18);
        assertEq(uint8(r), uint8(FloorMath.Reason.CushionGone));
        assertEq(d, -100e18);
        (d, r) = FloorMath.decide(0, 0.5e18, 0.1e18, 1e18);
        assertEq(uint8(r), uint8(FloorMath.Reason.BelowMinTrade));
    }

    function test_breakDistance() public pure {
        // 1000 total, floor 900, 400 in stock: a 25% drop in the stock leaves exactly the floor.
        assertEq(FloorMath.breakDistance(400e18, 1000e18, 900e18), 0.25e18);
        assertEq(FloorMath.breakDistance(0, 1000e18, 900e18), type(uint256).max);
    }

    /// CPPI's promise: if the stock drops by less than 1/m between rebalances, the vault stays above the floor.
    function testFuzz_dropSmallerThanOneOverMKeepsFloor(uint256 total, uint256 floorBps, uint256 m, uint256 dropBps)
        public
        pure
    {
        total = bound(total, 10e18, 1e24);
        floorBps = bound(floorBps, 5000, 9999);
        m = bound(m, 1e18, 6e18);
        uint256 floor_ = total * floorBps / 10_000;
        uint256 stock = FloorMath.targetStock(total, floor_, m);
        uint256 maxDropBps = 10_000 * 1e18 / m;
        dropBps = bound(dropBps, 0, maxDropBps > 10_000 ? 10_000 : maxDropBps);
        uint256 loss = stock * dropBps / 10_000;
        assertGe(total - loss + 1, floor_);
    }
}
