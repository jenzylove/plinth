// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {PlinthFactory} from "../src/PlinthFactory.sol";
import {PlinthVault} from "../src/PlinthVault.sol";
import {IResilientOracle} from "../src/interfaces/External.sol";
import {StockConfig} from "../src/lib/Types.sol";
import {BscConfig as C} from "../script/BscConfig.sol";
import {Deploy} from "../script/Deploy.s.sol";

/// Every stock the deploy script lists: open a $1,000 vault, check it bought the stock at close to the
/// reference price, then withdraw everything. Real pools and oracles at a pinned mainnet block.
contract AllStocksForkTest is Test {
    function test_everyListedStockOpensAndCloses() public {
        vm.createSelectFork(vm.envString("BSC_ARCHIVE_RPC_URL"), 124_954_313);
        StockConfig[] memory list = new Deploy().stocks();
        assertEq(list.length, 20);
        PlinthFactory f = new PlinthFactory(
            address(this), C.USDT, IResilientOracle(C.VENUS_ORACLE), C.markets(), C.gate(),
            0.06e18, 365 days, address(1), C.VENUS_BLOCKS_PER_YEAR, 1e18, 1e18
        );
        address saver = makeAddr("saver");
        for (uint256 i; i < list.length; i++) {
            uint256 id = f.addStock(list[i]);
            deal(C.USDT, saver, 1000e18);
            vm.startPrank(saver);
            IERC20(C.USDT).approve(address(f), 1000e18);
            PlinthVault v = PlinthVault(f.open(id, 10_000, 1000e18));
            PlinthVault.Status memory s = v.status();
            assertGt(IERC20(list[i].token).balanceOf(address(v)), 0, "bought");
            assertApproxEqRel(s.total, 1000e18, 0.005e18, "value near deposit");
            v.withdraw(1e18);
            uint256 back = IERC20(C.USDT).balanceOf(saver);
            vm.stopPrank();
            assertApproxEqRel(back, 1000e18, 0.01e18, "withdraw");
            emit log_named_string(
                string.concat(vm.toString(list[i].token), " cap x10 ", vm.toString(uint256(list[i].cap) / 1e17)),
                string.concat("stock $", vm.toString(s.stockUsd / 1e18), "  back $", vm.toString(back / 1e16), " cents")
            );
            deal(C.USDT, saver, 0);
        }
    }
}
