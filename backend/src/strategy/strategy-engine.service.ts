import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Strategy } from '../entities/strategy.entity';
import { TradeLog } from '../entities/trade-log.entity';
import { BrokerAccount } from '../entities/broker-account.entity';
import { BrokerFactoryService } from '../brokers/broker-factory.service';
import { IndicatorCalculator } from '../indicators/supertrend.util';
import { OptionsUtil } from '../market-data/options.util';
import { StrategyGateway } from './strategy.gateway';
import { IBrokerAdapter, PositionInfo, OptionContract } from '../brokers/broker.interface';
import { EmailService } from '../email/email.service';
export interface TriggerExecutionOptions {
  force?: boolean;
  forceAverageDown?: boolean;
  futureOrderType?: 'limit' | 'market';
  futureLimitPrice?: number;
  optionOrderType?: 'limit' | 'market';
  optionLimitPrice?: number;
}

@Injectable()
export class StrategyEngineService {
  private readonly logger = new Logger(StrategyEngineService.name);

  constructor(
    @InjectRepository(Strategy)
    private readonly strategyRepo: Repository<Strategy>,
    @InjectRepository(TradeLog)
    private readonly tradeLogRepo: Repository<TradeLog>,
    @InjectRepository(BrokerAccount)
    private readonly brokerRepo: Repository<BrokerAccount>,
    private readonly brokerFactory: BrokerFactoryService,
    private readonly gateway: StrategyGateway,
    private readonly email: EmailService,
  ) {}

  /**
   * Resolves the broker adapter assigned to this strategy
   */
  private async getAdapterForStrategy(strategy: Strategy): Promise<{ adapter: IBrokerAdapter; account: BrokerAccount }> {
    const account = await this.brokerRepo.findOne({ where: { id: strategy.brokerAccountId } });
    if (!account) {
      throw new Error(`Broker account ${strategy.brokerAccountId} not found for strategy ${strategy.name}`);
    }
    const adapter = await this.brokerFactory.getAdapter(account);
    return { adapter, account };
  }

  /**
   * Determines market regime (BULLISH vs NOT BULLISH) using 4H Supertrend
   */
  async determineMarketRegime(
    adapter: IBrokerAdapter,
    symbol: string,
  ): Promise<{ isBullish: boolean; trend: string; value: number }> {
    try {
      const candles = await adapter.getCandles(symbol, '4h', 100);
      const supertrend = IndicatorCalculator.calculateSupertrend(candles, 10, 3);
      const isBullish = supertrend.trend === 'BULLISH';
      return {
        isBullish,
        trend: supertrend.trend,
        value: supertrend.value,
      };
    } catch (err: any) {
      this.logger.error(`Error calculating 4H Supertrend: ${err.message}`);
      return { isBullish: true, trend: 'BULLISH', value: 0 };
    }
  }

  /**
   * Resolves configured Margin Mode ('portfolio' | 'isolated' | 'cross')
   */
  private getMarginMode(strategy: Strategy): 'portfolio' | 'isolated' | 'cross' {
    const raw = (strategy.marginMode || strategy.legsConfig?.marginMode || 'PORTFOLIO').toLowerCase();
    if (raw === 'isolated') return 'isolated';
    if (raw === 'cross') return 'cross';
    return 'portfolio';
  }

  /**
   * Returns true when an option symbol / expiry string refers to a contract expiring TODAY.
   * Delta option symbols carry a 6-digit DDMMYY expiry code (e.g. "C-BTC-95000-070926").
   */
  private isExpiringToday(symbol?: string, expiryDate?: string): boolean {
    const todayCode = OptionsUtil.getNextDayExpiry(0).codeString;

    if (symbol) {
      const parts = symbol.split('-');
      if (parts.length >= 4 && OptionsUtil.normalizeExpiryCode(parts[3]) === todayCode) {
        return true;
      }
    }

    if (expiryDate && OptionsUtil.normalizeExpiryCode(expiryDate) === todayCode) {
      return true;
    }

    return false;
  }

  /**
   * Core scheduled trigger evaluation at 3:30 PM IST every day (or manual trigger from UI)
   *
   * USER RULES:
   * 1. Check if there is any current position running for future.
   * 2. If NO running position (Fresh Entry):
   *    - Bullish: Buy 2 lots (0.002 BTC) Future + Short 2 lots ATM next-day Call.
   *    - Not Bullish: Buy 1 lot (0.001 BTC) Future + Short 1 lot ATM next-day Call.
   * 3. If running position EXISTS:
   *    - Check from the buying strike how much percent it is down:
   *      Drawdown % = (Mark - Buying Strike) / Buying Strike * 100
   *    - If down by 1% or more (<= -1.0%):
   *      - Buy 2 lots ATM strike future BTC
   *      - Short 2 lots ATM strike next-day call option
   */
  /**
   * Pre-execution preview of what orders would be sent to the broker.
   * Used for the frontend confirmation popup modal.
   */
  async getTriggerPreview(strategyId: string) {
    const strategy = await this.strategyRepo.findOne({ where: { id: strategyId } });
    if (!strategy) throw new NotFoundException(`Strategy ${strategyId} not found`);

    const { adapter, account } = await this.getAdapterForStrategy(strategy);
    const symbol = strategy.symbol || 'BTCUSD';
    const ticker = await adapter.getTicker(symbol);
    const currentMark = ticker.mark;
    const { underlying, strikeInterval } = OptionsUtil.getUnderlyingAndStrikeInterval(symbol, currentMark);
    const atmStrike = OptionsUtil.roundToNearestStrike(currentMark, strikeInterval);

    const expiry = OptionsUtil.getNextDayExpiry(1);
    let chain: any[] = [];
    try {
      chain = await adapter.getOptionChain(underlying, expiry.codeString);
    } catch (e) {
      this.logger.warn(`Failed to fetch option chain for preview: ${e}`);
    }
    const matchingCall = OptionsUtil.findMatchingCall(chain, atmStrike, expiry.codeString);
    const otmCall = OptionsUtil.findNearestOtmCall(chain, currentMark, expiry.codeString);

    const { isBullish, trend } = await this.determineMarketRegime(adapter, symbol);

    const hasFuture = !!strategy.state?.futurePosition && strategy.state.futurePosition.size > 0;
    const configFutureLots = strategy.legsConfig?.futureLeg?.size || 2;
    const configOptionLots = strategy.legsConfig?.optionLeg?.size || configFutureLots;

    let actionType: 'FRESH_ENTRY' | 'DRAWDOWN_AVERAGING' | 'SELL_CALL_ROUTINE' = 'FRESH_ENTRY';
    let futureLots = configFutureLots;
    let optionLots = configOptionLots;
    let drawdownPercent = 0;
    let buyingStrike = 0;
    let reasonText = '';
    let selectedCall: OptionContract | null = matchingCall;

    if (!hasFuture) {
      actionType = 'FRESH_ENTRY';
      futureLots = configFutureLots;
      optionLots = configOptionLots;
      reasonText = `No running future position -> Fresh Entry: buy ${futureLots} lots ATM Future + sell ${optionLots} lots next-day Call @ same strike $${atmStrike}. (4H Supertrend is ${trend}, informational only.)`;
      selectedCall = matchingCall;
    } else {
      buyingStrike = strategy.state.buyingStrike || strategy.state.futurePosition!.entryPrice;
      drawdownPercent = ((currentMark - buyingStrike) / buyingStrike) * 100;

      if (drawdownPercent <= -1.0) {
        actionType = 'DRAWDOWN_AVERAGING';
        futureLots = configFutureLots;
        optionLots = configOptionLots;
        reasonText = `Future is down ${drawdownPercent.toFixed(2)}% from buying strike $${buyingStrike.toLocaleString()} (>= 1% drawdown) -> Add averaging layer (+${futureLots} lots Fut & +${optionLots} lots Opt).`;
        selectedCall = matchingCall;
      } else {
        actionType = 'SELL_CALL_ROUTINE';
        futureLots = 0;

        const previewOpt = strategy.state.optionPosition;
        const futurePositionLots = strategy.state.futurePosition?.size || 0;
        let heldCallLots =
          previewOpt && !this.isExpiringToday(previewOpt.symbol, previewOpt.expiryDate) ? previewOpt.size : 0;
        try {
          const livePositions = await adapter.getPositions();
          const openOpt = livePositions.find(
            (p) =>
              p.symbol.startsWith('C-') &&
              p.side === 'sell' &&
              p.size !== 0 &&
              !this.isExpiringToday(p.symbol),
          );
          if (openOpt) {
            heldCallLots = Math.max(heldCallLots, Math.abs(openOpt.size));
          }
        } catch {
          // ignore
        }

        const maxCallsPerFuture = Math.max(1, strategy.legsConfig?.maxCallsPerFutureLot || 1);
        const maxShortCalls = futurePositionLots * maxCallsPerFuture;
        const availableToShort = Math.max(0, maxShortCalls - heldCallLots);
        if (availableToShort <= 0) {
          optionLots = 0;
          selectedCall = null;
          reasonText = `Future down ${drawdownPercent.toFixed(2)}% (< 1%). Future (${futurePositionLots} lot${futurePositionLots > 1 ? 's' : ''}) already carries ${heldCallLots} short Call contract${heldCallLots > 1 ? 's' : ''}, the configured maximum of ${maxShortCalls} (${maxCallsPerFuture} per future lot). Holding position (no order placed).`;
        } else {
          optionLots = Math.min(configOptionLots, availableToShort);

          const existingCallStrike =
            previewOpt && !this.isExpiringToday(previewOpt.symbol, previewOpt.expiryDate)
              ? previewOpt.strike
              : undefined;
          const routineChoice = OptionsUtil.selectRoutineCallOption(
            chain,
            currentMark,
            atmStrike,
            existingCallStrike,
            expiry.codeString,
          );
          selectedCall = routineChoice.option;

          if (routineChoice.isAtmMatch) {
            reasonText = `Future down ${drawdownPercent.toFixed(2)}% (< 1%). Shorting ${optionLots} lot Call [ATM strike $${atmStrike} matches held Call strike $${existingCallStrike}, not going for OTM].`;
          } else {
            reasonText = `Future down ${drawdownPercent.toFixed(2)}% (< 1%). Shorting ${optionLots} lot Call [nearest OTM strike $${selectedCall?.strike || atmStrike}].`;
          }
        }
      }
    }

    return {
      strategyId: strategy.id,
      strategyName: strategy.name,
      symbol,
      underlying,
      currentMark,
      futureBid: ticker.bid || currentMark,
      futureAsk: ticker.ask || currentMark,
      atmStrike,
      expiryDate: expiry.dateString,
      expiryCode: expiry.codeString,
      trend,
      isBullish,
      actionType,
      buyingStrike,
      drawdownPercent,
      reasonText,
      hasMatchingOption: !!selectedCall,
      optionSymbol: selectedCall?.symbol || `C-${underlying}-${atmStrike}-${expiry.codeString}`,
      optionPremium: selectedCall ? (selectedCall.bid || selectedCall.mark || 0) : 0,
      optionBid: selectedCall?.bid || 0,
      optionAsk: selectedCall?.ask || 0,
      optionMark: selectedCall?.mark || 0,
      futureLots,
      optionLots,
      brokerName: account.name,
      brokerType: account.brokerType,
    };
  }

