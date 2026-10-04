// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/proxy/utils/Initializable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/utils/ReentrancyGuardTransient.sol";
import {FixedPointMathLib as FPM} from "solady/utils/FixedPointMathLib.sol";
import {IResilientOracle} from "./interfaces/External.sol";
import {FloorMath} from "./lib/FloorMath.sol";
import {SafeLeg} from "./lib/SafeLeg.sol";
import {StockLeg} from "./lib/StockLeg.sol";
import {StockConfig, Market, MarketKind, GateLimits} from "./lib/Types.sol";

interface IPlinthFactory {
    function usdt() external view returns (address);
    function oracle() external view returns (IResilientOracle);
    function keeper() external view returns (address);
    function marketCount() external view returns (uint256);
    function market(uint256 i) external view returns (Market memory);
    function marketEnabled(uint256 i) external view returns (bool);
    function gate() external view returns (GateLimits memory);
    function venusBlocksPerYear() external view returns (uint256);
    function maxFloorRate() external view returns (uint256);
    function minTrade() external view returns (uint256);
    function liveCap(uint256 stockId) external view returns (uint256);
}

/// One saver's capital-protected savings vault.
///
/// Holds USDT in a safe leg (Venus or Aave, behind a health gate) and a bStock in a stock leg, and keeps
/// the stock leg at multiplier x (value - floor), where the floor is today's value of the promise.
///
/// Who can do what:
/// - Saver: deposit, withdraw (sold to USDT or in kind), roll at maturity. Only the saver receives funds.
/// - Keeper: cut the multiplier at once, raise it back slowly (one step per interval, never above the cap),
///   and move the safe leg between the factory's fixed markets. It cannot move funds out, and the slow
///   raise means a stolen keeper key cannot churn the vault through sell-then-buy round trips.
/// - Anyone: rebalance and pull out of an unhealthy market. The contract checks the math and prices, so
///   the vault can be defended even if the keeper is down.
contract PlinthVault is Initializable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant IDLE = 0; // market index for plain USDT
    uint256 public constant RAISE_STEP = 1e18; // the most one raise may add to the multiplier
    uint256 public constant RAISE_INTERVAL = 4 hours; // the least time between two raises
    uint256 public constant IDLE_GRACE = 7 days; // how long plain USDT keeps the last healthy floor rate

    IPlinthFactory public factory;
    address public saver;
    uint256 public stockId;
    StockConfig internal _stock;
    address public usdt;

    uint256 public capAtOpen; // multiplier cap copied at open; the factory can lower it, never raise it
    uint256 public multiplier; // current multiplier, WAD
    uint256 public promiseBps; // 10000 = get 100% of deposits back at maturity
    uint256 public promised; // USDT promised at maturity
    uint256 public deposited; // USDT deposited, net of withdrawals (pro rata)
    uint256 public term; // seconds per term
    uint256 public maturity; // timestamp
    uint256 public marketIndex; // where the safe leg sits: 0 = plain USDT, i = factory.market(i)
    uint256 internal _idleSeen; // USDT balance after the last action, to credit plain transfers
    uint256 public lastRaiseAt; // when the keeper last raised the multiplier
    uint256 public rateSeen; // the last healthy market's floor rate, WAD
    uint256 public idleSince; // when the safe leg fell back to plain USDT (0 while in a market)

    event Deposited(address indexed from, uint256 amount, uint256 promised);
    event Rebalanced(
        FloorMath.Reason reason,
        int256 deltaUsd,
        uint256 price,
        uint256 total,
        uint256 floor,
        uint256 target,
        uint256 multiplier
    );
    event PulledOut(uint256 indexed marketIndex, uint8 gateCode);
    event MovedSafeLeg(uint256 indexed from, uint256 indexed to, uint256 amount);
    event MultiplierSet(address indexed by, uint256 multiplier);
    event Withdrawn(uint256 share, uint256 usdtOut, uint256 promisedLeft);
    event WithdrawnInKind(uint256 share, uint256 stockOut, uint256 receiptOut, uint256 usdtOut);
    event Rolled(uint256 maturity, uint256 promised);

    error NotSaver();
    error NotKeeper();
    error AboveCap();
    error BadShare();
    error NotMatured();
    error MarketUnhealthy(uint8 code);
    error MarketDisabled();
    error RaiseTooSoon();
    error RaiseTooBig();
    error OverVaultLimit();

    modifier onlySaver() {
        if (msg.sender != saver) revert NotSaver();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != factory.keeper()) revert NotKeeper();
        _;
    }

    /// Credits USDT that arrived by plain transfer, then records the balance after the action.
    modifier accounting() {
        _creditTransfers();
        _;
        _idleSeen = IERC20(usdt).balanceOf(address(this));
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address saver_,
        uint256 stockId_,
        StockConfig calldata stock_,
        uint256 promiseBps_,
        uint256 term_
    ) external initializer {
        factory = IPlinthFactory(msg.sender);
        saver = saver_;
        stockId = stockId_;
        _stock = stock_;
        usdt = factory.usdt();
        capAtOpen = stock_.cap;
        multiplier = stock_.cap;
        promiseBps = promiseBps_;
        term = term_;
        maturity = block.timestamp + term_;
    }

    // ---------------------------------------------------------------- saver

    /// Add USDT. Anyone can add for the saver; the promise grows by amount x promiseBps.
    function deposit(uint256 amount) external nonReentrant accounting {
        if (deposited + amount > _stock.maxVault) revert OverVaultLimit();
        IERC20(usdt).safeTransferFrom(msg.sender, address(this), amount);
        _credit(msg.sender, amount);
    }

    /// Credit USDT sent straight to the vault address (the plain-transfer deposit rail).
    function sync() external nonReentrant accounting {}

    /// Leave with `share` (WAD, 1e18 = all) of the vault, sold to USDT at today's value.
    function withdraw(uint256 share) external nonReentrant onlySaver accounting {
        if (share == 0 || share > WAD) revert BadShare();
        Market memory m = _market(marketIndex);
        SafeLeg.accrue(m);

        uint256 idle0 = IERC20(usdt).balanceOf(address(this));
        uint256 stockOut = FPM.mulWad(_stockBalance(), share);
        if (stockOut > 0) {
            (uint256 price,,) = StockLeg.mark(_stock, usdt, factory.oracle());
            StockLeg.sell(_stock, usdt, stockOut, price);
        }
        SafeLeg.redeem(m, usdt, share == WAD ? type(uint256).max : FPM.mulWad(SafeLeg.position(m), share));
        // Sale proceeds and redeemed USDT, plus the same share of the USDT that was already idle.
        uint256 out = IERC20(usdt).balanceOf(address(this)) - idle0 + FPM.mulWad(idle0, share);
        _shrink(share);
        IERC20(usdt).safeTransfer(saver, out);
        emit Withdrawn(share, out, promised);
    }

    /// Leave with `share` of every holding as it is, with no swap and no redeem. This works even when a
    /// pool or a lending market will not trade. Set `includeStock` false if the bStock itself is paused.
    function withdrawInKind(uint256 share, bool includeStock) external nonReentrant onlySaver accounting {
        if (share == 0 || share > WAD) revert BadShare();
        Market memory m = _market(marketIndex);
        uint256 stockOut = includeStock ? FPM.mulWad(_stockBalance(), share) : 0;
        uint256 receiptOut = m.kind == MarketKind.None ? 0 : FPM.mulWad(IERC20(m.receipt).balanceOf(address(this)), share);
        uint256 usdtOut = FPM.mulWad(IERC20(usdt).balanceOf(address(this)), share);
        _shrink(share);
        if (stockOut > 0) IERC20(_stock.token).safeTransfer(saver, stockOut);
        if (receiptOut > 0) IERC20(m.receipt).safeTransfer(saver, receiptOut);
        if (usdtOut > 0) IERC20(usdt).safeTransfer(saver, usdtOut);
        emit WithdrawnInKind(share, stockOut, receiptOut, usdtOut);
    }

    /// After maturity: start a new term. The new promise is promiseBps of today's value.
    function roll() external nonReentrant onlySaver accounting {
        if (block.timestamp < maturity) revert NotMatured();
        SafeLeg.accrue(_market(marketIndex));
        (uint256 total,,,) = _values();
        maturity = block.timestamp + term;
        promised = total * promiseBps / 10_000;
        deposited = total;
        emit Rolled(maturity, promised);
    }

    // ---------------------------------------------------------------- keeper

    /// Set the multiplier. Cuts apply at once (the keeper cuts risk before events). Raises add at most
    /// RAISE_STEP, at most once per RAISE_INTERVAL, and never go above the cap.
    function setMultiplier(uint256 m) external onlyKeeper {
        if (m > cap()) revert AboveCap();
        if (m > multiplier) {
            if (block.timestamp < lastRaiseAt + RAISE_INTERVAL) revert RaiseTooSoon();
            if (m - multiplier > RAISE_STEP) revert RaiseTooBig();
            lastRaiseAt = block.timestamp;
        }
        multiplier = m;
        emit MultiplierSet(msg.sender, m);
    }

    /// Move the safe leg to another of the factory's fixed markets (or 0: plain USDT). The target market
    /// must be enabled and pass the health gate.
    function moveSafeLeg(uint256 to) external nonReentrant onlyKeeper accounting {
        if (to != IDLE && !factory.marketEnabled(to)) revert MarketDisabled();
        Market memory from = _market(marketIndex);
        SafeLeg.accrue(from);
        uint256 amount = SafeLeg.position(from) + IERC20(usdt).balanceOf(address(this));
        Market memory next = _market(to);
        uint8 code = SafeLeg.check(next, usdt, factory.oracle(), factory.gate(), amount);
        if (code != SafeLeg.OK) revert MarketUnhealthy(code);
        SafeLeg.redeem(from, usdt, type(uint256).max);
        emit MovedSafeLeg(marketIndex, to, amount);
        _enter(to);
        _park();
    }

    // ---------------------------------------------------------------- anyone

    /// Check the safe leg's health, then trade the stock leg back to target if it has drifted past the band.
    function rebalance() external nonReentrant accounting {
        _guardSafeLeg();
        (uint256 total, uint256 stockUsd, uint256 price, uint256 floor_) = _values();
        uint256 target = FloorMath.targetStock(total, floor_, multiplier);
        (int256 delta, FloorMath.Reason reason) =
            FloorMath.decide(stockUsd, target, _stock.band, factory.minTrade());

        // One trade is at most maxTrade. A bigger move happens over several calls, each priced afresh, so
        // the vault never pushes a thin pool past its slippage limit in one go.
        if (delta > 0) {
            uint256 usd = FPM.min(uint256(delta), _stock.maxTrade);
            uint256 idle = IERC20(usdt).balanceOf(address(this));
            if (idle < usd) SafeLeg.redeem(_market(marketIndex), usdt, usd - idle);
            StockLeg.buy(_stock, usdt, usd, price);
        } else if (delta < 0) {
            uint256 usd = FPM.min(uint256(-delta), _stock.maxTrade);
            uint256 tokens = reason == FloorMath.Reason.CushionGone && usd == uint256(-delta)
                ? _stockBalance()
                : FPM.min(_stockBalance(), FPM.divWad(usd, price));
            StockLeg.sell(_stock, usdt, tokens, price);
        }
        _park();
        emit Rebalanced(reason, delta, price, total, floor_, target, multiplier);
    }

    /// Leave an unhealthy market. Anyone can call it; it does nothing if the market is healthy.
    function pullOutIfUnhealthy() external nonReentrant accounting {
        _guardSafeLeg();
        _park();
    }

    // ---------------------------------------------------------------- views

    function stock() external view returns (StockConfig memory) {
        return _stock;
    }

    /// Effective cap: the lower of the cap at open and the factory's live cap for this stock.
    function cap() public view returns (uint256) {
        return FPM.min(capAtOpen, factory.liveCap(stockId));
    }

    struct Status {
        uint256 total; // USDT value now
        uint256 stockUsd;
        uint256 safeUsd;
        uint256 price; // the price the vault values and trades at: the lower of slowPrice and fastPrice
        uint256 slowPrice; // Venus's oracle, or the pool's long TWAP
        uint256 fastPrice; // the pool's short TWAP
        uint256 floor; // today's value of the promise
        uint256 target; // stock leg target
        uint256 breakDistance; // WAD fraction; max uint when no stock is held
        uint256 floorRate; // WAD
        uint256 multiplier;
        uint256 cap;
        uint256 promised;
        uint256 deposited;
        uint256 maturity;
        uint256 marketIndex;
        uint8 gateCode; // health of the current market, 0 = healthy
        uint256 nextRaiseAt; // earliest time the keeper may raise the multiplier again
        uint256 idleSince; // when the safe leg fell back to plain USDT, 0 while in a market
    }

    /// Everything the app shows, read from chain.
    function status() external view returns (Status memory s) {
        (s.total, s.stockUsd, s.price, s.floor) = _values();
        (, s.slowPrice, s.fastPrice) = StockLeg.mark(_stock, usdt, factory.oracle());
        s.safeUsd = s.total - s.stockUsd;
        s.target = FloorMath.targetStock(s.total, s.floor, multiplier);
        s.breakDistance = FloorMath.breakDistance(s.stockUsd, s.total, s.floor);
        s.floorRate = _floorRate(_market(marketIndex));
        s.nextRaiseAt = lastRaiseAt + RAISE_INTERVAL;
        s.idleSince = idleSince;
        s.multiplier = multiplier;
        s.cap = cap();
        s.promised = promised;
        s.deposited = deposited;
        s.maturity = maturity;
        s.marketIndex = marketIndex;
        Market memory m = _market(marketIndex);
        s.gateCode = SafeLeg.check(m, usdt, factory.oracle(), factory.gate(), SafeLeg.position(m));
    }

    // ---------------------------------------------------------------- internal

    function _market(uint256 i) internal view returns (Market memory m) {
        if (i != IDLE) m = factory.market(i);
    }

    function _stockBalance() internal view returns (uint256) {
        return IERC20(_stock.token).balanceOf(address(this));
    }

    /// The floor is discounted at what the safe leg earns now, capped by the factory's maxFloorRate.
    /// Plain USDT earns nothing. A short stay in plain USDT (a market failing its gate until another passes)
    /// keeps the last healthy rate for IDLE_GRACE, so one bad hour does not sell the whole stock leg at the
    /// worst moment. The cost is bounded: at most 7 days of interest, about 0.07% of the promise at 3.5%.
    /// After the grace the floor is the full promise.
    function _floorRate(Market memory m) internal view returns (uint256) {
        if (m.kind != MarketKind.None) return _liveRate(m);
        if (idleSince != 0 && block.timestamp <= idleSince + IDLE_GRACE) return rateSeen;
        return 0;
    }

    function _liveRate(Market memory m) internal view returns (uint256) {
        return FPM.min(SafeLeg.rate(m, usdt, factory.venusBlocksPerYear()), factory.maxFloorRate());
    }

    /// Point the safe leg at market `to`, keeping the floor-rate memory up to date.
    function _enter(uint256 to) internal {
        if (to == IDLE) {
            if (marketIndex != IDLE) idleSince = block.timestamp;
        } else {
            idleSince = 0;
            rateSeen = _liveRate(factory.market(to));
        }
        marketIndex = to;
    }

    /// Values at the reference price. Callers that change state accrue Venus interest first.
    function _values()
        internal
        view
        returns (uint256 total, uint256 stockUsd, uint256 price, uint256 floor_)
    {
        Market memory m = _market(marketIndex);
        (price,,) = StockLeg.mark(_stock, usdt, factory.oracle());
        stockUsd = FPM.mulWad(_stockBalance(), price);
        total = stockUsd + SafeLeg.position(m) + IERC20(usdt).balanceOf(address(this));
        uint256 left = block.timestamp >= maturity ? 0 : maturity - block.timestamp;
        floor_ = FloorMath.floorValue(promised, _floorRate(m), left);
    }

    /// If the current market fails the gate, take everything out first. If the safe leg is plain USDT,
    /// move into the best enabled market that passes the gate.
    function _guardSafeLeg() internal {
        Market memory m = _market(marketIndex);
        IResilientOracle oracle = factory.oracle();
        GateLimits memory g = factory.gate();
        if (marketIndex != IDLE) {
            SafeLeg.accrue(m);
            bool enabled = factory.marketEnabled(marketIndex);
            uint8 code = enabled ? SafeLeg.check(m, usdt, oracle, g, SafeLeg.position(m)) : SafeLeg.PAUSED;
            if (code == SafeLeg.OK) {
                rateSeen = _liveRate(m);
                return;
            }
            SafeLeg.redeem(m, usdt, type(uint256).max);
            emit PulledOut(marketIndex, code);
            _enter(IDLE);
        }
        uint256 idle = IERC20(usdt).balanceOf(address(this));
        uint256 best;
        uint256 bestRate;
        uint256 n = factory.marketCount();
        for (uint256 i = 1; i <= n; i++) {
            if (!factory.marketEnabled(i)) continue;
            Market memory c = factory.market(i);
            if (SafeLeg.check(c, usdt, oracle, g, idle) != SafeLeg.OK) continue;
            uint256 r = SafeLeg.rate(c, usdt, factory.venusBlocksPerYear());
            if (r > bestRate) (best, bestRate) = (i, r);
        }
        if (best != IDLE) {
            emit MovedSafeLeg(IDLE, best, idle);
            _enter(best);
        }
    }

    /// Put idle USDT into the current market. If the market refuses, it stays as plain USDT.
    function _park() internal {
        if (marketIndex == IDLE) return;
        uint256 idle = IERC20(usdt).balanceOf(address(this));
        if (!SafeLeg.supply(_market(marketIndex), usdt, idle)) {
            emit PulledOut(marketIndex, SafeLeg.PAUSED);
            _enter(IDLE);
        }
    }

    function _creditTransfers() internal {
        uint256 bal = IERC20(usdt).balanceOf(address(this));
        if (bal > _idleSeen) _credit(address(0), bal - _idleSeen);
    }

    function _credit(address from, uint256 amount) internal {
        deposited += amount;
        promised += amount * promiseBps / 10_000;
        emit Deposited(from, amount, promised);
    }

    function _shrink(uint256 share) internal {
        promised -= FPM.mulWad(promised, share);
        deposited -= FPM.mulWad(deposited, share);
    }
}
