// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {StockConfig, Market, MarketKind, GateLimits} from "../src/lib/Types.sol";

/// BSC mainnet addresses and settings, shared by the deploy script and the fork tests.
/// Every address here was read from chain on 2026-09-30 (see docs/spikes/s4-contract-swaps.md).
library BscConfig {
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address internal constant VENUS_ORACLE = 0x6592b5DE802159F3E74B2486b091D11a8256ab8A; // ResilientOracle
    address internal constant VENUS_VUSDT = 0xfD5840Cd36d94D7229439859C0112a4185BC0255;
    address internal constant AAVE_POOL = 0x6807dc923806fE8Fd134338EABCA509979a7e0cB;
    address internal constant AAVE_AUSDT = 0xa9251ca9DE909CB71783723713B21E4233fbf1B1;
    address internal constant AAVE_VDUSDT = 0xF8bb2Be50647447Fb355e3a77b81be4db64107cd;
    address internal constant PCS_ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address internal constant UNI_ROUTER = 0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2;

    address internal constant NVDA = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address internal constant NVDA_POOL = 0xDD9d5164CcBc57bE377a964Fc064135b03D06177; // Uniswap v3 0.05%
    address internal constant QQQ = 0x205812CdBed920aFf76C6580abD681a46D11efc7;
    address internal constant QQQ_POOL = 0xe531fcb1F5a195de7608B9F4f9518544C2cdB693; // PancakeSwap v3 0.01%
    address internal constant TSLA = 0x5b1910eAaD6450E50f816082Aa078C41F10C292f;
    address internal constant TSLA_POOL = 0xB0f5E5400E8F0F7C242F2b7740C004f020579c41; // PancakeSwap v3 0.25%

    /// Measured 2026-09-30: 0.4501 s per block over the last 1,000,000 blocks.
    uint256 internal constant VENUS_BLOCKS_PER_YEAR = 70_064_000;

    function markets() internal pure returns (Market[] memory m) {
        m = new Market[](2);
        m[0] = Market(MarketKind.Venus, VENUS_VUSDT, VENUS_VUSDT, address(0));
        m[1] = Market(MarketKind.Aave, AAVE_POOL, AAVE_AUSDT, AAVE_VDUSDT);
    }

    function gate() internal pure returns (GateLimits memory) {
        return GateLimits({minCashMultiple: 20, maxUtilization: 0.92e18, maxPegDeviation: 0.02e18});
    }

    function nvda(uint64 cap) internal pure returns (StockConfig memory) {
        return StockConfig(NVDA, NVDA_POOL, UNI_ROUTER, 500, false, true, 0, cap, 0.1e18, 0.01e18);
    }

    function qqq(uint64 cap) internal pure returns (StockConfig memory) {
        return StockConfig(QQQ, QQQ_POOL, PCS_ROUTER, 100, true, false, 600, cap, 0.1e18, 0.01e18);
    }

    function tsla(uint64 cap) internal pure returns (StockConfig memory) {
        return StockConfig(TSLA, TSLA_POOL, PCS_ROUTER, 2500, true, true, 0, cap, 0.1e18, 0.015e18);
    }
}
