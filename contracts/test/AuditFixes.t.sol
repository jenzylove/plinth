// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {PlinthFactory} from "../src/PlinthFactory.sol";
import {PlinthVault} from "../src/PlinthVault.sol";
import {IResilientOracle, IVToken, IPancakeV3Router} from "../src/interfaces/External.sol";
import {BscConfig as C} from "../script/BscConfig.sol";

/// Regressions for the second audit (2026-10-04). Each test asserts the corrected behaviour on a fork of BSC
/// mainnet. Needs BSC_ARCHIVE_RPC_URL.
contract AuditFixesTest is Test {
    uint256 constant FORK_BLOCK = 124_954_313;

    PlinthFactory factory;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address saver = makeAddr("saver");
    address stranger = makeAddr("stranger");
    uint256 nvdaId;
    uint256 qqqId;

    function setUp() public {
        vm.createSelectFork(vm.envString("BSC_ARCHIVE_RPC_URL"), FORK_BLOCK);
        factory = new PlinthFactory(
            owner, C.USDT, IResilientOracle(C.VENUS_ORACLE), C.markets(), C.gate(), 0.06e18, 365 days, keeper,
            C.VENUS_BLOCKS_PER_YEAR, 1e18, 1e18
        );
        vm.startPrank(owner);
        nvdaId = factory.addStock(C.nvda(4.1e18));
        qqqId = factory.addStock(C.qqq(6e18));
        vm.stopPrank();
    }

    function _open(uint256 stockId, uint256 bps, uint256 amount) internal returns (PlinthVault v) {
        deal(C.USDT, saver, amount);
        vm.startPrank(saver);
        IERC20(C.USDT).approve(address(factory), amount);
        v = PlinthVault(factory.open(stockId, bps, amount));
        vm.stopPrank();
    }

    function _usdt(address a) internal view returns (uint256) {
        return IERC20(C.USDT).balanceOf(a);
    }

    // ------------------------------------------------------------ H1

    /// A refused top-up must not hide the position the vault already holds in the market.
    function test_H1_refusedSupplyKeepsTrackingExistingPosition() public {
        PlinthVault v = _open(nvdaId, 10_000, 1000e18);
        uint256 receipts = IERC20(C.VENUS_VUSDT).balanceOf(address(v));
        assertGt(receipts, 0);
        deal(C.USDT, stranger, 10e18);
        vm.prank(stranger);
        IERC20(C.USDT).transfer(address(v), 10e18);
        // Venus refuses every new mint from here on.
        vm.mockCall(C.VENUS_VUSDT, abi.encodeWithSelector(IVToken.mint.selector), abi.encode(uint256(1)));

        v.pullOutIfUnhealthy();
        assertEq(v.marketIndex(), 1, "still tracks Venus");
        assertEq(IERC20(C.VENUS_VUSDT).balanceOf(address(v)), receipts, "receipts untouched");
        PlinthVault.Status memory s = v.status();
        assertApproxEqRel(s.total, 1010e18, 0.003e18, "value counts the position and the idle top-up");

        vm.clearMockedCalls();
        uint256 before = _usdt(saver);
        vm.prank(saver);
        v.withdraw(1e18);
        assertApproxEqRel(_usdt(saver) - before, 1010e18, 0.003e18, "saver gets it all back");
        assertEq(IERC20(C.VENUS_VUSDT).balanceOf(address(v)), 0, "nothing left behind");
    }

    // ------------------------------------------------------------ H2

    /// A lending market that fails its gate AND will not redeem must not stop the vault selling stock.
    function test_H2_blockedRedemptionStillLetsTheVaultSellStock() public {
        PlinthVault v = _open(nvdaId, 10_000, 1000e18);
        uint256 receipts = IERC20(C.VENUS_VUSDT).balanceOf(address(v));
        assertGt(IERC20(C.NVDA).balanceOf(address(v)), 0);
        // Venus: utilization far over the gate, and redemptions refused.
        vm.mockCall(C.VENUS_VUSDT, abi.encodeWithSelector(IVToken.totalBorrows.selector), abi.encode(1e40));
        vm.mockCall(C.VENUS_VUSDT, abi.encodeWithSelector(IVToken.redeem.selector), abi.encode(uint256(1)));
        vm.prank(keeper);
        v.setMultiplier(0);

        vm.prank(stranger);
        v.rebalance();
        assertEq(IERC20(C.NVDA).balanceOf(address(v)), 0, "stock sold despite the frozen market");
        assertTrue(v.impaired(), "marked impaired");
        assertEq(v.marketIndex(), 1, "position still tracked");
        assertEq(IERC20(C.VENUS_VUSDT).balanceOf(address(v)), receipts, "receipts kept");
        assertGt(v.status().total, 990e18, "value intact");

        // Redemptions come back: the next call leaves the market and clears the flag.
        vm.clearMockedCalls();
        vm.mockCall(C.VENUS_VUSDT, abi.encodeWithSelector(IVToken.totalBorrows.selector), abi.encode(1e40));
        v.pullOutIfUnhealthy();
        assertFalse(v.impaired());
        assertEq(IERC20(C.VENUS_VUSDT).balanceOf(address(v)), 0, "left Venus");
    }

    // ------------------------------------------------------------ H5

    /// A cap cut binds on the next rebalance anyone calls, with the keeper offline.
    function test_H5_capCutBindsWithoutTheKeeper() public {
        PlinthVault v = _open(nvdaId, 10_000, 1000e18);
        assertGt(IERC20(C.NVDA).balanceOf(address(v)), 0);
        vm.prank(owner);
        factory.setCap(nvdaId, 0);
        assertEq(v.effectiveMultiplier(), 0);
        assertEq(v.status().target, 0);
        vm.prank(stranger);
        v.rebalance();
        assertEq(IERC20(C.NVDA).balanceOf(address(v)), 0, "exposure follows the cap");
    }

    // ------------------------------------------------------------ M1

    /// USDT sent above the principal cap is held aside: never invested, paid back on withdraw, exits never locked.
    function test_M1_transferAboveCapIsHeldAsideAndReturned() public {
        PlinthVault v = _open(nvdaId, 10_000, 1000e18);
        deal(C.USDT, stranger, 60_000e18);
        vm.prank(stranger);
        IERC20(C.USDT).transfer(address(v), 60_000e18);
        v.sync();
        assertEq(v.deposited(), 50_000e18, "principal stops at the cap");
        assertEq(v.excess(), 11_000e18, "the rest is held aside");
        assertLt(v.status().total, 51_000e18, "held-aside USDT is not in the strategy");

        uint256 before = _usdt(saver);
        vm.prank(saver);
        v.withdraw(1e18);
        assertApproxEqRel(_usdt(saver) - before, 61_000e18, 0.002e18, "everything comes back");
        assertEq(v.excess(), 0);
    }

    // ------------------------------------------------------------ M2 + M6

    /// A full exit bigger than one trade goes through a staged exit in chunks; Traded events show the real sizes.
    function test_M2_M6_stagedExitInChunksWithExecutedAmounts() public {
        PlinthVault v = _open(qqqId, 9_000, 50_000e18);
        for (uint256 k; k < 6; k++) {
            vm.warp(vm.getBlockTimestamp() + 60);
            vm.roll(vm.getBlockNumber() + 130);
            v.rebalance();
        }
        assertGt(v.status().stockUsd, 30_000e18);

        vm.prank(saver);
        vm.expectRevert(PlinthVault.UseStagedExit.selector);
        v.withdraw(1e18);

        vm.prank(saver);
        v.beginExit();
        bytes32 traded = keccak256("Traded(bool,uint256,uint256)");
        uint256 sells;
        for (uint256 k; k < 8 && IERC20(C.QQQ).balanceOf(address(v)) > 0; k++) {
            vm.warp(vm.getBlockTimestamp() + 60);
            vm.roll(vm.getBlockNumber() + 130);
            vm.recordLogs();
            v.rebalance();
            Vm.Log[] memory logs = vm.getRecordedLogs();
            for (uint256 i; i < logs.length; i++) {
                if (logs[i].topics[0] != traded) continue;
                (bool buy, uint256 usdtAmount,) = abi.decode(logs[i].data, (bool, uint256, uint256));
                assertFalse(buy);
                assertLe(usdtAmount, 10_100e18, "an executed sell is at most one chunk");
                sells++;
            }
        }
        assertGt(sells, 2, "several chunks");
        assertEq(IERC20(C.QQQ).balanceOf(address(v)), 0, "all stock sold");

        uint256 before = _usdt(saver);
        vm.prank(saver);
        v.withdraw(1e18);
        assertGt(_usdt(saver) - before, 49_000e18, "full exit");
    }

    // ------------------------------------------------------------ M5

    function _swap(address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256 out) {
        address w = makeAddr("dipper");
        deal(tokenIn, w, amountIn);
        vm.startPrank(w);
        IERC20(tokenIn).approve(C.PCS_ROUTER, amountIn);
        out = IPancakeV3Router(C.PCS_ROUTER).exactInputSingle(
            IPancakeV3Router.ExactInputSingleParams(tokenIn, tokenOut, 100, w, block.timestamp, amountIn, 0, 0)
        );
        vm.stopPrank();
    }

    /// QQQB falls ~10% for `secs` seconds, recovers, and one second later anyone rebalances. Under v2's
    /// min(slow, fast) rule this sold $0 / $49.77 / $95.14 / $95.14 of a $188 stock leg for 5 / 30 / 60 / 120 second
    /// holes (measured 2026-10-04). v3 requires the live price to confirm the fall.
    function _dip(uint256 secs) internal returns (uint256 soldUsd) {
        uint256 snap = vm.snapshotState();
        PlinthVault v = _open(qqqId, 10_000, 1000e18);
        uint256 before = v.status().stockUsd;
        uint256 got = _swap(C.QQQ, C.USDT, 500e18);
        vm.warp(vm.getBlockTimestamp() + secs);
        vm.roll(vm.getBlockNumber() + secs * 2 + 1);
        _swap(C.USDT, C.QQQ, got);
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.roll(vm.getBlockNumber() + 2);
        uint256 bal = IERC20(C.QQQ).balanceOf(address(v));
        try v.rebalance() {} catch {}
        uint256 sold = bal - IERC20(C.QQQ).balanceOf(address(v));
        soldUsd = sold * v.status().price / 1e18;
        emit log_named_uint(string.concat("dip seconds ", vm.toString(secs), ", stock before $"), before / 1e18);
        emit log_named_uint(string.concat("dip seconds ", vm.toString(secs), ", sold $ (cents)"), soldUsd / 1e16);
        vm.revertToState(snap);
    }

    function test_M5_shortDownsidePrints() public {
        uint256 s5 = _dip(5);
        uint256 s30 = _dip(30);
        uint256 s60 = _dip(60);
        uint256 s120 = _dip(120);
        // The live pool price must confirm a fall, so a hole that has recovered sells nothing, however long it lasted.
        assertEq(s5, 0, "5-second hole");
        assertEq(s30, 0, "30-second hole");
        assertEq(s60, 0, "60-second hole");
        // A 2-minute hole moves the 10-minute average (~2% here), and the vault never values above that slow
        // reference (which is what stops it chasing spikes), so it trims a little: $20.58 of $188 measured, against
        // $95.14 under v2.
        assertLt(s120, 30e18, "2-minute hole: a small trim only");
    }
}
