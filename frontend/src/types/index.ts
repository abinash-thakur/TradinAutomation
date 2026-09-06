export type BrokerType = 
  | 'delta-india' 
  | 'delta-global' 
  | 'binance' 
  | 'bybit' 
  | 'deribit' 
  | 'zerodha' 
  | 'paper';

export interface TickerSummary {
  symbol: string;
  underlying: 'BTC' | 'ETH';
  markPrice: number;
  lastPrice: number;
  bid: number;
  ask: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  updatedAt: string;
}

export interface BrokerAccount {
  id: string;
  name: string;
  brokerType: BrokerType;
  maskedApiKey: string;
  isTestnet: boolean;
  isActive: boolean;
  lastTestStatus?: 'SUCCESS' | 'FAILED' | 'PENDING';
  lastTestMessage?: string;
  balanceUsd: number;
  createdAt: string;
}

export type TriggerFrequency = 'DAILY' | 'EVERY_N_DAYS' | 'HOURLY' | 'MINUTES';

export interface StrategyTriggerConfig {
  type: 'SCHEDULE' | 'INTERVAL';
  frequency?: TriggerFrequency;
  startDate?: string;
  time?: string;
  intervalValue?: number;
  timezone?: string;
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
  /** Max short Calls per future lot. 1 = strict covered call; >1 allows a ratio write where the excess is naked. */
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
    strikeSelection: 'ATM' | 'SAME_AS_FUTURE';
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
  totalRealizedPnl: number;
  lastEvaluatedAt?: string;
  lastMessage?: string;
}

export interface Strategy {
  id: string;
  name: string;
  brokerAccountId: string;
  symbol: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ERROR';
  marginMode?: 'PORTFOLIO' | 'ISOLATED' | 'CROSS';
  logicMode?: 'CODE' | 'VISUAL_RULES';
  customScript?: string;
  triggerConfig: StrategyTriggerConfig;
  indicatorConfig: StrategyIndicatorConfig;
  legsConfig: StrategyLegsConfig;
  positionRules?: StrategyPositionRules;
  exitRules: StrategyExitRules;
  state: StrategyActiveState;
  createdAt: string;
}

export interface TradeLog {
  id: string;
  strategyId?: string;
  brokerType: string;
  symbol: string;
  action: string;
  price: number;
  quantity: number;
  pnl?: number;
  details?: string;
  timestamp: string;
}

export interface PositionInfo {
  symbol: string;
  productId?: string | number;
  side: 'buy' | 'sell';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  pnlPercent?: number;
  margin?: number;
}

export interface BrokerAccountPositions {
  brokerAccountId: string;
  brokerName: string;
  brokerType: string;
  isTestnet: boolean;
  positions: PositionInfo[];
  error?: string;
}