  /**
   * Core scheduled trigger evaluation at 3:30 PM IST every day (or manual trigger from UI).
   * Supports atomic execution with automatic rollback.
   */
  async evaluateStrategyTrigger(
    strategyId: string,
    options?: boolean | TriggerExecutionOptions,
  ): Promise<{ success: boolean; message: string; rolledBack?: boolean }> {
    const opts: TriggerExecutionOptions = typeof options === 'boolean' ? { force: options } : (options || {});
    const force = opts.force ?? false;
    const strategy = await this.strategyRepo.findOne({ where: { id: strategyId } });
    if (!strategy || strategy.status !== 'ACTIVE') {
      return { success: false, message: 'Strategy is not active or not found' };
    }

    try {
      const { adapter, account } = await this.getAdapterForStrategy(strategy);
      const symbol = strategy.symbol || 'BTCUSD';

      // 1. Fetch current price
      const ticker = await adapter.getTicker(symbol);
      this.gateway.broadcastPriceUpdate({ symbol, price: ticker.last, markPrice: ticker.mark });

      // 2. Evaluate 4H Supertrend
      const { isBullish, trend, value } = await this.determineMarketRegime(adapter, symbol);
      this.gateway.broadcastIndicatorStatus({
        strategyId: strategy.id,
        trend,
        value,
        lastChecked: new Date().toISOString(),
      });

      // Initialize state if empty
      if (!strategy.state) {
        strategy.state = {
          stage: 'IDLE',
          totalRealizedPnl: 0,
        };
      }
      strategy.state.marketRegime = isBullish ? 'BULLISH' : 'NOT_BULLISH';

      const hasFuture = !!strategy.state.futurePosition && strategy.state.futurePosition.size > 0;

      // Base configured lots from strategy.legsConfig
      const configFutureLots = strategy.legsConfig?.futureLeg?.size || 2;
      const configOptionLots = strategy.legsConfig?.optionLeg?.size || configFutureLots;

      let resultMessage = '';

      // CASE A: No future position currently running -> Fresh 3:30 PM Entry
      if (!hasFuture) {
        // USER RULE: fresh entry always uses the configured lots - buy the ATM future and sell the
        // next-day Call at that same strike. The 4H Supertrend is still evaluated and reported to the
        // UI (state.marketRegime / indicator-status) but does NOT size the position.
        const futureLots = configFutureLots;
        const optionLots = configOptionLots;
        this.logger.log(
          `Fresh Entry for [${strategy.name}]: Placing ${futureLots} lots Future + ${optionLots} lots next-day ATM Call for ${symbol} (market is ${trend}, informational only)...`,
        );

        resultMessage = await this.executeCoveredCallEntry(
          strategy,
          adapter,
          account,
          ticker.mark,
          futureLots,
          optionLots,
          isBullish,
          opts,
        );
      }
      // CASE B: Running future position ALREADY exists -> Check Drawdown from Buying Strike
      else {
        const buyingStrike = strategy.state.buyingStrike || strategy.state.futurePosition!.entryPrice;
        const drawdownPercent = ((ticker.mark - buyingStrike) / buyingStrike) * 100;
        strategy.state.drawdownPercent = drawdownPercent;

        this.logger.log(
          `Drawdown Check for [${strategy.name}]: Buying strike = $${buyingStrike}, Mark = $${ticker.mark}, Drawdown = ${drawdownPercent.toFixed(2)}%`,
        );

        // RULE:
        // 1. If down by 1% or more (<= -1.0%), buy configured lots ATM future + short configured lots next-day call
        // 2. If NOT down by 1% or more (> -1.0%), do NOT buy future lots; ONLY short next-day OTM Call!
        if (drawdownPercent <= -1.0 || opts.forceAverageDown) {
          this.logger.warn(
            `Trigger: Future down ${drawdownPercent.toFixed(2)}% (${drawdownPercent <= -1.0 ? '>= 1% drawdown' : 'force average down'}). Buying ${configFutureLots} lots ATM Future + Shorting ${configOptionLots} lots next-day Call!`,
          );
          resultMessage = await this.executeDrawdownAveraging(
            strategy,
            adapter,
            account,
            ticker.mark,
            configFutureLots,
            configOptionLots,
            opts,
          );
        } else {
          this.logger.log(
            `Trigger: Future down ${drawdownPercent.toFixed(2)}% (< 1% threshold). Not buying future; running routine Call sell (${configOptionLots} lots)...`,
          );
          resultMessage = await this.executeRoutineCallSell(
            strategy,
            adapter,
            account,
            ticker.mark,
            configOptionLots,
            drawdownPercent,
            opts,
          );
        }
      }

      this.gateway.broadcastStrategyUpdate(strategy);
      return { success: true, message: resultMessage };
    } catch (err: any) {
      const isRollback = err.message?.includes('rolled back') || err.message?.includes('rollback');
      const cleanErrMsg = err.message || 'Strategy execution failed';
      this.logger.error(`Error evaluating strategy trigger for ${strategy.name}: ${cleanErrMsg}`);

      if (strategy.state) {
        strategy.state.lastMessage = `Order Failed: ${cleanErrMsg}`;
        strategy.state.lastEvaluatedAt = new Date().toISOString();
        try {
          await this.strategyRepo.save(strategy);
          this.gateway.broadcastStrategyUpdate(strategy);
        } catch (saveErr: any) {
          this.logger.error(`Failed to persist error state: ${saveErr.message}`);
        }
      }

      return {
        success: false,
        message: cleanErrMsg,
        rolledBack: isRollback,
      };
    }
  }

