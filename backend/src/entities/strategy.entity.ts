import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type StrategyStatus = 'ACTIVE' | 'PAUSED' | 'ERROR';

export type TriggerFrequency = 'DAILY' | 'EVERY_N_DAYS' | 'HOURLY' | 'MINUTES';

export interface StrategyTriggerConfig {
  type: 'SCHEDULE' | 'INTERVAL';
  frequency?: TriggerFrequency;
  startDate?: string;
  time?: string;
  intervalValue?: number;
  timezone?: string;
  cron?: string;
  intervalSeconds?: number;
}

export interface StrategyIndicatorConfig {
  name: 'Supertrend' | 'EMA' | 'RSI' | 'NONE';
  timeframe: string;
  period: number;
  multiplier?: number;
  condition: 'BULLISH' | 'BEARISH' | 'ALWAYS_TRUE';
}

export interface StrategyLegsConfig {
  marginMode?: 'PORTFOLIO' | 'ISOLATED' | 'CROSS';
  /**
   * Maximum short Call contracts allowed PER future lot. Default 1 = strict covered call (1:1).
   * Values > 1 permit a ratio write: every Call beyond the 1:1 line is NAKED and carries unlimited
   * upside risk. The routine Call sell stops once futureLots * maxCallsPerFutureLot is reached.
   */
  maxCallsPerFutureLot?: number;
  futureLeg: {
    enabled: boolean;
    action: 'BUY' | 'SELL';
    size: number;
    unit: 'BTC' | 'ETH' | 'CONTRACTS' | 'USD';
  };
  optionLeg: {
    enabled: boolean;
    action: 'SELL' | 'BUY';
    type: 'CALL' | 'PUT';
    size?: number;
    strikeSelection: 'ATM' | 'SAME_AS_FUTURE' | 'OTM_1' | 'OTM_2';
    expiry: 'NEXT_DAY' | 'SAME_DAY' | 'WEEKLY';
  };
}

export interface StrategyPositionRules {
  onExistingFutureInProfit?: {
    action: 'SELL_NEXT_DAY_CALL';
    strikeSelection: 'ATM' | 'SAME_AS_FUTURE';
  };
}

export interface StrategyExitRules {
  optionProfitTargetPercent: number;
  optionRollAction: 'ROLL_NEXT_DAY_ATM' | 'CLOSE_ONLY';
  futureProfitTargetPercent: number;
  futureProfitExitAction: 'SQUARE_OFF_ALL';
  stopLossPercent?: number;
}

export interface StrategyActiveState {
  stage: 'IDLE' | 'IN_POSITION' | 'ROLLED' | 'SQUARED_OFF';
  futurePosition?: {
    symbol: string;
    productId?: string | number;
    side: 'buy' | 'sell';
    size: number;
    entryPrice: number;
    currentPrice: number;
    pnlPercent: number;
    entryTimestamp: string;
  } | null;
  optionPosition?: {
    symbol: string;
    productId?: string | number;
    side: 'sell' | 'buy';
    strike: number;
    size: number;
    entryPremium: number;
    currentPremium: number;
    pnlPercent: number;
    expiryDate: string;
    rollCount: number;
    entryTimestamp: string;
  } | null;
  buyingStrike?: number;
  drawdownPercent?: number;
  layers?: Array<{ price: number; size: number; timestamp: string; action: string }>;
  lastAveragedPrice?: number;
  marketRegime?: 'BULLISH' | 'NOT_BULLISH';
  cycleCount?: number;
  /** Number of times a short Call has been rolled out of an expiring contract. Survives the roll (which clears optionPosition). */
  lastRollCount?: number;
  totalRealizedPnl: number;
  lastEvaluatedAt?: string;
  lastMessage?: string;
}

@Entity('strategies')
export class Strategy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 100 })
  brokerAccountId: string;

  @Column({ default: 'BTCUSD' })
  symbol: string;

  @Column({ type: 'varchar', default: 'PAUSED' })
  status: StrategyStatus;

  @Column({ type: 'varchar', default: 'PORTFOLIO', nullable: true })
  marginMode?: 'PORTFOLIO' | 'ISOLATED' | 'CROSS';

  @Column({ type: 'varchar', default: 'CODE' })
  logicMode: 'CODE' | 'VISUAL_RULES';

  @Column({ type: 'text', nullable: true })
  customScript?: string;

  @Column({ type: 'jsonb' })
  triggerConfig: StrategyTriggerConfig;

  @Column({ type: 'jsonb' })
  indicatorConfig: StrategyIndicatorConfig;

  @Column({ type: 'jsonb' })
  legsConfig: StrategyLegsConfig;

  @Column({ type: 'jsonb', nullable: true })
  positionRules?: StrategyPositionRules;

  @Column({ type: 'jsonb' })
  exitRules: StrategyExitRules;

  @Column({ type: 'jsonb' })
  state: StrategyActiveState;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
