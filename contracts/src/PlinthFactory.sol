// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/proxy/Clones.sol";
import {IResilientOracle} from "./interfaces/External.sol";
import {PlinthVault} from "./PlinthVault.sol";
import {StockConfig, Market, MarketKind, GateLimits} from "./lib/Types.sol";

/// Opens one PlinthVault per saver and holds the settings vaults read.
///
/// Fixed at deploy, so nobody (the owner included) can point savers' money at a new contract: USDT,
/// the price oracle, the lending markets, the health gate limits, the most the floor may assume the safe
/// leg earns, and the multiplier ceiling. A vault copies its stock's routing at open and never changes it.
///
/// The owner can add stocks for new vaults, disable markets or stocks, and lower caps at once. Anything that
/// adds risk to open vaults waits CHANGE_DELAY in public first: a new keeper, or a cap raised back up (never
/// above MAX_CAP, and an open vault never goes above the cap it opened with). Removing the keeper is instant;
/// vaults then keep their multiplier and anyone can still rebalance them.
contract PlinthFactory is Ownable2Step {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_CAP = 6e18;
    uint256 public constant MAX_BAND = 0.5e18;
    uint256 public constant MAX_SLIPPAGE = 0.05e18;
    uint256 public constant CHANGE_DELAY = 1 days;

    address public immutable usdt;
    IResilientOracle public immutable oracle;
    address public immutable implementation;
    uint256 public immutable maxFloorRate; // WAD, the most the floor may assume the safe leg earns
    uint256 public immutable term; // seconds

    GateLimits internal _gate;
    Market[] internal _markets; // index 0 is unused (plain USDT)
    mapping(uint256 => bool) public marketEnabled;

    StockConfig[] internal _stocks;
    mapping(uint256 => bool) public stockEnabled;

    address public keeper;
    uint256 public venusBlocksPerYear;
    uint256 public minTrade; // USDT, smallest trade worth making
    uint256 public minOpen; // USDT, smallest first deposit

    address public pendingKeeper;
    uint256 public pendingKeeperAt; // when pendingKeeper may take over
    mapping(uint256 => uint256) public pendingCap; // stockId => queued higher cap
    mapping(uint256 => uint256) public pendingCapAt; // stockId => when it may apply

    address[] public vaults;
    mapping(address => address[]) internal _vaultsOf;

    event VaultOpened(address indexed saver, address indexed vault, uint256 indexed stockId, uint256 amount, uint256 promiseBps);
    event StockAdded(uint256 indexed stockId, address token);
    event StockEnabled(uint256 indexed stockId, bool enabled);
    event CapSet(uint256 indexed stockId, uint256 cap);
    event MarketEnabled(uint256 indexed marketIndex, bool enabled);
    event KeeperSet(address keeper);
    event VenusBlocksPerYearSet(uint256 blocks);
    event MinTradeSet(uint256 minTrade);
    event MinOpenSet(uint256 minOpen);
    event KeeperProposed(address keeper, uint256 at);
    event CapProposed(uint256 indexed stockId, uint256 cap, uint256 at);

    error BadConfig();
    error StockOff();
    error BadPromise();
    error BadAmount();
    error TooEarly();

    constructor(
        address owner_,
        address usdt_,
        IResilientOracle oracle_,
        Market[] memory markets_,
        GateLimits memory gate_,
        uint256 maxFloorRate_,
        uint256 term_,
        address keeper_,
        uint256 venusBlocksPerYear_,
        uint256 minTrade_,
        uint256 minOpen_
    ) Ownable(owner_) {
        if (maxFloorRate_ > 0.1e18 || term_ == 0 || minTrade_ == 0 || minOpen_ == 0) revert BadConfig();
        if (gate_.minCashMultiple == 0 || gate_.maxUtilization > 1e18) revert BadConfig();
        usdt = usdt_;
        oracle = oracle_;
        maxFloorRate = maxFloorRate_;
        term = term_;
        _gate = gate_;
        _markets.push(); // index 0: plain USDT
        for (uint256 i; i < markets_.length; i++) {
            if (markets_[i].kind == MarketKind.None) revert BadConfig();
            _markets.push(markets_[i]);
            marketEnabled[i + 1] = true;
        }
        keeper = keeper_;
        venusBlocksPerYear = venusBlocksPerYear_;
        minTrade = minTrade_;
        minOpen = minOpen_;
        implementation = address(new PlinthVault());
    }

    // ---------------------------------------------------------------- savers

    /// Open a vault for msg.sender and fund it with `amount` USDT (approve this factory first).
    /// promiseBps: 10000 (get your money back), 9500 or 9000.
    function open(uint256 stockId, uint256 promiseBps, uint256 amount) external returns (address vault) {
        if (!stockEnabled[stockId]) revert StockOff();
        if (promiseBps != 10_000 && promiseBps != 9_500 && promiseBps != 9_000) revert BadPromise();
        if (amount < minOpen || amount > _stocks[stockId].maxVault) revert BadAmount();
        vault = Clones.clone(implementation);
        PlinthVault(vault).initialize(msg.sender, stockId, _stocks[stockId], promiseBps, term);
        vaults.push(vault);
        _vaultsOf[msg.sender].push(vault);
        IERC20(usdt).safeTransferFrom(msg.sender, vault, amount);
        PlinthVault(vault).sync();
        emit VaultOpened(msg.sender, vault, stockId, amount, promiseBps);
        // Put the money to work now. If a pool or market refuses, the keeper (or anyone) retries later.
        try PlinthVault(vault).rebalance() {} catch {}
    }

    // ---------------------------------------------------------------- owner

    function addStock(StockConfig calldata s) external onlyOwner returns (uint256 id) {
        _checkStock(s);
        id = _stocks.length;
        _stocks.push(s);
        stockEnabled[id] = true;
        emit StockAdded(id, s.token);
    }

    function setStockEnabled(uint256 id, bool on) external onlyOwner {
        if (id >= _stocks.length) revert BadConfig();
        stockEnabled[id] = on;
        emit StockEnabled(id, on);
    }

    /// Recalibrated cap. A lower cap applies at once (to new vaults, and to open vaults' live cap). A higher
    /// cap is queued and applies after CHANGE_DELAY with applyCap. Open vaults never exceed their cap at open.
    function setCap(uint256 id, uint256 cap_) external onlyOwner {
        if (id >= _stocks.length || cap_ > MAX_CAP) revert BadConfig();
        if (cap_ <= _stocks[id].cap) {
            _stocks[id].cap = uint64(cap_);
            delete pendingCapAt[id];
            emit CapSet(id, cap_);
        } else {
            pendingCap[id] = cap_;
            pendingCapAt[id] = block.timestamp + CHANGE_DELAY;
            emit CapProposed(id, cap_, pendingCapAt[id]);
        }
    }

    /// Apply a queued higher cap once its delay has passed. Anyone can call it.
    function applyCap(uint256 id) external {
        uint256 at = pendingCapAt[id];
        if (at == 0 || block.timestamp < at) revert TooEarly();
        _stocks[id].cap = uint64(pendingCap[id]);
        delete pendingCapAt[id];
        emit CapSet(id, pendingCap[id]);
    }

    function setMarketEnabled(uint256 i, bool on) external onlyOwner {
        if (i == 0 || i >= _markets.length) revert BadConfig();
        marketEnabled[i] = on;
        emit MarketEnabled(i, on);
    }

    /// Queue a new keeper. It takes over after CHANGE_DELAY with acceptKeeper, so savers see it coming.
    function proposeKeeper(address k) external onlyOwner {
        pendingKeeper = k;
        pendingKeeperAt = block.timestamp + CHANGE_DELAY;
        emit KeeperProposed(k, pendingKeeperAt);
    }

    /// Install the queued keeper once its delay has passed. Anyone can call it.
    function acceptKeeper() external {
        if (pendingKeeperAt == 0 || block.timestamp < pendingKeeperAt) revert TooEarly();
        keeper = pendingKeeper;
        delete pendingKeeperAt;
        emit KeeperSet(keeper);
    }

    /// Remove the keeper at once (for a lost or stolen key). Vaults keep working without it.
    function removeKeeper() external onlyOwner {
        keeper = address(0);
        delete pendingKeeperAt;
        emit KeeperSet(address(0));
    }

    /// BSC block time changes move Venus's per-block rate. The floor rate stays capped by maxFloorRate.
    function setVenusBlocksPerYear(uint256 b) external onlyOwner {
        venusBlocksPerYear = b;
        emit VenusBlocksPerYearSet(b);
    }

    function setMinTrade(uint256 m) external onlyOwner {
        if (m == 0) revert BadConfig();
        minTrade = m;
        emit MinTradeSet(m);
    }

    function setMinOpen(uint256 m) external onlyOwner {
        if (m == 0) revert BadConfig();
        minOpen = m;
        emit MinOpenSet(m);
    }

    // ---------------------------------------------------------------- views

    function stock(uint256 id) external view returns (StockConfig memory) {
        return _stocks[id];
    }

    function stockCount() external view returns (uint256) {
        return _stocks.length;
    }

    function liveCap(uint256 id) external view returns (uint256) {
        return _stocks[id].cap;
    }

    function market(uint256 i) external view returns (Market memory) {
        return _markets[i];
    }

    /// Number of lending markets (indexes 1..marketCount).
    function marketCount() external view returns (uint256) {
        return _markets.length - 1;
    }

    function gate() external view returns (GateLimits memory) {
        return _gate;
    }

    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }

    function vaultsOf(address saver) external view returns (address[] memory) {
        return _vaultsOf[saver];
    }

    function _checkStock(StockConfig calldata s) internal pure {
        if (s.token == address(0) || s.pool == address(0) || s.router == address(0)) revert BadConfig();
        if (s.cap > MAX_CAP || s.band == 0 || s.band > MAX_BAND || s.maxSlippage > MAX_SLIPPAGE) revert BadConfig();
        if (!s.venusPriced && s.twapWindow < 60) revert BadConfig();
        if (s.fastWindow < 30 || s.fastWindow > 600 || s.maxTrade == 0 || s.maxVault == 0) revert BadConfig();
    }
}