  /**
   * Executes Fresh Covered Call Entry ATOMICALLY:
   * 1. Looks up next-day ATM Call BEFORE sending any order.
   * 2. Buys Future (configured lots).
   * 3. Shorts Next-Day ATM Call.
   * 4. IF OPTION FAILS -> IMMEDIATELY ROLLS BACK FUTURE BUY ORDER!
   * 5. COMMITS ONLY UPON FULL SUCCESS.
   */
  private async executeCoveredCallEntry(
    strategy: Strategy,
    adapter: IBrokerAdapter,
    account: BrokerAccount,
    currentMark: number,
    futureLots: number,
    optionLots: number,
    isBullish: boolean,
    opts?: TriggerExecutionOptions,
  ): Promise<string> {
    const symbol = strategy.symbol || 'BTCUSD';
    const { underlying, strikeInterval } = OptionsUtil.getUnderlyingAndStrikeInterval(symbol, currentMark);
    const atmStrike = OptionsUtil.roundToNearestStrike(currentMark, strikeInterval);

    // STEP 1: Pre-flight lookup of next-day ATM Call option
    const expiry = OptionsUtil.getNextDayExpiry(1);
    const chain = await adapter.getOptionChain(underlying, expiry.codeString);
    const matchingCall = OptionsUtil.findMatchingCall(chain, atmStrike, expiry.codeString);

    const isOptionEnabled = strategy.legsConfig?.optionLeg?.enabled !== false && optionLots > 0;
    const hasOptionsMarket = chain && chain.length > 0;

    // Only abort if options ARE traded on the broker for this asset but no matching strike was found
    if (isOptionEnabled && hasOptionsMarket && !matchingCall) {
      const abortMsg = `Pre-flight lookup failed: No next-day Call found for strike $${atmStrike} (${expiry.codeString} / ${expiry.dateString}). Order aborted without placing future leg.`;
      this.logger.warn(`[${strategy.name}] ${abortMsg}`);
      strategy.state.lastMessage = abortMsg;
      await this.strategyRepo.save(strategy);
      throw new Error(abortMsg);
    }

    if (!hasOptionsMarket) {
      this.logger.log(
        `[${strategy.name}] Notice: No options contracts listed on ${account.brokerType} for ${underlying}. Operating in Future-Only mode (${futureLots} lots ${symbol}).`,
      );
    }

    // STEP 2: Place Future Buy Order (Limit by default)
    const futureOrderType = opts?.futureOrderType || 'limit';
    const futurePrice = futureOrderType === 'limit'
      ? (opts?.futureLimitPrice && opts.futureLimitPrice > 0 ? opts.futureLimitPrice : currentMark)
      : undefined;

    const marginMode = this.getMarginMode(strategy);
    this.logger.log(
      `[${strategy.name}] Placing BUY Future order (${futureOrderType.toUpperCase()}${futurePrice ? ` @ $${futurePrice}` : ''}, margin: ${marginMode.toUpperCase()}) for ${futureLots} lots ${symbol}...`,
    );
    const futureOrder = await adapter.placeOrder({
      symbol,
      side: 'buy',
      orderType: futureOrderType,
      price: futurePrice,
      size: futureLots,
      marginMode,
    });

    if (!futureOrder || futureOrder.status === 'rejected') {
      const failMsg = futureOrder?.message || 'Future buy order rejected by broker';
      this.logger.error(`[${strategy.name}] Future order rejected: ${failMsg}`);
      await this.logTrade(strategy,
        account.brokerType,
        symbol,
        'BUY_FUTURE_FAILED',
        currentMark,
        futureLots,
        `Broker rejected future order: ${failMsg}. No positions opened.`,
      );
      throw new Error(`Future buy order rejected: ${failMsg}`);
    }

    const entryPrice = futureOrder.averagePrice > 0 ? futureOrder.averagePrice : (futurePrice || currentMark);

    // STEP 3: Place Option Sell Order with Compensatory Rollback (if options available)
    let optionOrder: any;
    if (isOptionEnabled && hasOptionsMarket && matchingCall) {
      try {
        const optionOrderType = opts?.optionOrderType || 'limit';
        const optionPrice = optionOrderType === 'limit'
          ? (opts?.optionLimitPrice && opts.optionLimitPrice > 0 ? opts.optionLimitPrice : (matchingCall.bid || matchingCall.mark))
          : undefined;

        this.logger.log(
          `[${strategy.name}] Placing SELL Call order (${optionOrderType.toUpperCase()}${optionPrice ? ` @ $${optionPrice}` : ''}, margin: ${marginMode.toUpperCase()}) for ${optionLots} lots ${matchingCall.symbol}...`,
        );
        optionOrder = await adapter.placeOrder({
          symbol: matchingCall.symbol,
          productId: matchingCall.productId,
          side: 'sell',
          orderType: optionOrderType,
          price: optionPrice,
          size: optionLots,
          marginMode,
        });

        if (!optionOrder || optionOrder.status === 'rejected') {
          throw new Error(optionOrder?.message || 'Broker rejected option sell order');
        }
      } catch (optionErr: any) {
        // CRITICAL ROLLBACK: Option leg failed -> reverse future buy order!
        this.logger.error(
          `🚨 [${strategy.name}] Option order failed (${optionErr.message})! INITIATING IMMEDIATE ROLLBACK OF FUTURE LEG...`,
        );

        await this.logTrade(strategy,
          account.brokerType,
          symbol,
          'ROLLBACK_TRIGGERED',
          entryPrice,
          futureLots,
          `🚨 Option leg failed (${optionErr.message}). Initiating rollback: selling ${futureLots} lots of ${symbol}...`,
        );

        try {
          const rbRes = await adapter.placeOrder({
            symbol,
            side: 'sell',
            orderType: 'market',
            size: futureLots,
            marginMode,
          });
          const rbPrice = rbRes.averagePrice > 0 ? rbRes.averagePrice : entryPrice;

          await this.logTrade(strategy,
            account.brokerType,
            symbol,
            'ROLLBACK_SUCCESSFUL',
            rbPrice,
            futureLots,
            `✅ Rollback Successful: Sold ${futureLots} lots ${symbol} @ $${rbPrice.toFixed(2)}. Account exposure neutralized. Zero positions committed to dashboard.`,
          );
        } catch (rbErr: any) {
          this.logger.error(`🚨 FATAL: Rollback sell order failed: ${rbErr.message}`);
          await this.logTrade(strategy,
            account.brokerType,
            symbol,
            'ROLLBACK_FAILED',
            entryPrice,
            futureLots,
            `⚠️ CRITICAL ROLLBACK FAILURE: Could not sell future (${rbErr.message}). Immediate manual square off required!`,
          );
        }

        // Do NOT commit state to database!
        strategy.state.lastMessage = `Order aborted & rolled back: Option leg failed (${optionErr.message}). Future order was reversed.`;
        await this.strategyRepo.save(strategy);
        throw new Error(
          `Order failed and rolled back: Option leg failed (${optionErr.message}). Future buy was automatically reversed so no unhedged position exists. Zero positions committed.`,
        );
      }
    }

    // STEP 4: COMMIT STATE TO DATABASE & DASHBOARD
    await this.logTrade(strategy,
      account.brokerType,
      symbol,
      'BUY_FUTURE_ENTRY',
      entryPrice,
      futureLots,
      `Fresh Entry: Bought ${futureLots} lots ${symbol} Future @ $${entryPrice.toFixed(2)} [Market: ${isBullish ? 'BULLISH' : 'NOT_BULLISH'}]`,
    );

    if (matchingCall && optionOrder) {
      const entryPremium = optionOrder.averagePrice > 0
        ? optionOrder.averagePrice
        : (opts?.optionLimitPrice && opts.optionLimitPrice > 0 ? opts.optionLimitPrice : (matchingCall.bid || matchingCall.mark));

      await this.logTrade(strategy,
        account.brokerType,
        matchingCall.symbol,
        'SELL_CALL_ENTRY',
        entryPremium,
        optionLots,
        `Fresh Entry: Shorted ${optionLots} lots next-day Call @ strike $${matchingCall.strike} (Premium: $${entryPremium.toFixed(2)})`,
      );

      strategy.state.optionPosition = {
        symbol: matchingCall.symbol,
        productId: matchingCall.productId,
        side: 'sell',
        strike: matchingCall.strike,
        size: optionLots,
        entryPremium,
        currentPremium: entryPremium,
        pnlPercent: 0,
        expiryDate: expiry.dateString,
        rollCount: 0,
        entryTimestamp: new Date().toISOString(),
      };
    } else {
      strategy.state.optionPosition = null;
    }

    strategy.state.futurePosition = {
      symbol,
      productId: symbol,
      side: 'buy',
      size: futureLots,
      entryPrice,
      currentPrice: entryPrice,
      pnlPercent: 0,
      entryTimestamp: new Date().toISOString(),
    };
    strategy.state.buyingStrike = entryPrice;
    strategy.state.lastAveragedPrice = entryPrice;
    strategy.state.drawdownPercent = 0;
    strategy.state.layers = [
      {
        price: entryPrice,
        size: futureLots,
        timestamp: new Date().toISOString(),
        action: `INITIAL_ENTRY_${isBullish ? 'BULLISH' : 'BEARISH'}_${futureLots}_LOTS`,
      },
    ];

    strategy.state.stage = 'IN_POSITION';
    const successMsg = (matchingCall && optionOrder)
      ? `Covered Call active: ${futureLots} lots ${symbol} Future @ $${entryPrice.toFixed(2)} & strike $${atmStrike} Call (${optionLots} lots)`
      : `Strategy active: ${futureLots} lots ${symbol} Future @ $${entryPrice.toFixed(2)} (Future-Only: no options listed for ${underlying} on ${account.brokerType})`;
    strategy.state.lastMessage = successMsg;
    strategy.state.lastEvaluatedAt = new Date().toISOString();

    await this.strategyRepo.save(strategy);
    return successMsg;
  }

