// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {PlinthFactory} from "../src/PlinthFactory.sol";
import {IResilientOracle} from "../src/interfaces/External.sol";
import {StockConfig} from "../src/lib/Types.sol";
import {BscConfig as C} from "./BscConfig.sol";

/// Deploys the factory and lists every stock in data/stocks.json (pools and calibrated caps).
///   forge script script/Deploy.s.sol --rpc-url bsc --broadcast --verify
/// Env: KEEPER (keeper address), OWNER (final owner; it must call acceptOwnership). The deployer lists the
/// stocks, then hands ownership over.
contract Deploy is Script {
    uint256 constant MAX_FLOOR_RATE = 0.06e18;
    uint256 constant TERM = 365 days;
    uint256 constant MIN_TRADE = 1e18; // $1
    uint256 constant MIN_OPEN = 1e18; // $1
    uint32 constant FAST_WINDOW = 60; // seconds: follows a crash within a minute
    // Every listed stock passed "a $10k sell costs at most 1.3%" (docs/RESEARCH.md), so one trade is at most
    // $10k and a vault is at most five trades of stock: $50k.
    uint128 constant MAX_TRADE = 10_000e18;
    uint128 constant MAX_VAULT = 50_000e18;

    function run() external returns (PlinthFactory factory) {
        address keeper = vm.envAddress("KEEPER");
        address owner = vm.envAddress("OWNER");
        vm.startBroadcast();
        factory = new PlinthFactory(
            msg.sender, C.USDT, IResilientOracle(C.VENUS_ORACLE), C.markets(), C.gate(),
            MAX_FLOOR_RATE, TERM, keeper, C.VENUS_BLOCKS_PER_YEAR, MIN_TRADE, MIN_OPEN
        );
        StockConfig[] memory list = stocks();
        for (uint256 i; i < list.length; i++) factory.addStock(list[i]);
        if (owner != msg.sender) factory.transferOwnership(owner);
        vm.stopBroadcast();
        console.log("factory", address(factory));
        console.log("stocks", list.length);
    }

    function stocks() public view returns (StockConfig[] memory list) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../data/stocks.json"));
        uint256 n = _count(json);
        list = new StockConfig[](n);
        for (uint256 i; i < n; i++) {
            string memory p = string.concat(".stocks[", vm.toString(i), "]");
            bool pancake = keccak256(bytes(vm.parseJsonString(json, string.concat(p, ".dex")))) == keccak256("pcs");
            uint24 fee = uint24(vm.parseJsonUint(json, string.concat(p, ".fee")));
            bool venusPriced = vm.parseJsonBool(json, string.concat(p, ".venusPriced"));
            // cap10 is the calibrated cap x 10 (5.7 -> 57), scaled here to WAD.
            uint256 cap = vm.parseJsonUint(json, string.concat(p, ".cap10")) * 1e17;
            list[i] = StockConfig({
                token: vm.parseJsonAddress(json, string.concat(p, ".token")),
                pool: vm.parseJsonAddress(json, string.concat(p, ".pool")),
                router: pancake ? C.PCS_ROUTER : C.UNI_ROUTER,
                fee: fee,
                pancake: pancake,
                venusPriced: venusPriced,
                twapWindow: venusPriced ? 0 : 600,
                cap: uint64(cap),
                band: 0.1e18,
                // Allowed slippage against the reference price: the pool fee plus a margin.
                maxSlippage: fee >= 2500 ? 0.015e18 : 0.01e18,
                fastWindow: FAST_WINDOW,
                maxTrade: MAX_TRADE,
                maxVault: MAX_VAULT
            });
        }
    }

    function _count(string memory json) internal view returns (uint256 n) {
        while (vm.keyExistsJson(json, string.concat(".stocks[", vm.toString(n), "]"))) n++;
    }
}
