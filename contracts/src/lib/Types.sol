// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// How a vault trades one bStock. Copied into the vault when it opens and never changed after.
struct StockConfig {
    address token; // the bStock (18 decimals)
    address pool; // Uniswap v3 or PancakeSwap v3 pool, bStock/USDT
    address router; // the router for that pool
    uint24 fee; // pool fee tier
    bool pancake; // true: PancakeSwap v3 router (has deadline). false: Uniswap SwapRouter02
    bool venusPriced; // true: reference price from Venus's oracle. false: pool TWAP
    uint32 twapWindow; // seconds, used when venusPriced is false
    uint64 cap; // highest multiplier allowed, WAD (from 10y calibration, max 6)
    uint64 band; // rebalance band, WAD fraction of target (0.1e18 = 10%)
    uint64 maxSlippage; // worst price accepted against the reference, WAD fraction
}

enum MarketKind {
    None,
    Venus,
    Aave
}

/// A stablecoin lending market the safe leg may sit in. Fixed when the factory is deployed.
struct Market {
    MarketKind kind;
    address target; // Venus vToken, or the Aave pool
    address receipt; // what the vault holds: the vToken itself, or the aToken
    address debt; // Aave variable debt token (unused for Venus)
}

/// Health gate limits. Fixed when the factory is deployed.
struct GateLimits {
    uint64 minCashMultiple; // market cash must be at least this many times our position (20)
    uint64 maxUtilization; // WAD (0.92e18)
    uint64 maxPegDeviation; // WAD, USDT must price within this of $1 on Venus's oracle
}