  /**
   * Executes 3:30 PM Drawdown Averaging ATOMICALLY:
   * 1. Looks up next-day ATM Call BEFORE sending any order.
   * 2. Buys ATM future (averaging lots).
   * 3. Shorts next-day ATM Call.
   * 4. IF OPTION FAILS -> ROLLS BACK THE AVERAGING FUTURE BUY ORDER!
   * 5. COMMITS ONLY UPON FULL SUCCESS.
   */
  private async executeDrawdownAveraging(
    strategy: Strategy,
    adapter: IBrokerAdapter,
    account: BrokerAccount,
    currentMark: number,
    futureLots: number = 2,
    optionLots: number = 2,
    opts?: TriggerExecutionOptions,
  ): Promise<string> {
    const symbol = strategy.symbol || 'BTCUSD';
    const { underlying, strikeInterval } = OptionsUtil.getUnderlyingAndStrikeInterval(symbol, currentMark);
    const atmStrike = OptionsUtil.roundToNearestStrike(currentMark, strikeInterval);

    // STEP 1: Pre-flight lookup of next-day ATM Call option
    const expiry = OptionsUtil.getNextDayExpiry(1);
    const chain = await adapter.getOptionChain(underlying, expiry.codeString);
    const atmCall = OptionsUtil.findMatchingCall(chain, atmStrike, expiry.codeString);

    const isOptionEnabled = strategy.legsConfig?.optionLeg?.enabled !== false && optionLots > 0;
    const hasOptionsMarket = chain && chain.length > 0;

    // Only abort if options ARE traded on the broker for this asset but no matching strike was found
    if (isOptionEnabled && hasOptionsMarket && !atmCall) {
      const abortMsg = `Pre-flight lookup failed: No next-day Call found for strike $${atmStrike} (${expiry.codeString} / ${expiry.dateString}). Averaging aborted without placing future leg.`;
      this.logger.warn(`[${strategy.name}] ${abortMsg}`);
      strategy.state.lastMessage = abortMsg;
      await this.strategyRepo.save(strategy);
      throw new Error(abortMsg);
    }

    if (!hasOptionsMarket) {
      this.logger.log(
        `[${strategy.name}] Notice: No options contracts listed on ${account.brokerType} for ${underlying}. Operating in Future-Only averaging mode (${futureLots} lots ${symbol}).`,
      );
    }

    // STEP 2: Place Future Buy Averaging Order (Limit by default)
    const futureOrderType = opts?.futureOrderType || 'limit';
    const futurePrice = futureOrderType === 'limit'
      ? (opts?.futureLimitPrice && opts.futureLimitPrice > 0 ? opts.futureLimitPrice : currentMark)
      : undefined;

    const marginMode = this.getMarginMode(strategy);
    this.logger.log(
      `[${strategy.name}] Placing Averaging BUY Future order (${futureOrderType.toUpperCase()}${futurePrice ? ` @ $${futurePrice}` : ''}, margin: ${marginMode.toUpperCase()}) for ${futureLots} lots ${symbol}...`,
    );
    const futureOrder = await adapter.placeOrder({
      symbol,
      side: 'buy',
      orderType: futureOrderType,
      price: futurePrice,
      size: futureLots,
      marginMode,
    });

    if (!futureOrder || futureOrder.status === 'rejected') {
      const failMsg = futureOrder?.message || 'Broker rejected future averaging order';
      this.logger.error(`[${strategy.name}] Future averaging order rejected: ${failMsg}`);
      await this.logTrade(strategy,
        account.brokerType,
        symbol,
        'BUY_FUTURE_FAILED',
        currentMark,
        futureLots,
        `Drawdown Averaging Failed: Future buy rejected (${failMsg}). No averaging committed.`,
      );
      throw new Error(`Future averaging order rejected: ${failMsg}`);
    }

    const buyPrice = futureOrder.averagePrice > 0 ? futureOrder.averagePrice : (futurePrice || currentMark);

    // STEP 3: Place Option Sell Order with Compensatory Rollback (if options available)
    let optionOrder: any;
    if (isOptionEnabled && hasOptionsMarket && atmCall) {
      try {
        const optionOrderType = opts?.optionOrderType || 'limit';
        const optionPrice = optionOrderType === 'limit'
          ? (opts?.optionLimitPrice && opts.optionLimitPrice > 0 ? opts.optionLimitPrice : (atmCall.bid || atmCall.mark))
          : undefined;

        this.logger.log(
          `[${strategy.name}] Placing Averaging SELL Call order (${optionOrderType.toUpperCase()}${optionPrice ? ` @ $${optionPrice}` : ''}, margin: ${marginMode.toUpperCase()}) for ${optionLots} lots ${atmCall.symbol}...`,
        );
        optionOrder = await adapter.placeOrder({
          symbol: atmCall.symbol,
          productId: atmCall.productId,
          side: 'sell',
          orderType: optionOrderType,
          price: optionPrice,
          size: optionLots,
          marginMode,
        });

        if (!optionOrder || optionOrder.status === 'rejected') {
          throw new Error(optionOrder?.message || 'Broker rejected averaging option sell order');
        }
      } catch (optionErr: any) {
        this.logger.error(
          `🚨 [${strategy.name}] Averaging option order failed (${optionErr.message})! INITIATING IMMEDIATE ROLLBACK...`,
        );

        await this.logTrade(strategy,
          account.brokerType,
          symbol,
          'ROLLBACK_TRIGGERED',
          buyPrice,
          futureLots,
          `🚨 Averaging option leg failed (${optionErr.message}). Initiating rollback: selling ${futureLots} lots of ${symbol}...`,
        );

        try {
          const rbRes = await adapter.placeOrder({
            symbol,
            side: 'sell',
            orderType: 'market',
            size: futureLots,
            marginMode,
          });
          const rbPrice = rbRes.averagePrice > 0 ? rbRes.averagePrice : buyPrice;

          await this.logTrade(strategy,
            account.brokerType,
            symbol,
            'ROLLBACK_SUCCESSFUL',
            rbPrice,
            futureLots,
            `✅ Rollback Successful: Sold ${futureLots} lots ${symbol} @ $${rbPrice.toFixed(2)}. Averaging cancelled, state untouched.`,
          );
        } catch (rbErr: any) {
          this.logger.error(`🚨 FATAL: Rollback order failed: ${rbErr.message}`);
          await this.logTrade(strategy,
            account.brokerType,
            symbol,
            'ROLLBACK_FAILED',
            buyPrice,
            futureLots,
            `⚠️ CRITICAL ROLLBACK FAILURE: Could not sell averaging future (${rbErr.message})!`,
          );
        }

        strategy.state.lastMessage = `Averaging aborted & rolled back: Option leg failed (${optionErr.message}). Averaging future order was reversed.`;
        await this.strategyRepo.save(strategy);
        throw new Error(
          `Averaging order failed & rolled back: Option leg failed (${optionErr.message}). Future order was reversed. Strategy state untouched.`,
        );
      }
    }

    // STEP 4: COMMIT AVERAGING TRANCHE
    const existing = strategy.state.futurePosition!;
    const oldQty = existing.size;
    const oldEntry = existing.entryPrice;
    const combinedQty = oldQty + futureLots;
    const newAvgEntry = ((oldEntry * oldQty) + (buyPrice * futureLots)) / combinedQty;

    existing.size = combinedQty;
    existing.entryPrice = newAvgEntry;
    existing.currentPrice = buyPrice;
    existing.pnlPercent = ((currentMark - newAvgEntry) / newAvgEntry) * 100;

    // Re-base the 1% drawdown reference onto the new weighted-average entry, so the NEXT averaging
    // layer requires a further 1% drop from here. Without this the trigger would keep adding a layer
    // on every run for as long as price stayed 1% below the original entry.
    strategy.state.buyingStrike = newAvgEntry;
    strategy.state.drawdownPercent = ((currentMark - newAvgEntry) / newAvgEntry) * 100;

    await this.logTrade(strategy,
      account.brokerType,
      symbol,
      'BUY_FUTURE_AVERAGING',
      buyPrice,
      futureLots,
      `3:30 PM Drawdown Averaging: Bought ${futureLots} lots Future @ $${buyPrice.toFixed(2)}. New Avg Price: $${newAvgEntry.toFixed(2)} (Total ${combinedQty} lots)`,
    );

    if (atmCall && optionOrder) {
      const entryPremium = optionOrder.averagePrice > 0
        ? optionOrder.averagePrice
        : (opts?.optionLimitPrice && opts.optionLimitPrice > 0 ? opts.optionLimitPrice : (atmCall.bid || atmCall.mark));

      strategy.state.optionPosition = {
        symbol: atmCall.symbol,
        productId: atmCall.productId,
        side: 'sell',
        strike: atmCall.strike,
        size: (strategy.state.optionPosition?.size || 0) + optionLots,
        entryPremium,
        currentPremium: entryPremium,
        pnlPercent: 0,
        expiryDate: expiry.dateString,
        rollCount: (strategy.state.optionPosition?.rollCount ?? strategy.state.lastRollCount ?? 0) + 1,
        entryTimestamp: new Date().toISOString(),
      };

      await this.logTrade(strategy,
        account.brokerType,
        atmCall.symbol,
        'SELL_CALL_AVERAGING',
        entryPremium,
        optionLots,
        `3:30 PM Drawdown Averaging: Shorted ${optionLots} lots next-day Call @ strike $${atmCall.strike}`,
      );
    }

    if (!strategy.state.layers) strategy.state.layers = [];
    strategy.state.layers.push({
      price: buyPrice,
      size: futureLots,
      timestamp: new Date().toISOString(),
      action: `DRAWDOWN_1PCT_AVERAGING_${futureLots}_LOTS`,
    });
    strategy.state.lastAveragedPrice = buyPrice;
    const successMsg = `3:30 PM: Future down >= 1%. Added ${futureLots} lots Future & Shorted ${optionLots} lots Call @ strike $${atmStrike}`;
    strategy.state.lastMessage = successMsg;
    strategy.state.lastEvaluatedAt = new Date().toISOString();

    await this.strategyRepo.save(strategy);
    return successMsg;
  }

