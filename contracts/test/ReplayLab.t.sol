// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/utils/math/Math.sol";
import {PlinthFactory} from "../src/PlinthFactory.sol";
import {PlinthVault} from "../src/PlinthVault.sol";
import {IResilientOracle, IUniV3Router02, IVToken} from "../src/interfaces/External.sol";
import {BscConfig as C} from "../script/BscConfig.sol";

interface IPoolSlot0 {
    function slot0()
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool);
    function token0() external view returns (address);
}

interface IVBnb {
    function mint() external payable;
}

interface IVBorrow {
    function borrow(uint256 amount) external returns (uint256);
}

interface IVenusEnter {
    function enterMarkets(address[] calldata vTokens) external returns (uint256[] memory);
}

/// Replay lab. Real Plinth contracts on a fork of BSC mainnet walk a real NVDA price path from
/// data/replay-paths.json (made by packages/core/scripts/replay-paths.ts). At each step Venus's NVDA price
/// is set to the path and the real Uniswap pool is traded to the same price, so the vault's own swaps
/// run against real liquidity. The multiplier at each step comes from the keeper's real policy.
///
/// Plinth rebalances at every step (its keeper runs around the clock); a bank desk with multiplier 5
/// rebalances once a day at the close, on the same floor and the same safe-leg growth, with no costs.
/// Nobody can trade through an overnight gap. Writes data/replay-<name>.json. Needs BSC_ARCHIVE_RPC_URL.
contract ReplayLabTest is Test {
    uint256 constant FORK_BLOCK = 124_954_313; // 2026-09-30 18:11 UTC
    uint256 constant BANK_M = 5e18;

    PlinthFactory factory;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address saver = makeAddr("saver");
    address mover = makeAddr("mover");
    uint256 nvdaId;
    uint256 p0; // Venus's NVDA price at the fork block

    struct Bank {
        uint256 stock;
        uint256 safe;
        uint256 lastFloor;
    }

    struct Row {
        uint256 total;
        uint256 floor;
        uint256 stockUsd;
        uint256 multiplier;
        uint256 bankTotal;
        uint256 bankStock;
        uint256 price;
    }

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
            1e18
        );
        vm.prank(owner);
        nvdaId = factory.addStock(C.nvda(5.7e18));
        p0 = IResilientOracle(C.VENUS_ORACLE).getPrice(C.NVDA);
        // On a fork the price feeds never update, so after the replay skips ahead hours or days Venus would
        // call USDT's feed stale and the health gate would (rightly) pull out. Live, the feed updates every
        // few minutes; hold USDT at its fork-block price so the gate judges the market, not the fork.
        uint256 usdtPrice = IResilientOracle(C.VENUS_ORACLE).getPrice(C.USDT);
        vm.mockCall(
            C.VENUS_ORACLE,
            abi.encodeWithSelector(IResilientOracle.getPrice.selector, C.USDT),
            abi.encode(usdtPrice)
        );
    }

    function test_replay_nvda_2018_11() public {
        _replay(0, "nvda-2018-11");
    }

    function test_replay_nvda_2026_07() public {
        _replay(1, "nvda-2026-07");
    }

    function _replay(uint256 i, string memory name) internal {
        string memory json = vm.readFile("../data/replay-paths.json");
        string memory base = string.concat(".paths[", vm.toString(i), "].series.");
        uint256[] memory at = vm.parseJsonUintArray(json, string.concat(base, "at"));
        uint256[] memory px = vm.parseJsonUintArray(json, string.concat(base, "priceWad"));
        uint256[] memory ms = vm.parseJsonUintArray(json, string.concat(base, "multiplierWad"));
        uint256[] memory isClose = vm.parseJsonUintArray(json, string.concat(base, "isClose"));
        uint256 n = at.length;

        _setPrice(p0);
        deal(C.USDT, saver, 1000e18);
        vm.startPrank(saver);
        IERC20(C.USDT).approve(address(factory), 1000e18);
        PlinthVault v = PlinthVault(factory.open(nvdaId, 10_000, 1000e18));
        vm.stopPrank();
        vm.prank(keeper);
        v.setMultiplier(ms[0]);
        v.rebalance();

        Row[] memory rows = new Row[](n);
        PlinthVault.Status memory s = v.status();
        // The bank desk starts from the same money and floor, at multiplier 5.
        Bank memory b;
        b.stock = _min(_cushion(s.total, s.floor) * BANK_M / 1e18, s.total);
        b.safe = s.total - b.stock;
        b.lastFloor = s.floor;
        rows[0] = Row(s.total, s.floor, s.stockUsd, v.multiplier(), s.total, b.stock, s.price);

        // vm.getBlockTimestamp, not block.timestamp: under via_ir a saved block.timestamp is re-read after warp.
        uint256 t0 = vm.getBlockTimestamp();
        for (uint256 k = 1; k < n; k++) {
            uint256 dt = at[k] - at[k - 1];
            vm.warp(t0 + at[k] - at[0]);
            vm.roll(vm.getBlockNumber() + dt / 3);

            uint256 price = p0 * px[k] / 1e18;
            _setPrice(price);
            b.stock = b.stock * px[k] / px[k - 1];

            if (ms[k] != v.multiplier()) {
                vm.prank(keeper);
                v.setMultiplier(ms[k]);
            }
            try v.rebalance() {} catch {}

            s = v.status();
            _bankStep(b, s.floor, isClose[k] == 1);
            rows[k] = Row(s.total, s.floor, s.stockUsd, v.multiplier(), b.stock + b.safe, b.stock, s.price);
        }
        _write(name, at, rows);
    }

    // ------------------------------------------------------------ lending stress

    address constant VBNB = 0xA07c5b74C9B40447a954e1466938b865b6BBea36;

    /// Venus USDT utilization pushed up with real borrows (100k BNB of collateral), not a mocked read.
    /// The vault's safe leg sits in Venus until the gate's 92% line is crossed; then anyone can pull it
    /// out and it moves to Aave, which still passes. Writes data/replay-venus-utilization.json.
    function test_replay_venus_utilization() public {
        deal(C.USDT, saver, 1000e18);
        vm.startPrank(saver);
        IERC20(C.USDT).approve(address(factory), 1000e18);
        PlinthVault v = PlinthVault(factory.open(nvdaId, 10_000, 1000e18));
        vm.stopPrank();
        assertEq(v.marketIndex(), 1, "starts in Venus");

        address borrower = makeAddr("borrower");
        vm.deal(borrower, 100_000 ether);
        vm.startPrank(borrower);
        IVBnb(VBNB).mint{value: 100_000 ether}();
        address[] memory mk = new address[](1);
        mk[0] = VBNB;
        IVenusEnter(IVToken(C.VENUS_VUSDT).comptroller()).enterMarkets(mk);
        vm.stopPrank();

        uint256[6] memory targets = [uint256(0), 0.85e18, 0.9e18, 0.92e18, 0.93e18, 0.95e18];
        uint256[] memory util = new uint256[](6);
        uint256[] memory gate = new uint256[](6);
        uint256[] memory market = new uint256[](6);
        uint256[] memory total = new uint256[](6);
        bool pulled;
        for (uint256 k = 0; k < 6; k++) {
            if (targets[k] > 0) _borrowTo(borrower, targets[k]);
            util[k] = _utilization();
            PlinthVault.Status memory s = v.status();
            if (!pulled && s.gateCode != 0) {
                vm.prank(makeAddr("anyone"));
                v.pullOutIfUnhealthy();
                pulled = true;
                s = v.status();
            }
            (gate[k], market[k], total[k]) = (_venusGate(), s.marketIndex, s.total);
        }
        assertTrue(pulled, "gate tripped");
        assertEq(v.marketIndex(), 2, "moved to Aave");
        assertEq(IERC20(C.VENUS_VUSDT).balanceOf(address(v)), 0, "nothing left in Venus");
        assertApproxEqRel(total[5], total[0], 0.002e18, "no loss moving out");

        string memory o = "util";
        vm.serializeUint(o, "forkBlock", FORK_BLOCK);
        vm.serializeUint(o, "collateralBnb", 100_000);
        vm.serializeUint(o, "maxUtilization", 0.92e18);
        vm.serializeUint(o, "utilization", util);
        vm.serializeUint(o, "venusGateCode", gate);
        vm.serializeUint(o, "vaultMarket", market);
        string memory out = vm.serializeUint(o, "vaultTotal", total);
        vm.writeJson(out, "../data/replay-venus-utilization.json");
    }

    /// Borrow USDT from Venus until utilization (the gate's formula) reaches `u`.
    function _borrowTo(address borrower, uint256 u) internal {
        IVToken vt = IVToken(C.VENUS_VUSDT);
        uint256 supplied = vt.getCash() + vt.totalBorrows() - vt.totalReserves();
        uint256 want = supplied * u / 1e18;
        uint256 have = vt.totalBorrows();
        if (want <= have) return;
        vm.prank(borrower);
        require(IVBorrow(C.VENUS_VUSDT).borrow(want - have + 1e18) == 0, "venus borrow");
    }

    function _utilization() internal view returns (uint256) {
        IVToken vt = IVToken(C.VENUS_VUSDT);
        return vt.totalBorrows() * 1e18 / (vt.getCash() + vt.totalBorrows() - vt.totalReserves());
    }

    function _venusGate() internal view returns (uint256) {
        return _utilization() > 0.92e18 ? 3 : 0; // SafeLeg.HIGH_UTILIZATION
    }

    // ------------------------------------------------------------ price control

    /// Venus's price for NVDA, and the real Uniswap pool traded to within 0.2% of it.
    function _setPrice(uint256 price) internal {
        // Moving the pool is test plumbing; keep its gas out of the test's budget.
        vm.pauseGasMetering();
        _movePool(price);
        vm.resumeGasMetering();
    }

    function _movePool(uint256 price) internal {
        vm.mockCall(
            C.VENUS_ORACLE,
            abi.encodeWithSelector(IResilientOracle.getPrice.selector, C.NVDA),
            abi.encode(price)
        );
        uint256 spot = _spot();
        if (spot * 1000 > price * 998 && spot * 1000 < price * 1002) return;
        bool sell = spot > price;
        address tokenIn = sell ? C.NVDA : C.USDT;
        uint256 lo = 0;
        uint256 hi = sell ? 1e24 : 1e27;
        for (uint256 j = 0; j < 60 && hi - lo > hi / 1e5; j++) {
            uint256 mid = (lo + hi) / 2;
            uint256 snap = vm.snapshotState();
            _swap(tokenIn, mid);
            uint256 after_ = _spot();
            vm.revertToState(snap);
            if (sell ? after_ > price : after_ < price) lo = mid;
            else hi = mid;
        }
        _swap(tokenIn, (lo + hi) / 2);
    }

    function _swap(address tokenIn, uint256 amountIn) internal {
        if (amountIn == 0) return;
        address tokenOut = tokenIn == C.NVDA ? C.USDT : C.NVDA;
        deal(tokenIn, mover, amountIn);
        vm.startPrank(mover);
        IERC20(tokenIn).approve(C.UNI_ROUTER, amountIn);
        IUniV3Router02(C.UNI_ROUTER)
            .exactInputSingle(
                IUniV3Router02.ExactInputSingleParams(tokenIn, tokenOut, 500, mover, amountIn, 0, 0)
            );
        vm.stopPrank();
    }

    /// USDT per NVDA from the pool's current price, WAD.
    function _spot() internal view returns (uint256) {
        (uint160 sqrtP,,,,,,) = IPoolSlot0(C.NVDA_POOL).slot0();
        // token1 per token0. mulDiv keeps extreme prices (hit while searching for a trade size) in range.
        uint256 p = Math.mulDiv(Math.mulDiv(sqrtP, sqrtP, 1 << 96), 1e18, 1 << 96);
        if (IPoolSlot0(C.NVDA_POOL).token0() == C.NVDA) return p;
        return p == 0 ? type(uint256).max : 1e36 / p;
    }

    // ------------------------------------------------------------ helpers

    /// The bank's safe leg earns what the floor earns, so both sides face the same rate. It rebalances
    /// only at the close.
    function _bankStep(Bank memory b, uint256 floor_, bool close) internal pure {
        b.safe = b.safe * floor_ / b.lastFloor;
        b.lastFloor = floor_;
        if (!close) return;
        uint256 t = b.stock + b.safe;
        b.stock = _min(_cushion(t, floor_) * BANK_M / 1e18, t);
        b.safe = t - b.stock;
    }

    function _cushion(uint256 total, uint256 floor_) internal pure returns (uint256) {
        return total > floor_ ? total - floor_ : 0;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _write(string memory name, uint256[] memory at, Row[] memory rows) internal {
        uint256 n = rows.length;
        uint256[][] memory cols = new uint256[][](7);
        for (uint256 c = 0; c < 7; c++) {
            cols[c] = new uint256[](n);
        }
        bool plinthBelow;
        bool bankBelow;
        for (uint256 k = 0; k < n; k++) {
            Row memory r = rows[k];
            (cols[0][k], cols[1][k], cols[2][k], cols[3][k]) = (r.total, r.floor, r.stockUsd, r.multiplier);
            (cols[4][k], cols[5][k], cols[6][k]) = (r.bankTotal, r.bankStock, r.price);
            if (r.total < r.floor) plinthBelow = true;
            if (r.bankTotal < r.floor) bankBelow = true;
        }
        string memory o = name;
        vm.serializeString(o, "name", name);
        vm.serializeUint(o, "forkBlock", FORK_BLOCK);
        vm.serializeUint(o, "at", at);
        vm.serializeUint(o, "plinthTotal", cols[0]);
        vm.serializeUint(o, "floor", cols[1]);
        vm.serializeUint(o, "plinthStock", cols[2]);
        vm.serializeUint(o, "plinthMultiplier", cols[3]);
        vm.serializeUint(o, "bankTotal", cols[4]);
        vm.serializeUint(o, "bankStock", cols[5]);
        vm.serializeBool(o, "plinthEverBelowFloor", plinthBelow);
        vm.serializeBool(o, "bankEverBelowFloor", bankBelow);
        string memory out = vm.serializeUint(o, "nvdaPrice", cols[6]);
        vm.writeJson(out, string.concat("../data/replay-", name, ".json"));

        emit log_named_decimal_uint("plinth end", rows[n - 1].total, 18);
        emit log_named_decimal_uint("bank end", rows[n - 1].bankTotal, 18);
        emit log_named_decimal_uint("floor end", rows[n - 1].floor, 18);
        emit log_named_string("plinth ever below floor", plinthBelow ? "yes" : "no");
        emit log_named_string("bank ever below floor", bankBelow ? "yes" : "no");
        // The claim under test: with the keeper's real policy, Plinth stays above its floor on these paths.
        assertFalse(plinthBelow, "Plinth went below its floor");
    }
}
