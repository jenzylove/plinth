// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {PlinthFactory} from "../src/PlinthFactory.sol";
import {PlinthVault} from "../src/PlinthVault.sol";
import {IResilientOracle, IVToken, IPancakeV3Router} from "../src/interfaces/External.sol";
import {FloorMath} from "../src/lib/FloorMath.sol";
import {SafeLeg} from "../src/lib/SafeLeg.sol";
import {StockConfig} from "../src/lib/Types.sol";
import {BscConfig as C} from "../script/BscConfig.sol";

/// Runs against real BSC mainnet state (Venus, Aave, PancakeSwap, Uniswap, bStocks) at a pinned block.
/// Needs BSC_ARCHIVE_RPC_URL.
contract VaultForkTest is Test {
    uint256 constant FORK_BLOCK = 124_954_313; // 2026-09-30 18:11 UTC

    PlinthFactory factory;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address saver = makeAddr("saver");
    address stranger = makeAddr("stranger");
    uint256 nvdaId;
    uint256 qqqId;
    uint256 tslaId;

    function setUp() public {
        vm.createSelectFork(vm.envString("BSC_ARCHIVE_RPC_URL"), FORK_BLOCK);
        factory = new PlinthFactory(
            owner,
            C.USDT,
            IResilientOracle(C.VENUS_ORACLE),
            C.markets(),
            C.gate(),
            0.06e18,
            365 days,
            keeper,
            C.VENUS_BLOCKS_PER_YEAR,
            1e18,
            1e18
        );
        vm.startPrank(owner);
        nvdaId = factory.addStock(C.nvda(4.1e18));
        qqqId = factory.addStock(C.qqq(6e18));
        tslaId = factory.addStock(C.tsla(4e18));
        vm.stopPrank();
    }

    function _open(address who, uint256 stockId, uint256 bps, uint256 amount) internal returns (PlinthVault v) {
        deal(C.USDT, who, amount);
        vm.startPrank(who);
        IERC20(C.USDT).approve(address(factory), amount);
        v = PlinthVault(factory.open(stockId, bps, amount));
        vm.stopPrank();
    }

    function _usd(uint256 x) internal pure returns (string memory) {
        return vm.toString(x / 1e16); // cents
    }

    // ------------------------------------------------------------ opening

    function test_openPutsMoneyToWork() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        PlinthVault.Status memory s = v.status();

        assertEq(v.promised(), 1000e18, "promise");
        assertEq(s.marketIndex, 1, "safe leg picks Venus (higher rate today)");
        assertEq(s.gateCode, 0, "Venus passes the gate");
        assertGt(IERC20(C.VENUS_VUSDT).balanceOf(address(v)), 0, "holds vUSDT");
        assertGt(s.floorRate, 0.03e18);
        assertLt(s.floorRate, 0.035e18);
        // Stock leg sits at multiplier x cushion (within the band).
        assertApproxEqRel(s.stockUsd, s.target, 0.1e18, "stock at target");
        assertGt(s.stockUsd, 100e18);
        // Round-trip cost of opening is small: value is within 0.1% of the deposit.
        assertApproxEqRel(s.total, 1000e18, 0.001e18, "value");
        assertGt(s.total, s.floor, "above floor");
        emit log_named_string("NVDA: stock leg $ (cents)", _usd(s.stockUsd));
        emit log_named_string("NVDA: floor $ (cents)", _usd(s.floor));
        emit log_named_decimal_uint("NVDA: break distance", s.breakDistance, 18);
    }

    function test_openTwapPricedStock() public {
        PlinthVault v = _open(saver, qqqId, 10_000, 1000e18);
        PlinthVault.Status memory s = v.status();
        assertGt(s.stockUsd, 100e18, "QQQ bought");
        assertApproxEqRel(s.total, 1000e18, 0.001e18);
        emit log_named_decimal_uint("QQQ: TWAP price", s.price, 18);
    }

    function test_lowerFloorBuysMoreStock() public {
        PlinthVault a = _open(saver, nvdaId, 10_000, 1000e18);
        PlinthVault b = _open(saver, nvdaId, 9_000, 1000e18);
        assertGt(b.status().stockUsd, a.status().stockUsd * 3, "90% floor: several times the exposure");
    }

    // ------------------------------------------------------------ permissions

    function test_keeperCannotTakeFunds() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        vm.startPrank(keeper);
        vm.expectRevert(PlinthVault.NotSaver.selector);
        v.withdraw(1e18);
        vm.expectRevert(PlinthVault.NotSaver.selector);
        v.withdrawInKind(1e18, true);
        vm.expectRevert(PlinthVault.NotSaver.selector);
        v.roll();
        vm.stopPrank();
    }

    function test_keeperCannotRaiseMultiplierAboveCap() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        vm.prank(keeper);
        vm.expectRevert(PlinthVault.AboveCap.selector);
        v.setMultiplier(4.2e18);
        vm.prank(keeper);
        v.setMultiplier(3e18);
        assertEq(v.multiplier(), 3e18);
        vm.prank(stranger);
        vm.expectRevert(PlinthVault.NotKeeper.selector);
        v.setMultiplier(1e18);
    }

    function test_ownerCanLowerButNeverRaiseAnOpenVaultsCap() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        vm.prank(owner);
        factory.setCap(nvdaId, 6e18);
        assertEq(factory.liveCap(nvdaId), 4.1e18, "a raise is only queued");
        vm.expectRevert(PlinthFactory.TooEarly.selector);
        factory.applyCap(nvdaId);
        vm.warp(vm.getBlockTimestamp() + 1 days);
        factory.applyCap(nvdaId);
        assertEq(factory.liveCap(nvdaId), 6e18, "applies after the delay");
        assertEq(v.cap(), 4.1e18, "open vault keeps its cap");
        vm.prank(owner);
        factory.setCap(nvdaId, 2e18);
        assertEq(v.cap(), 2e18, "lowering applies");
        vm.prank(keeper);
        vm.expectRevert(PlinthVault.AboveCap.selector);
        v.setMultiplier(3e18);
    }

    function test_keeperCannotMoveToDisabledMarket() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        vm.prank(owner);
        factory.setMarketEnabled(2, false);
        vm.prank(keeper);
        vm.expectRevert(PlinthVault.MarketDisabled.selector);
        v.moveSafeLeg(2);
    }

    function test_keeperMovesSafeLegToAave() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        uint256 before = v.status().total;
        vm.prank(keeper);
        v.moveSafeLeg(2);
        assertEq(v.marketIndex(), 2);
        assertEq(IERC20(C.VENUS_VUSDT).balanceOf(address(v)), 0);
        assertGt(IERC20(C.AAVE_AUSDT).balanceOf(address(v)), 800e18);
        assertApproxEqRel(v.status().total, before, 0.0001e18);
    }

    // ------------------------------------------------------------ withdraw

    function test_withdrawAllReturnsTodaysValue() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        uint256 value = v.status().total;
        vm.prank(saver);
        v.withdraw(1e18);
        uint256 got = IERC20(C.USDT).balanceOf(saver);
        // Today's value minus the sell fee (0.05% pool) on the stock leg.
        assertApproxEqRel(got, value, 0.002e18, "got today's value");
        assertEq(IERC20(C.NVDA).balanceOf(address(v)), 0);
        assertEq(IERC20(C.VENUS_VUSDT).balanceOf(address(v)), 0);
        assertEq(IERC20(C.USDT).balanceOf(address(v)), 0);
        assertEq(v.promised(), 0);
        emit log_named_string("withdraw all: got $ (cents)", _usd(got));
    }

    function test_withdrawHalf() public {
        PlinthVault v = _open(saver, qqqId, 10_000, 1000e18);
        uint256 value = v.status().total;
        vm.prank(saver);
        v.withdraw(0.5e18);
        assertApproxEqRel(IERC20(C.USDT).balanceOf(saver), value / 2, 0.002e18);
        assertEq(v.promised(), 500e18);
        assertApproxEqRel(v.status().total, value / 2, 0.002e18);
    }

    function test_withdrawInKindNeedsNoPoolOrMarket() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        uint256 nvda = IERC20(C.NVDA).balanceOf(address(v));
        uint256 vusdt = IERC20(C.VENUS_VUSDT).balanceOf(address(v));
        vm.prank(saver);
        v.withdrawInKind(1e18, true);
        assertEq(IERC20(C.NVDA).balanceOf(saver), nvda);
        assertEq(IERC20(C.VENUS_VUSDT).balanceOf(saver), vusdt);
    }

    // ------------------------------------------------------------ deposits

    function test_plainTransferIsCreditedOnSync() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        deal(C.USDT, stranger, 500e18);
        vm.prank(stranger);
        IERC20(C.USDT).transfer(address(v), 500e18);
        v.sync();
        assertEq(v.promised(), 1500e18);
        assertEq(v.deposited(), 1500e18);
    }

    function test_rollAfterMaturity() public {
        PlinthVault v = _open(saver, nvdaId, 9_500, 1000e18);
        vm.prank(saver);
        vm.expectRevert(PlinthVault.NotMatured.selector);
        v.roll();
        uint256 price = v.status().price;
        vm.warp(vm.getBlockTimestamp() + 366 days);
        // A year on, the fork's oracle feeds are stale; hold prices where they were.
        vm.mockCall(C.VENUS_ORACLE, abi.encodeCall(IResilientOracle.getPrice, (C.NVDA)), abi.encode(price));
        vm.mockCall(C.VENUS_ORACLE, abi.encodeCall(IResilientOracle.getPrice, (C.USDT)), abi.encode(1e18));
        vm.prank(saver);
        v.roll();
        assertEq(v.maturity(), block.timestamp + 365 days);
        assertApproxEqRel(v.promised(), v.status().total * 95 / 100, 1e12);
    }

    // ------------------------------------------------------------ price protection

    /// A buy can never fill worse than the reference price minus the allowed slippage, so a sandwich
    /// that pushes the pool up right before the trade makes the rebalance revert instead of overpaying.
    function test_buyRefusesManipulatedPool() public {
        // Open with the pool pumped ~5% above its TWAP in the same block.
        _pump(C.QQQ, C.QQQ_POOL, 100, 400_000e18);
        deal(C.USDT, saver, 1000e18);
        vm.startPrank(saver);
        IERC20(C.USDT).approve(address(factory), 1000e18);
        PlinthVault v = PlinthVault(factory.open(qqqId, 10_000, 1000e18));
        vm.stopPrank();
        assertEq(IERC20(C.QQQ).balanceOf(address(v)), 0, "did not buy into the pump");
        vm.expectRevert();
        v.rebalance();
    }

    function _pump(address token, address, uint24 fee, uint256 usdtIn) internal {
        address whale = makeAddr("whale");
        deal(C.USDT, whale, usdtIn);
        vm.startPrank(whale);
        IERC20(C.USDT).approve(C.PCS_ROUTER, usdtIn);
        IPancakeV3Router(C.PCS_ROUTER).exactInputSingle(
            IPancakeV3Router.ExactInputSingleParams(C.USDT, token, fee, whale, block.timestamp, usdtIn, 0, 0)
        );
        vm.stopPrank();
    }

    function _dump(address token, uint24 fee, uint256 tokensIn) internal returns (uint256 out) {
        address whale = makeAddr("dumper");
        deal(token, whale, tokensIn);
        vm.startPrank(whale);
        IERC20(token).approve(C.PCS_ROUTER, tokensIn);
        out = IPancakeV3Router(C.PCS_ROUTER).exactInputSingle(
            IPancakeV3Router.ExactInputSingleParams(token, C.USDT, fee, whale, block.timestamp, tokensIn, 0, 0)
        );
        vm.stopPrank();
    }

    // ------------------------------------------------------------ defending the floor

    /// QQQ falls about 10% in one block in its real pool and stays there. 90 seconds later the fast price
    /// has followed it (the 10-minute TWAP has not), so anyone can rebalance and the sell fills.
    function test_crashSellsTowardSafety() public {
        PlinthVault v = _open(saver, qqqId, 10_000, 1000e18);
        PlinthVault.Status memory s0 = v.status();

        _dump(C.QQQ, 100, 500e18);
        vm.warp(vm.getBlockTimestamp() + 90);
        vm.roll(vm.getBlockNumber() + 200);

        PlinthVault.Status memory s1 = v.status();
        assertLt(s1.price, s0.price * 97 / 100, "price fell");
        vm.prank(stranger);
        v.rebalance();
        PlinthVault.Status memory s2 = v.status();
        assertLt(s2.stockUsd, s1.stockUsd, "sold stock");
        assertGt(s2.total, s2.floor, "still above floor");
        emit log_named_decimal_uint("QQQ drop", 1e18 - s1.price * 1e18 / s0.price, 18);
        emit log_named_string("stock leg before $ (cents)", _usd(s1.stockUsd));
        emit log_named_string("stock leg after $ (cents)", _usd(s2.stockUsd));
    }

    /// The named risk, shown not hidden: a drop bigger than 1/multiplier before anyone can trade breaks
    /// the floor. Selling 550 QQQB (~$400k) empties the pool's liquidity range and the price collapses.
    function test_namedRisk_gapBiggerThanOneOverMBreaksFloor() public {
        PlinthVault v = _open(saver, qqqId, 10_000, 1000e18);
        _dump(C.QQQ, 100, 550e18);
        vm.warp(vm.getBlockTimestamp() + 900);
        vm.roll(vm.getBlockNumber() + 2000);
        PlinthVault.Status memory s = v.status();
        assertLt(s.total, s.floor, "floor broken by a gap");
        // The loss is capped at the stock leg: the safe leg is untouched.
        assertGt(s.total, 800e18);
    }

    /// The v1 rule, kept as evidence: priced only by the 10-minute TWAP, the same crash leaves the vault
    /// valuing its stock near the old price, and its sells refuse to fill 90 seconds in.
    function test_v1Rule_slowPriceAloneCannotSellInACrash() public {
        StockConfig memory slow = C.qqq(6e18);
        slow.fastWindow = 600; // fast = slow: the v1 behaviour
        vm.prank(owner);
        uint256 id = factory.addStock(slow);
        PlinthVault v = _open(saver, id, 10_000, 1000e18);
        PlinthVault.Status memory s0 = v.status();
        _dump(C.QQQ, 100, 500e18);
        vm.warp(vm.getBlockTimestamp() + 90);
        vm.roll(vm.getBlockNumber() + 200);
        PlinthVault.Status memory s1 = v.status();
        assertGt(s1.price, s0.price * 97 / 100, "still values the stock near the old price");
        uint256 bal = IERC20(C.QQQ).balanceOf(address(v));
        try v.rebalance() {} catch {}
        assertEq(IERC20(C.QQQ).balanceOf(address(v)), bal, "could not sell");
    }

    /// A big vault de-risks over several calls of at most maxTrade each.
    function test_bigVaultDerisksInChunks() public {
        PlinthVault v = _open(saver, qqqId, 9_000, 50_000e18);
        // Buying in also goes $10k at a time: the open buys the first $10k, the keeper the rest.
        assertApproxEqRel(v.status().stockUsd, 10_000e18, 0.02e18, "first buy is one chunk");
        for (uint256 k; k < 6; k++) {
            vm.warp(vm.getBlockTimestamp() + 60);
            vm.roll(vm.getBlockNumber() + 130);
            v.rebalance();
        }
        PlinthVault.Status memory s0 = v.status();
        assertGt(s0.stockUsd, 30_000e18, "90% floor at cap 6: most of it in stock");
        _dump(C.QQQ, 100, 520e18);
        vm.warp(vm.getBlockTimestamp() + 90);
        vm.roll(vm.getBlockNumber() + 200);
        uint256 calls;
        uint256 before = v.status().stockUsd;
        for (; calls < 8; calls++) {
            PlinthVault.Status memory s = v.status();
            uint256 bal = IERC20(C.QQQ).balanceOf(address(v));
            try v.rebalance() {} catch { break; }
            uint256 sold = bal - IERC20(C.QQQ).balanceOf(address(v));
            if (sold == 0) break;
            assertLe(sold * s.price / 1e18, 10_001e18, "one trade is at most $10k");
            vm.warp(vm.getBlockTimestamp() + 60);
            vm.roll(vm.getBlockNumber() + 130);
        }
        assertGt(calls, 1, "took more than one trade");
        assertLt(v.status().stockUsd, before, "sold toward safety");
        emit log_named_uint("trades to de-risk", calls);
    }

    function test_openRefusesDustAndOversize() public {
        deal(C.USDT, saver, 60_000e18);
        vm.startPrank(saver);
        IERC20(C.USDT).approve(address(factory), 60_000e18);
        vm.expectRevert(PlinthFactory.BadAmount.selector);
        factory.open(nvdaId, 10_000, 0.5e18);
        vm.expectRevert(PlinthFactory.BadAmount.selector);
        factory.open(nvdaId, 10_000, 50_001e18);
        PlinthVault v = PlinthVault(factory.open(nvdaId, 10_000, 49_000e18));
        IERC20(C.USDT).approve(address(v), 2_000e18);
        vm.expectRevert(PlinthVault.OverVaultLimit.selector);
        v.deposit(2_000e18);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ a stolen keeper key

    /// The bleed loop: cut to 0 (sell everything), raise to the cap (buy it back), repeat, with a sandwich
    /// taking the slippage each time. Raises are one step per four hours, so the loop cannot run.
    function test_stolenKeeperCannotChurnTheVault() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        vm.prank(keeper);
        v.setMultiplier(0);
        v.rebalance();
        assertEq(IERC20(C.NVDA).balanceOf(address(v)), 0, "cut applies at once");

        vm.startPrank(keeper);
        vm.expectRevert(PlinthVault.RaiseTooBig.selector);
        v.setMultiplier(4.1e18);
        v.setMultiplier(1e18);
        vm.expectRevert(PlinthVault.RaiseTooSoon.selector);
        v.setMultiplier(2e18);
        vm.warp(vm.getBlockTimestamp() + 4 hours);
        v.setMultiplier(2e18);
        vm.stopPrank();
        assertEq(v.multiplier(), 2e18);
        assertEq(v.lastRaiseAt(), vm.getBlockTimestamp());
    }

    function test_keeperChangeWaitsADayAndRemovalIsInstant() public {
        address next = makeAddr("next");
        vm.prank(owner);
        factory.proposeKeeper(next);
        vm.expectRevert(PlinthFactory.TooEarly.selector);
        factory.acceptKeeper();
        vm.warp(vm.getBlockTimestamp() + 1 days);
        factory.acceptKeeper();
        assertEq(factory.keeper(), next);
        vm.prank(owner);
        factory.removeKeeper();
        assertEq(factory.keeper(), address(0));
    }

    // ------------------------------------------------------------ health gate

    function test_pullsOutWhenUtilizationTooHigh() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        assertEq(v.marketIndex(), 1);
        // Venus USDT borrows jump so utilization is ~95%. (Mocked read: see the replay lab for a real one.)
        uint256 cash = IVToken(C.VENUS_VUSDT).getCash();
        vm.mockCall(C.VENUS_VUSDT, abi.encodeWithSelector(IVToken.totalBorrows.selector), abi.encode(cash * 19));
        assertEq(v.status().gateCode, SafeLeg.HIGH_UTILIZATION);

        vm.prank(stranger);
        v.pullOutIfUnhealthy();
        assertEq(v.marketIndex(), 2, "moved to Aave, which still passes");
        assertEq(IERC20(C.VENUS_VUSDT).balanceOf(address(v)), 0);
    }

    /// No market passes the gate, so the safe leg waits in plain USDT. For IDLE_GRACE the floor keeps the
    /// last healthy rate, so one bad stretch does not sell the stock at the worst moment. After the grace
    /// plain USDT earns nothing, the floor is the whole promise and the stock is sold.
    function test_waitsInUsdtKeepsStockThroughGraceThenDerisks() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        uint256 rate = v.status().floorRate;
        uint256 stock0 = IERC20(C.NVDA).balanceOf(address(v));
        vm.mockCall(C.VENUS_VUSDT, abi.encodeWithSelector(IVToken.totalBorrows.selector), abi.encode(1e40));
        vm.prank(owner);
        factory.setMarketEnabled(2, false);

        vm.prank(stranger);
        v.rebalance();
        assertEq(v.marketIndex(), 0, "plain USDT");
        PlinthVault.Status memory s = v.status();
        assertApproxEqRel(s.floorRate, rate, 0.01e18, "floor keeps the last healthy rate");
        assertLt(s.floor, 1000e18);
        assertEq(IERC20(C.NVDA).balanceOf(address(v)), stock0, "stock kept");

        uint256 price = s.slowPrice;
        vm.warp(vm.getBlockTimestamp() + 7 days + 1);
        vm.roll(vm.getBlockNumber() + 1_000_000);
        // A week on, Venus's feed is stale on the fork: hold NVDA at the same price.
        vm.mockCall(
            C.VENUS_ORACLE, abi.encodeWithSelector(IResilientOracle.getPrice.selector, C.NVDA), abi.encode(price)
        );
        vm.prank(stranger);
        v.rebalance();
        s = v.status();
        assertEq(s.floor, 1000e18, "after the grace the floor is the whole promise");
        assertEq(IERC20(C.NVDA).balanceOf(address(v)), 0, "stock sold");
    }

    function test_rebalanceIsIdleWithinBand() public {
        PlinthVault v = _open(saver, nvdaId, 10_000, 1000e18);
        uint256 bal = IERC20(C.NVDA).balanceOf(address(v));
        vm.recordLogs();
        v.rebalance();
        assertEq(IERC20(C.NVDA).balanceOf(address(v)), bal, "no trade inside the band");
    }
}