  /**
   * Executes Routine Call Selling (When Drawdown < 1%):
   * When future position exists and drawdown is NOT >= 1% (i.e. drawdownPercent > -1.0%),
   * do NOT buy any future contracts.
   *
   * USER RULE:
   * "if the atm call option of next day match the strike of call option then dont go for otm"
   * 1. If next-day ATM strike matches the held Call option strike -> sell that ATM Call (do not go for OTM).
   * 2. If it does not match (or no existing call) -> sell the nearest OTM Call.
   *
   * NOTE: Calls expiring TODAY never count as a held Call here - a call this close to expiry
   * offers no forward coverage, so it's excluded from the ratio-cap count and the strike reference
   * even though it's left open to expire naturally (this engine does not buy it back). That means
   * a routine trigger can short a next-day Call while today's expiring Call is still on the book -
   * the two coexist briefly until today's Call expires or is settled by the exchange.
   */
  private async executeRoutineCallSell(
    strategy: Strategy,
    adapter: IBrokerAdapter,
    account: BrokerAccount,
    currentMark: number,
    optionLots: number = 1,
    drawdownPercent: number,
    opts?: TriggerExecutionOptions,
  ): Promise<string> {
    const symbol = strategy.symbol || 'BTCUSD';
    const { underlying, strikeInterval } = OptionsUtil.getUnderlyingAndStrikeInterval(symbol, currentMark);
    const atmStrike = OptionsUtil.roundToNearestStrike(currentMark, strikeInterval);
    const freqDesc = strategy.triggerConfig?.frequency === 'MINUTES'
      ? `Every ${strategy.triggerConfig.intervalValue || 1}m`
      : strategy.triggerConfig?.frequency === 'HOURLY'
      ? `Every ${strategy.triggerConfig.intervalValue || 1}h`
      : strategy.triggerConfig?.frequency === 'EVERY_N_DAYS'
      ? `Every ${strategy.triggerConfig.intervalValue || 3}d`
      : 'Daily';

    const isOptionEnabled = strategy.legsConfig?.optionLeg?.enabled !== false && optionLots > 0;
    if (!isOptionEnabled) {
      const skipMsg = `Routine check (${freqDesc}): Drawdown is ${drawdownPercent.toFixed(2)}% (< 1%). Option selling disabled or 0 lots configured. Holding positions.`;
      this.logger.log(`[${strategy.name}] ${skipMsg}`);
      strategy.state.lastMessage = skipMsg;
      strategy.state.lastEvaluatedAt = new Date().toISOString();
      await this.strategyRepo.save(strategy);
      return skipMsg;
    }

    // Step 1: Detect existing Call strike from state or live broker positions.
    // Calls expiring TODAY are ignored throughout: they are rolled out at trigger time and no
    // longer cover the future going forward, so they must not block the next-day Call sell.
    const statedOpt = strategy.state.optionPosition;
    let existingCallStrike: number | undefined =
      statedOpt && !this.isExpiringToday(statedOpt.symbol, statedOpt.expiryDate) ? statedOpt.strike : undefined;
    if (!existingCallStrike) {
      try {
        const livePositions = await adapter.getPositions();
        const openOption = livePositions.find(
          (p) => p.symbol.startsWith('C-') && p.size !== 0 && !this.isExpiringToday(p.symbol),
        );
        if (openOption) {
          const parts = openOption.symbol.split('-');
          if (parts.length >= 3 && !isNaN(Number(parts[2]))) {
            existingCallStrike = Number(parts[2]);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    // COVERED CALL RATIO ENFORCEMENT:
    // User Rule: "why you sell 6 short you only short the quantity of future you short"
    // Total short Call contracts must NEVER exceed total Future contracts held!
    const futureLots = strategy.state.futurePosition?.size || 0;
    let heldCallLots =
      statedOpt && !this.isExpiringToday(statedOpt.symbol, statedOpt.expiryDate) ? statedOpt.size : 0;

    // Check live positions on broker for real-time accuracy
    try {
      const livePositions = await adapter.getPositions();
      const openOpt = livePositions.find(
        (p) =>
          p.symbol.startsWith('C-') &&
          p.side === 'sell' &&
          p.size !== 0 &&
          !this.isExpiringToday(p.symbol),
      );
      if (openOpt) {
        heldCallLots = Math.max(heldCallLots, Math.abs(openOpt.size));
      }
    } catch (e) {
      // ignore
    }

    // USER RULE: short a Call whenever a future exists. The allowance is futureLots * maxCallsPerFutureLot.
    // Default 1 keeps the strict 1:1 covered call; higher values permit a ratio write where every Call
    // beyond the 1:1 line is NAKED. The cap exists so an intraday schedule cannot compound short Calls
    // without bound on every trigger.
    const maxCallsPerFuture = Math.max(1, strategy.legsConfig?.maxCallsPerFutureLot || 1);
    const maxShortCalls = futureLots * maxCallsPerFuture;
    const availableToShort = Math.max(0, maxShortCalls - heldCallLots);
    if (availableToShort <= 0) {
      const skipMsg = `Routine check (${freqDesc}): Drawdown is ${drawdownPercent.toFixed(2)}% (< 1%). Future (${futureLots} lot${futureLots > 1 ? 's' : ''}) already carries ${heldCallLots} short Call contract${heldCallLots > 1 ? 's' : ''}, which is the configured maximum of ${maxShortCalls} (${maxCallsPerFuture} per future lot). Holding position.`;
      this.logger.log(`[${strategy.name}] ${skipMsg}`);
      strategy.state.lastMessage = skipMsg;
      strategy.state.lastEvaluatedAt = new Date().toISOString();
      await this.strategyRepo.save(strategy);
      return skipMsg;
    }

    const actualOptionLots = Math.min(optionLots, availableToShort);

    // Step 2: Fetch next-day option chain & select Call according to user rule
    const expiry = OptionsUtil.getNextDayExpiry(1);
    const chain = await adapter.getOptionChain(underlying, expiry.codeString);
    const { option: targetCall, isAtmMatch } = OptionsUtil.selectRoutineCallOption(
      chain,
      currentMark,
      atmStrike,
      existingCallStrike,
      expiry.codeString,
    );

    if (!targetCall) {
      const abortMsg = `Routine check (${freqDesc}): Drawdown is ${drawdownPercent.toFixed(2)}% (< 1%). No suitable next-day Call found in option chain (${expiry.codeString} / ${expiry.dateString}). Holding positions.`;
      this.logger.warn(`[${strategy.name}] ${abortMsg}`);
      strategy.state.lastMessage = abortMsg;
      strategy.state.lastEvaluatedAt = new Date().toISOString();
      await this.strategyRepo.save(strategy);
      return abortMsg;
    }

    const strikeDesc = isAtmMatch
      ? `ATM strike $${targetCall.strike} (matches held Call strike $${existingCallStrike}, not going for OTM)`
      : `nearest OTM strike $${targetCall.strike} (next-day ATM $${atmStrike} does not match held Call $${existingCallStrike || 'none'})`;

    // Step 3: Place SELL Order for the selected Call
    const optionOrderType = opts?.optionOrderType || 'limit';
    const optionPrice = optionOrderType === 'limit'
      ? (opts?.optionLimitPrice && opts.optionLimitPrice > 0 ? opts.optionLimitPrice : (targetCall.bid || targetCall.mark))
      : undefined;

    const marginMode = this.getMarginMode(strategy);
    const nakedAfter = Math.max(0, heldCallLots + actualOptionLots - futureLots);
    if (nakedAfter > 0) {
      this.logger.warn(
        `[${strategy.name}] RATIO WRITE: after this order ${heldCallLots + actualOptionLots} short Call(s) sit against ${futureLots} future lot(s) - ${nakedAfter} of them are NAKED (unlimited upside risk). Allowance is ${maxCallsPerFuture} Call(s) per future lot.`,
      );
    }
    this.logger.log(
      `[${strategy.name}] Routine check (< 1% drawdown): Shorting ${actualOptionLots} lots Call ${targetCall.symbol} [${strikeDesc}] (${optionOrderType.toUpperCase()}${optionPrice ? ` @ $${optionPrice}` : ''}, margin: ${marginMode.toUpperCase()})...`,
    );

    const optionOrder = await adapter.placeOrder({
      symbol: targetCall.symbol,
      productId: targetCall.productId,
      side: 'sell',
      orderType: optionOrderType,
      price: optionPrice,
      size: actualOptionLots,
      marginMode,
    });

    if (!optionOrder || optionOrder.status === 'rejected') {
      const failMsg = optionOrder?.message || 'Broker rejected routine call order';
      this.logger.error(`[${strategy.name}] Routine Call order rejected: ${failMsg}`);
      await this.logTrade(strategy,
        account.brokerType,
        targetCall.symbol,
        'SELL_CALL_FAILED',
        optionPrice || targetCall.mark,
        actualOptionLots,
        `Routine Call Sell Failed: ${failMsg}`,
      );
      throw new Error(`Routine Call order rejected: ${failMsg}`);
    }

    const entryPremium = optionOrder.averagePrice > 0
      ? optionOrder.averagePrice
      : (optionPrice || targetCall.bid || targetCall.mark || 0);

    // Step 4: Log trade
    const actionTag = isAtmMatch ? 'SELL_CALL_ATM_MATCH' : 'SELL_CALL_OTM';
    await this.logTrade(strategy,
      account.brokerType,
      targetCall.symbol,
      actionTag,
      entryPremium,
      actualOptionLots,
      `Routine check (${freqDesc}): Future down ${drawdownPercent.toFixed(2)}% (< 1%). Shorted ${actualOptionLots} lots Call @ strike $${targetCall.strike} [${strikeDesc}] (Premium: $${entryPremium.toFixed(2)})`,
    );

    // Step 5: Update strategy state
    const existingOpt = strategy.state.optionPosition;
    const sameSymbol = existingOpt && existingOpt.symbol === targetCall.symbol;
    const newSize = (sameSymbol ? existingOpt.size : 0) + actualOptionLots;
    const newEntryPremium = sameSymbol
      ? ((existingOpt.entryPremium * existingOpt.size) + (entryPremium * actualOptionLots)) / newSize
      : entryPremium;

    strategy.state.optionPosition = {
      symbol: targetCall.symbol,
      productId: targetCall.productId,
      side: 'sell',
      strike: targetCall.strike,
      size: newSize,
      entryPremium: newEntryPremium,
      currentPremium: entryPremium,
      pnlPercent: 0,
      expiryDate: expiry.dateString,
      rollCount: existingOpt?.rollCount ?? strategy.state.lastRollCount ?? 0,
      entryTimestamp: new Date().toISOString(),
    };

    strategy.state.layers = strategy.state.layers || [];
    strategy.state.layers.push({
      price: currentMark,
      size: actualOptionLots,
      timestamp: new Date().toISOString(),
      action: `ROUTINE_${actionTag}_${targetCall.strike}_${actualOptionLots}_LOTS`,
    });

    const successMsg = `Routine check (${freqDesc}): Future down ${drawdownPercent.toFixed(2)}% (< 1%). Shorted ${actualOptionLots} lots Call ${targetCall.symbol} [${strikeDesc}] @ $${entryPremium.toFixed(2)}. Future unchanged.`;
    strategy.state.lastMessage = successMsg;
    strategy.state.lastEvaluatedAt = new Date().toISOString();

    await this.strategyRepo.save(strategy);
    return successMsg;
  }

  private async executeOtmCallSellOnly(
    strategy: Strategy,
    adapter: IBrokerAdapter,
    account: BrokerAccount,
    currentMark: number,
    optionLots: number = 1,
    drawdownPercent: number,
    opts?: TriggerExecutionOptions,
  ): Promise<string> {
    return this.executeRoutineCallSell(strategy, adapter, account, currentMark, optionLots, drawdownPercent, opts);
  }

  /**
   * Continuous Real-Time Monitoring Loop (Runs on ticks / intervals):
   *
   * USER RULE:
   * "every time check if the future gives the 4 to 5% profit by the future then square off all the position.
   * If you square off then don't do anything else."
   */
  /**
   * Synchronizes a strategy's state with live positions on the connected broker.
   * If a position was squared off on the broker directly, clears the corresponding leg and updates the stage.
   */
  async syncStrategyWithBroker(strategy: Strategy, existingAdapter?: IBrokerAdapter): Promise<Strategy> {
    if (!strategy.brokerAccountId || !strategy.state) {
      return strategy;
    }

    const hasFuture = !!strategy.state.futurePosition && strategy.state.futurePosition.size > 0;
    const hasOption = !!strategy.state.optionPosition && strategy.state.optionPosition.size > 0;

    if (!hasFuture && !hasOption) {
      return strategy;
    }

    try {
      const adapter = existingAdapter || (await this.getAdapterForStrategy(strategy)).adapter;
      const symbol = strategy.symbol || 'BTCUSD';
      const livePositions = await adapter.getPositions();

      let stateChanged = false;

      // 1. Check Future Leg
      if (hasFuture) {
        const fp = strategy.state.futurePosition!;
        const liveFuture = livePositions.find(
          (p) =>
            (fp.productId && String(p.productId) === String(fp.productId)) ||
            (p.symbol && p.symbol.toUpperCase() === fp.symbol.toUpperCase()) ||
            (p.symbol && p.symbol.toUpperCase() === symbol.toUpperCase()),
        );

        if (!liveFuture || liveFuture.size === 0) {
          this.logger.log(
            `[Broker Sync] Future position for ${strategy.name} (${symbol}) is closed on broker. Clearing from dashboard state.`,
          );
          strategy.state.futurePosition = null;
          stateChanged = true;
        } else {
          if (fp.size !== liveFuture.size || fp.currentPrice !== liveFuture.markPrice) {
            fp.size = liveFuture.size;
            fp.currentPrice = liveFuture.markPrice || fp.currentPrice;
            fp.pnlPercent = liveFuture.pnlPercent ?? 0;
            stateChanged = true;
          }
        }
      }

      // 2. Check Option Leg
      if (hasOption) {
        const op = strategy.state.optionPosition!;
        const { underlying } = OptionsUtil.getUnderlyingAndStrikeInterval(symbol);
        let liveOption = livePositions.find(
          (p) =>
            (op.productId && String(p.productId) === String(op.productId)) ||
            (p.symbol && p.symbol.toUpperCase() === op.symbol.toUpperCase()) ||
            (p.symbol && p.symbol.toUpperCase().startsWith(`C-${underlying}-`)),
        );

        // If not found in bulk positions list, verify with direct product position check if available
        if (!liveOption && op.productId && typeof (adapter as any).getPosition === 'function') {
          try {
            const directPos = await (adapter as any).getPosition(op.productId);
            if (directPos && directPos.size > 0) {
              liveOption = directPos;
            }
          } catch {
            // Ignore error
          }
        }

        const entryAgeSec = op.entryTimestamp
          ? (Date.now() - new Date(op.entryTimestamp).getTime()) / 1000
          : 999;

        if (!liveOption || liveOption.size === 0) {
          // Allow 20 seconds grace period after entry for broker indexing
          if (entryAgeSec >= 20) {
            this.logger.log(
              `[Broker Sync] Option position for ${strategy.name} (${op.symbol}) is closed on broker. Clearing from dashboard state.`,
            );
            strategy.state.optionPosition = null;
            stateChanged = true;
          }
        } else {
          if (op.size !== liveOption.size || op.currentPremium !== liveOption.markPrice) {
            op.size = liveOption.size;
            op.currentPremium = liveOption.markPrice || op.currentPremium;
            op.pnlPercent = liveOption.pnlPercent ?? 0;
            stateChanged = true;
          }
        }
      }

      // 3. If both positions are now closed, transition stage to SQUARED_OFF
      if (!strategy.state.futurePosition && !strategy.state.optionPosition) {
        if (strategy.state.stage !== 'SQUARED_OFF' && strategy.state.stage !== 'IDLE') {
          strategy.state.stage = 'SQUARED_OFF';
          strategy.state.lastMessage = 'Positions squared off on broker. Synchronized with dashboard.';
          stateChanged = true;
        }
      }

      if (stateChanged) {
        strategy.state.lastEvaluatedAt = new Date().toISOString();
        const saved = await this.strategyRepo.save(strategy);
        this.gateway.broadcastStrategyUpdate(saved);
        return saved;
      }
    } catch (err: any) {
      this.logger.warn(`Failed to sync strategy ${strategy.name} with broker positions: ${err.message}`);
    }

    return strategy;
  }

  /**
   * Continuous Real-Time Position & Profit Monitoring Loop (runs every 10 seconds):
   * 1. Synchronizes open positions with live broker exchange data.
   * 2. Checks 4% to 5% future profit target.
   * 3. Squares off ALL positions (future + call) immediately and DO NOTHING ELSE when target is hit.
   */
  async monitorActivePositions(): Promise<void> {
    const activeStrategies = await this.strategyRepo.find({ where: { status: 'ACTIVE' } });

    for (const strategy of activeStrategies) {
      // If stage is IDLE or SQUARED_OFF, do nothing else!
      if (!strategy.state || strategy.state.stage === 'IDLE' || strategy.state.stage === 'SQUARED_OFF') {
        continue;
      }

      try {
        const { adapter, account } = await this.getAdapterForStrategy(strategy);
        const symbol = strategy.symbol || 'BTCUSD';
        const ticker = await adapter.getTicker(symbol);

        this.gateway.broadcastPriceUpdate({ symbol, price: ticker.last, markPrice: ticker.mark });

        // 0. Synchronize strategy state with live broker positions!
        const synced = await this.syncStrategyWithBroker(strategy, adapter);
        if (!synced.state?.futurePosition && !synced.state?.optionPosition) {
          // If positions are squared off on the broker, do nothing else!
          continue;
        }

        // 1. Update Future PnL & Drawdown
        let futureProfitPercent = 0;
        if (strategy.state.futurePosition && strategy.state.futurePosition.size > 0) {
          const fp = strategy.state.futurePosition;
          futureProfitPercent = ((ticker.mark - fp.entryPrice) / fp.entryPrice) * 100;
          fp.currentPrice = ticker.mark;
          fp.pnlPercent = futureProfitPercent;

          const buyingStrike = strategy.state.buyingStrike || fp.entryPrice;
          strategy.state.drawdownPercent = ((ticker.mark - buyingStrike) / buyingStrike) * 100;
        }

        // 2. Update Option PnL (informational, no 70% roll)
        if (strategy.state.optionPosition && strategy.state.optionPosition.size > 0) {
          const op = strategy.state.optionPosition;
          const chain = await adapter.getOptionChain(symbol, op.expiryDate);
          const currentOpt = chain.find((c) => c.productId === op.productId || c.symbol === op.symbol);
          const currentPremium = currentOpt ? (currentOpt.ask || currentOpt.mark) : op.currentPremium;

          op.currentPremium = currentPremium;
          if (op.entryPremium > 0) {
            op.pnlPercent = ((op.entryPremium - currentPremium) / op.entryPremium) * 100;
          }
        }

        strategy.state.lastEvaluatedAt = new Date().toISOString();

        // -------------------------------------------------------------
        // CONTINUOUS RULE: Future Profit Target 4% to 5% (>= 4.0%)
        // Square off ALL positions (future + call) and DO NOTHING ELSE!
        // -------------------------------------------------------------
        const futureTarget = strategy.exitRules?.futureProfitTargetPercent || 4.0;
        if (futureProfitPercent >= futureTarget) {
          this.logger.warn(
            `Future profit target reached (${futureProfitPercent.toFixed(2)}% >= ${futureTarget}%). SQUARING OFF ALL POSITIONS!`,
          );
          await this.emergencySquareOff(
            strategy.id,
            `Target 4-5% profit reached: Future +${futureProfitPercent.toFixed(2)}%`,
          );
          // When squared off, DO NOTHING ELSE!
          continue;
        }

        await this.strategyRepo.save(strategy);
        this.gateway.broadcastStrategyUpdate(strategy);
      } catch (err: any) {
        this.logger.error(`Error monitoring strategy ${strategy.name}: ${err.message}`);
      }
    }
  }

  /**
   * Emergency / Target Square Off: Closes both Future and Call option positions immediately.
   * Directly checks live broker positions and executes market close orders exactly once.
   * Sets stage to 'SQUARED_OFF' and stops further actions.
   */
  async emergencySquareOff(strategyId: string, reason: string = 'Manual Square Off'): Promise<boolean> {
    const strategy = await this.strategyRepo.findOne({ where: { id: strategyId } });
    if (!strategy) return false;

    try {
      const { adapter, account } = await this.getAdapterForStrategy(strategy);
      const symbol = strategy.symbol || 'BTCUSD';
      const { underlying } = OptionsUtil.getUnderlyingAndStrikeInterval(symbol);
      this.logger.log(`[emergencySquareOff] Executing emergency square off for ${strategy.name} (${symbol}), reason: ${reason}`);

      // 1. Fetch current live open positions directly from broker
      let livePositions: PositionInfo[] = [];
      try {
        livePositions = await adapter.getPositions();
      } catch (posErr: any) {
        this.logger.warn(`Could not fetch live positions before square off: ${posErr.message}`);
      }

      // 2. Identify all positions on the broker that belong to this strategy/symbol:
      // - The future contract (e.g. ETHUSD, BTCUSD, SOLUSD)
      // - Any option contract for this underlying (e.g. C-ETH-*, P-ETH-*, C-BTC-*, etc.)
      const positionsToClose: PositionInfo[] = [];

      for (const p of livePositions) {
        if (p.size <= 0) continue;
        const isFuture = p.symbol && p.symbol.toUpperCase() === symbol.toUpperCase();
        const isOption = p.symbol && (
          p.symbol.toUpperCase().startsWith(`C-${underlying}-`) ||
          p.symbol.toUpperCase().startsWith(`P-${underlying}-`) ||
          (strategy.state?.optionPosition?.productId && String(p.productId) === String(strategy.state.optionPosition.productId))
        );

        if (isFuture || isOption) {
          positionsToClose.push(p);
        }
      }

      let closedCount = 0;
      const closedLegs: Array<{ symbol: string; price: number; quantity: number }> = [];

      // Close each matching live broker position EXACTLY ONCE
      for (const pos of positionsToClose) {
        // Reverse order to close position: if long ('buy'), sell. If short ('sell'), buy.
        const closeSide = pos.side === 'buy' ? 'sell' : 'buy';
        const isOption = pos.symbol.startsWith('C-') || pos.symbol.startsWith('P-');
        const actionType = isOption ? 'SQUARE_OFF_OPTION' : 'SQUARE_OFF_FUTURE';

        this.logger.log(
          `[emergencySquareOff] Closing live broker position: ${closeSide.toUpperCase()} ${pos.size} ${pos.symbol} (market)`,
        );

        const res = await adapter.placeOrder({
          symbol: pos.symbol,
          productId: pos.productId,
          side: closeSide,
          orderType: 'market',
          size: pos.size,
        });

        if (res.status === 'rejected') {
          this.logger.warn(
            `[emergencySquareOff] Market close order rejected for ${pos.symbol}: ${res.message}. Trying closePosition fallback...`,
          );
          await adapter.closePosition(pos.symbol, pos.productId);
        }

        const exitPrice = res.averagePrice || pos.markPrice || 0;
        await this.logTrade(strategy,
          account.brokerType,
          pos.symbol,
          actionType,
          exitPrice,
          pos.size,
          reason,
        );
        closedLegs.push({ symbol: pos.symbol, price: exitPrice, quantity: pos.size });
        closedCount++;
      }

      // 3. Fallback: If no live positions were found on broker (e.g. network glitch), but strategy.state has recorded open positions, close them
      if (closedCount === 0) {
        if (strategy.state?.futurePosition && strategy.state.futurePosition.size > 0) {
          const fp = strategy.state.futurePosition;
          const closeSide = fp.side === 'buy' ? 'sell' : 'buy';
          this.logger.log(`[emergencySquareOff] Fallback closing state future: ${closeSide} ${fp.size} ${fp.symbol}`);
          await adapter.placeOrder({
            symbol: fp.symbol,
            productId: fp.productId,
            side: closeSide,
            orderType: 'market',
            size: fp.size,
          });
          await this.logTrade(strategy, account.brokerType, fp.symbol, 'SQUARE_OFF_FUTURE', fp.currentPrice, fp.size, reason);
          closedLegs.push({ symbol: fp.symbol, price: fp.currentPrice, quantity: fp.size });
        }

        if (strategy.state?.optionPosition && strategy.state.optionPosition.size > 0) {
          const op = strategy.state.optionPosition;
          const closeSide = op.side === 'sell' ? 'buy' : 'sell';
          this.logger.log(`[emergencySquareOff] Fallback closing state option: ${closeSide} ${op.size} ${op.symbol}`);
          await adapter.placeOrder({
            symbol: op.symbol,
            productId: op.productId,
            side: closeSide,
            orderType: 'market',
            size: op.size,
          });
          await this.logTrade(strategy, account.brokerType, op.symbol, 'SQUARE_OFF_OPTION', op.currentPremium, op.size, reason);
          closedLegs.push({ symbol: op.symbol, price: op.currentPremium, quantity: op.size });
        }
      }

      // 4. Update Strategy State: Clear positions, set SQUARED_OFF, and persist
      if (strategy.state) {
        strategy.state.futurePosition = null;
        strategy.state.optionPosition = null;
        strategy.state.stage = 'SQUARED_OFF';
        strategy.state.lastMessage = `All positions squared off successfully (${reason}). Awaiting next routine cycle or manual trigger.`;
        strategy.state.lastEvaluatedAt = new Date().toISOString();
      }

      await this.strategyRepo.save(strategy);
      this.gateway.broadcastStrategyUpdate(strategy);

      // One email per square-off event, batching every leg closed - not one email per leg.
      if (closedLegs.length > 0) {
        void this.email.notifySquareOff({
          strategyName: strategy.name,
          symbol,
          reason,
          legs: closedLegs,
        });
      }

      return true;
    } catch (err: any) {
      this.logger.error(`Failed to emergency square off strategy ${strategy.name}: ${err.message}`);
      return false;
    }
  }

  async squareOffAllActiveStrategies(reason: string = 'Emergency Square Off All Tickers'): Promise<{
    squaredOffCount: number;
    results: Array<{ id: string; name: string; symbol: string; success: boolean }>;
  }> {
    const strategies = await this.strategyRepo.find();
    const results: Array<{ id: string; name: string; symbol: string; success: boolean }> = [];
    let squaredOffCount = 0;

    for (const s of strategies) {
      const hasFuture = !!s.state?.futurePosition && s.state.futurePosition.size > 0;
      const hasOption = !!s.state?.optionPosition && s.state.optionPosition.size > 0;
      if (hasFuture || hasOption) {
        const ok = await this.emergencySquareOff(s.id, reason);
        results.push({ id: s.id, name: s.name, symbol: s.symbol, success: ok });
        if (ok) squaredOffCount++;
      }
    }

    return { squaredOffCount, results };
  }

  /**
   * Every real order fill in the engine funnels through here - it is the single place that
   * persists a TradeLog row and broadcasts it over the socket. Order-PLACED email notifications
   * are fired from here too (for the whitelisted "order actually went in" actions below); *_FAILED
   * and ROLLBACK_* rows deliberately do NOT email - only successful placements do, per the
   * "notify when order placed" scope. SQUARE_OFF_* rows also don't email from here - emergencySquareOff()
   * sends one batched email per square-off event instead of one per leg.
   */
  private async logTrade(
    strategy: Strategy,
    brokerType: string,
    symbol: string,
    action: string,
    price: number,
    quantity: number,
    details?: string,
  ) {
    const log = this.tradeLogRepo.create({
      strategyId: strategy.id,
      brokerType,
      symbol,
      action,
      price,
      quantity,
      details,
    });
    const saved = await this.tradeLogRepo.save(log);
    this.gateway.broadcastTradeLog(saved);

    const ORDER_PLACED_ACTIONS = new Set([
      'BUY_FUTURE_ENTRY',
      'SELL_CALL_ENTRY',
      'BUY_FUTURE_AVERAGING',
      'SELL_CALL_ATM_MATCH',
      'SELL_CALL_OTM',
    ]);
    if (ORDER_PLACED_ACTIONS.has(action)) {
      void this.email.notifyOrderPlaced({
        strategyName: strategy.name,
        symbol,
        action,
        price,
        quantity,
        info: details,
      });
    }

    return saved;
  }
}


