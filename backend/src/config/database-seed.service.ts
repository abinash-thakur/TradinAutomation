import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrokerAccount } from '../entities/broker-account.entity';
import { Strategy } from '../entities/strategy.entity';

@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSeedService.name);

  constructor(
    @InjectRepository(BrokerAccount)
    private readonly brokerRepo: Repository<BrokerAccount>,
    @InjectRepository(Strategy)
    private readonly strategyRepo: Repository<Strategy>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultData();
  }

  private async seedDefaultData() {
    // 1. Seed a Delta Exchange template broker account if none exist. Credentials start empty
    // (lastTestStatus: PENDING) - the user fills in real API keys before anything can actually
    // trade. There is no paper/simulated broker: every account here is a real venue, and the
    // factory throws rather than silently substituting one if a strategy's brokerAccountId ever
    // doesn't resolve to a real, known broker type.
    const brokerCount = await this.brokerRepo.count();
    let defaultBroker: BrokerAccount;

    if (brokerCount === 0) {
      this.logger.log('Seeding default Delta Exchange template broker account...');
      const deltaSample = this.brokerRepo.create({
        name: 'Delta Exchange India (Main)',
        brokerType: 'delta-india',
        isTestnet: false,
        isActive: true,
        balanceUsd: 0,
        lastTestStatus: 'PENDING',
        lastTestMessage: 'Awaiting API Key & Secret configuration',
      });
      defaultBroker = await this.brokerRepo.save(deltaSample);
    } else {
      defaultBroker = await this.brokerRepo.find().then((list) => list[0]);
    }

    // 2. Seed User's Covered Call Strategies (BTC & ETH) if missing
    const existingStrategies = await this.strategyRepo.find();
    const hasBtc = existingStrategies.some((s) => s.symbol === 'BTCUSD' || (!s.symbol && s.name.includes('BTC')));
    const hasEth = existingStrategies.some((s) => s.symbol === 'ETHUSD' || s.name.includes('ETH'));

    if (!hasBtc && defaultBroker) {
      this.logger.log('Seeding user-specified Covered Call Strategy (BTC)...');
      const btcStrategy = this.strategyRepo.create({
        name: 'Covered Call',
        brokerAccountId: defaultBroker.id,
        symbol: 'BTCUSD',
        status: 'ACTIVE',
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
            size: 2, // 2 lots
            unit: 'BTC',
          },
          optionLeg: {
            enabled: true,
            action: 'SELL',
            type: 'CALL',
            strikeSelection: 'ATM',
            expiry: 'NEXT_DAY',
            size: 2,
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
          lastMessage: 'Strategy ready. Scheduled for 3:30 PM IST check & continuous 4-5% profit monitoring.',
        },
      });
      await this.strategyRepo.save(btcStrategy);
      this.logger.log('BTC Covered Call strategy seeded.');
    }

    if (!hasEth && defaultBroker) {
      this.logger.log('Seeding user-specified Covered Call Strategy (ETH)...');
      const ethStrategy = this.strategyRepo.create({
        name: 'Covered Call',
        brokerAccountId: defaultBroker.id,
        symbol: 'ETHUSD',
        status: 'ACTIVE',
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
            size: 2, // 2 lots
            unit: 'ETH',
          },
          optionLeg: {
            enabled: true,
            action: 'SELL',
            type: 'CALL',
            strikeSelection: 'ATM',
            expiry: 'NEXT_DAY',
            size: 2,
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
          lastMessage: 'Strategy ready. Scheduled for 3:30 PM IST check & continuous 4-5% profit monitoring.',
        },
      });
      await this.strategyRepo.save(ethStrategy);
      this.logger.log('ETH Covered Call strategy seeded.');
    }

    // Refresh existing strategies exit rules and standardize name to "Covered Call"
    // Backfill only what's genuinely MISSING on old rows - never overwrite a value the user has
    // actually set. This used to run unconditionally on every boot, silently reverting any
    // manually-configured exitRules (and any strategy rename) back to these hardcoded defaults
    // every single restart - a real bug, not a feature, since onModuleInit() runs on every boot.
    const currentStrategies = await this.strategyRepo.find();
    for (const s of currentStrategies) {
      let changed = false;

      if (!s.name) {
        s.name = 'Covered Call';
        changed = true;
      }
      if (!s.symbol) {
        s.symbol = 'BTCUSD';
        changed = true;
      }
      if (!s.exitRules) {
        s.exitRules = {
          optionProfitTargetPercent: 100,
          optionRollAction: 'CLOSE_ONLY',
          futureProfitTargetPercent: 4.0,
          futureProfitExitAction: 'SQUARE_OFF_ALL',
        };
        changed = true;
      }

      if (changed) {
        await this.strategyRepo.save(s);
      }
    }
  }
}

