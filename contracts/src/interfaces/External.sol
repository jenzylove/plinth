// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Minimal interfaces for the mainnet contracts Plinth talks to on BSC.

interface IVToken {
    function mint(uint256 amount) external returns (uint256);
    function redeem(uint256 vTokens) external returns (uint256);
    function redeemUnderlying(uint256 amount) external returns (uint256);
    function accrueInterest() external returns (uint256);
    function exchangeRateStored() external view returns (uint256);
    function supplyRatePerBlock() external view returns (uint256);
    function getCash() external view returns (uint256);
    function totalBorrows() external view returns (uint256);
    function totalReserves() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function underlying() external view returns (address);
    function comptroller() external view returns (address);
    function transfer(address, uint256) external returns (bool);
}

interface IVenusComptroller {
    function actionPaused(address market, uint8 action) external view returns (bool);
    function oracle() external view returns (address);
}

interface IResilientOracle {
    /// USD price with 18 decimals for an 18-decimal token. Reverts when every source is stale or invalid.
    function getPrice(address asset) external view returns (uint256);
}

interface IAavePool {
    struct ReserveData {
        uint256 configuration;
        uint128 liquidityIndex;
        uint128 currentLiquidityRate;
        uint128 variableBorrowIndex;
        uint128 currentVariableBorrowRate;
        uint128 currentStableBorrowRate;
        uint40 lastUpdateTimestamp;
        uint16 id;
        address aTokenAddress;
        address stableDebtTokenAddress;
        address variableDebtTokenAddress;
        address interestRateStrategyAddress;
        uint128 accruedToTreasury;
        uint128 unbacked;
        uint128 isolationModeTotalDebt;
    }

    function getReserveData(address asset) external view returns (ReserveData memory);
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IUniV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
    /// Uniswap v3 returns uint8 feeProtocol, PancakeSwap v3 uint32; reading it as uint32 decodes both.
    function slot0()
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool);
}

/// PancakeSwap v3 SwapRouter (has a deadline field).
interface IPancakeV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
}

/// Uniswap v3 SwapRouter02 (no deadline field).
interface IUniV3Router02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
}
