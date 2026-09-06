import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Strategy } from '../entities/strategy.entity';
import { TradeLog } from '../entities/trade-log.entity';
import { StrategyEngineService, TriggerExecutionOptions } from './strategy-engine.service';
import { StrategyScriptRunner } from './strategy-script-runner.util';
import { PaperTradingAdapter } from '../brokers/adapters/paper-trading.adapter';
import { OptionsUtil } from '../market-data/options.util';

@Injectable()
export class StrategyService {
  constructor(
    @InjectRepository(Strategy)
    private readonly strategyRepo: Repository<Strategy>,
    @InjectRepository(TradeLog)
    private readonly tradeLogRepo: Repository<TradeLog>,
    private readonly engine: StrategyEngineService,
  ) {}

  async findAll(): Promise<Strategy[]> {
    const list = await this.strategyRepo.find({ order: { createdAt: 'DESC' } });
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.state?.futurePosition || s.state?.optionPosition) {
        try {
          list[i] = await this.engine.syncStrategyWithBroker(s);
        } catch {
          // ignore sync failure, return cached
        }
      }
    }
    return list;
  }

  async findOne(id: string): Promise<Strategy> {
    const s = await this.strategyRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Strategy with ID ${id} not found`);
    if (s.state?.futurePosition || s.state?.optionPosition) {
      try {
        return await this.engine.syncStrategyWithBroker(s);
      } catch {
        return s;
      }
    }
    return s;
  }

  async create(data: Partial<Strategy>): Promise<Strategy> {
    const strategy = this.strategyRepo.create({
      ...data,
      status: data.status || 'PAUSED',
      state: data.state || {
        stage: 'IDLE',
        totalRealizedPnl: 0,
      },
    });
    return this.strategyRepo.save(strategy);
  }

  async update(id: string, data: Partial<Strategy>): Promise<Strategy> {
    const strategy = await this.findOne(id);
    Object.assign(strategy, data);
    return this.strategyRepo.save(strategy);
  }

  async delete(id: string): Promise<boolean> {
    await this.strategyRepo.delete(id);
    return true;
  }

  async toggleStatus(id: string): Promise<Strategy> {
    const s = await this.findOne(id);
    s.status = s.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    return this.strategyRepo.save(s);
  }

  async manualTrigger(
    id: string,
    options?: boolean | TriggerExecutionOptions,
  ): Promise<{ success: boolean; message: string; rolledBack?: boolean }> {
    return this.engine.evaluateStrategyTrigger(id, options);
  }

  async previewTrigger(id: string) {
    return this.engine.getTriggerPreview(id);
  }

  async testScript(customScript: string, symbol: string = 'BTCUSD') {
    const adapter = new PaperTradingAdapter();
    const ticker = await adapter.getTicker(symbol);
    const candles4h = await adapter.getCandles(symbol, '4h', 50);

    const context = {
      btcPrice: ticker.mark,
      ethPrice: 2500,
      symbol,
      candles4h,
      positions: {
        hasFuture: false,
        hasOption: false,
        futurePnl: 0,
        optionPnl: 0,
      },
      getATMOption: (underlying: string, type: 'CALL' | 'PUT', expiry: string) => {
        const roundStrike = OptionsUtil.roundToNearestStrike(ticker.mark, 500);
        return {
          symbol: `C-${underlying}-${roundStrike}-070926`,
          strike: roundStrike,
          type,
          expiry: '070926',
        };
      },
    };

    return StrategyScriptRunner.runScript(customScript, context);
  }

  getDefaultScript() {
    return StrategyScriptRunner.getDefaultScript();
  }

  async subscribeTicker(data: {
    symbol: string;
    futureLots: number;
    optionLots: number;
    brokerAccountId?: string;
    status?: 'ACTIVE' | 'PAUSED';
  }): Promise<Strategy> {
    const symbol = (data.symbol || 'BTCUSD').toUpperCase().trim();
    const existing = await this.strategyRepo.findOne({ where: { symbol } });
    const isEth = symbol.includes('ETH');
    const isBtc = symbol.includes('BTC');
    const name = 'Covered Call';
    const unit = isBtc ? 'BTC' : (isEth ? 'ETH' : 'CONTRACTS');

    if (existing) {
      existing.name = name;
      existing.status = data.status ?? 'ACTIVE';
      if (data.brokerAccountId) {
        existing.brokerAccountId = data.brokerAccountId;
      }
      existing.legsConfig = {
        ...existing.legsConfig,
        futureLeg: {
          ...existing.legsConfig?.futureLeg,
          enabled: true,
          action: 'BUY',
          size: data.futureLots,
          unit,
        },
        optionLeg: {
          ...existing.legsConfig?.optionLeg,
          enabled: true,
          action: 'SELL',
          type: 'CALL',
          strikeSelection: 'ATM',
          expiry: 'NEXT_DAY',
          size: data.optionLots,
        },
      };
      return this.strategyRepo.save(existing);
    }

    const newStrategy = this.strategyRepo.create({
      name,
      symbol,
      brokerAccountId: data.brokerAccountId,
      status: data.status ?? 'ACTIVE',
      triggerConfig: {
        type: 'SCHEDULE',
        time: '15:30',
        timezone: 'Asia/Kolkata',
      },
      indicatorConfig: {
        name: 'Supertrend',
        timeframe: '4h',
        period: 10,
        multiplier: 3,
        condition: 'BULLISH',
      },
      legsConfig: {
        futureLeg: {
          enabled: true,
          action: 'BUY',
          size: data.futureLots,
          unit,
        },
        optionLeg: {
          enabled: true,
          action: 'SELL',
          type: 'CALL',
          strikeSelection: 'ATM',
          expiry: 'NEXT_DAY',
          size: data.optionLots,
        },
      },
      exitRules: {
        optionProfitTargetPercent: 100,
        optionRollAction: 'CLOSE_ONLY',
        futureProfitTargetPercent: 4.0,
        futureProfitExitAction: 'SQUARE_OFF_ALL',
      },
      state: {
        stage: 'IDLE',
        totalRealizedPnl: 0,
        lastMessage: `Subscribed to ${symbol}. Scheduled for 3:30 PM IST check & continuous 4-5% profit monitoring.`,
      },
    });

    return this.strategyRepo.save(newStrategy as Strategy);
  }

  async subscribeMultiple(data: {
    tickers: Array<{
      symbol: string;
      futureLots: number;
      optionLots: number;
      brokerAccountId?: string;
      status?: 'ACTIVE' | 'PAUSED';
    }>;
    defaultBrokerAccountId?: string;
  }): Promise<Strategy[]> {
    const results: Strategy[] = [];
    for (const item of data.tickers) {
      const s = await this.subscribeTicker({
        ...item,
        brokerAccountId: item.brokerAccountId || data.defaultBrokerAccountId,
      });
      results.push(s);
    }
    return results;
  }

  async squareOff(id: string): Promise<boolean> {
    return this.engine.emergencySquareOff(id, 'Manual Square Off from Dashboard');
  }

  async squareOffAll(reason: string = 'Emergency Square Off All Tickers') {
    return this.engine.squareOffAllActiveStrategies(reason);
  }

  async syncWithBroker(id: string): Promise<Strategy> {
    const s = await this.strategyRepo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Strategy with ID ${id} not found`);
    return this.engine.syncStrategyWithBroker(s);
  }

  async syncAllWithBroker(): Promise<Strategy[]> {
    return this.findAll();
  }

  async getTradeLogs(strategyId?: string): Promise<TradeLog[]> {
    if (strategyId) {
      return this.tradeLogRepo.find({
        where: { strategyId },
        order: { timestamp: 'DESC' },
        take: 50,
      });
    }
    return this.tradeLogRepo.find({
      order: { timestamp: 'DESC' },
      take: 100,
    });
  }

  /**
   * Returns pre-configured templates for quick strategy creation in the UI
   */
  getTemplates() {
    return [
      {
        id: 'btc-covered-call-supertrend',
        name: 'BTC 4H Supertrend Covered Call (Delta / Crypto)',
        description: 'Buys 2 BTC Future at 3:30 PM IST if 4H Supertrend is bullish and sells next-day ATM Call. Rolls call at 70% profit, squares off at 4.5% target.',
        symbol: 'BTCUSD',
        triggerConfig: {
          type: 'SCHEDULE',
          time: '15:30',
          timezone: 'Asia/Kolkata',
        },
        indicatorConfig: {
          name: 'Supertrend',
          timeframe: '4h',
          period: 10,
          multiplier: 3,
          condition: 'BULLISH',
        },
        legsConfig: {
          futureLeg: {
            enabled: true,
            action: 'BUY',
            size: 2.0,
            unit: 'BTC',
          },
          optionLeg: {
            enabled: true,
            action: 'SELL',
            type: 'CALL',
            strikeSelection: 'ATM',
            expiry: 'NEXT_DAY',
          },
        },
        positionRules: {
          onExistingFutureInProfit: {
            action: 'SELL_NEXT_DAY_CALL',
            strikeSelection: 'ATM',
          },
        },
        exitRules: {
          optionProfitTargetPercent: 70,
          optionRollAction: 'ROLL_NEXT_DAY_ATM',
          futureProfitTargetPercent: 4.5,
          futureProfitExitAction: 'SQUARE_OFF_ALL',
        },
      },
      {
        id: 'eth-covered-call-supertrend',
        name: 'ETH Daily Supertrend Covered Call',
        description: 'Buys 10 ETH Future at 3:30 PM IST on Bullish Supertrend, sells next-day ATM call, 70% roll, 4% target.',
        symbol: 'ETHUSD',
        triggerConfig: {
          type: 'SCHEDULE',
          time: '15:30',
          timezone: 'Asia/Kolkata',
        },
        indicatorConfig: {
          name: 'Supertrend',
          timeframe: '4h',
          period: 10,
          multiplier: 3,
          condition: 'BULLISH',
        },
        legsConfig: {
          futureLeg: {
            enabled: true,
            action: 'BUY',
            size: 10.0,
            unit: 'USD',
          },
          optionLeg: {
            enabled: true,
            action: 'SELL',
            type: 'CALL',
            strikeSelection: 'ATM',
            expiry: 'NEXT_DAY',
          },
        },
        positionRules: {
          onExistingFutureInProfit: {
            action: 'SELL_NEXT_DAY_CALL',
            strikeSelection: 'ATM',
          },
        },
        exitRules: {
          optionProfitTargetPercent: 70,
          optionRollAction: 'ROLL_NEXT_DAY_ATM',
          futureProfitTargetPercent: 4.0,
          futureProfitExitAction: 'SQUARE_OFF_ALL',
        },
      }
    ];
  }
}

