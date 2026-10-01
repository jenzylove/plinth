// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {PlinthFactory} from "../src/PlinthFactory.sol";
import {PlinthVault} from "../src/PlinthVault.sol";
import {IResilientOracle, IUniV3Router02} from "../src/interfaces/External.sol";
import {BscConfig as C} from "../script/BscConfig.sol";

interface IPoolSlot0 {
    function slot0()
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool);
    function token0() external view returns (address);
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
        uint256 bankStock = _min(_cushion(s.total, s.floor) * BANK_M / 1e18, s.total);
        uint256 bankSafe = s.total - bankStock;
        uint256 lastFloor = s.floor;
        rows[0] = Row(s.total, s.floor, s.stockUsd, v.multiplier(), s.total, bankStock, s.price);

        uint256 t0 = block.timestamp;
        for (uint256 k = 1; k < n; k++) {
            uint256 dt = at[k] - at[k - 1];
            vm.warp(t0 + at[k] - at[0]);
            vm.roll(block.number + dt / 3);

            uint256 price = p0 * px[k] / 1e18;
            _setPrice(price);
            bankStock = bankStock * px[k] / px[k - 1];

            if (ms[k] != v.multiplier()) {
                vm.prank(keeper);
                v.setMultiplier(ms[k]);
            }
            try v.rebalance() {} catch {}

            s = v.status();
            // The bank's safe leg earns what the floor earns, so both sides face the same rate.
            bankSafe = bankSafe * s.floor / lastFloor;
            lastFloor = s.floor;
            if (isClose[k] == 1) {
                uint256 bt = bankStock + bankSafe;
                bankStock = _min(_cushion(bt, s.floor) * BANK_M / 1e18, bt);
                bankSafe = bt - bankStock;
            }
            rows[k] = Row(s.total, s.floor, s.stockUsd, v.multiplier(), bankStock + bankSafe, bankStock, s.price);
        }
        _write(name, at, rows);
    }

    // ------------------------------------------------------------ price control

    /// Venus's price for NVDA, and the real Uniswap pool traded to within 0.2% of it.
    function _setPrice(uint256 price) internal {
        vm.mockCall(
            C.VENUS_ORACLE, abi.encodeWithSelector(IResilientOracle.getPrice.selector, C.NVDA), abi.encode(price)
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
        IUniV3Router02(C.UNI_ROUTER).exactInputSingle(
            IUniV3Router02.ExactInputSingleParams(tokenIn, tokenOut, 500, mover, amountIn, 0, 0)
        );
        vm.stopPrank();
    }

    /// USDT per NVDA from the pool's current price, WAD.
    function _spot() internal view returns (uint256) {
        (uint160 sqrtP,,,,,,) = IPoolSlot0(C.NVDA_POOL).slot0();
        uint256 p = ((uint256(sqrtP) * uint256(sqrtP)) >> 96) * 1e18 >> 96; // token1 per token0
        return IPoolSlot0(C.NVDA_POOL).token0() == C.NVDA ? p : 1e36 / p;
    }

    // ------------------------------------------------------------ helpers

    function _cushion(uint256 total, uint256 floor_) internal pure returns (uint256) {
        return total > floor_ ? total - floor_ : 0;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _write(string memory name, uint256[] memory at, Row[] memory rows) internal {
        uint256 n = rows.length;
        uint256[][] memory cols = new uint256[][](7);
        for (uint256 c = 0; c < 7; c++) cols[c] = new uint256[](n);
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
    }
}
