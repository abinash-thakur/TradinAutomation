export interface BrokerCredentials {
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  isTestnet?: boolean;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerData {
  symbol: string;
  last: number;
  mark: number;
  bid: number;
  ask: number;
}

export interface OptionContract {
  symbol: string;
  productId: string | number;
  strike: number;
  optionType: 'CALL' | 'PUT';
  expiryDate: string; // "DD-MM-YYYY" or ISO
  bid: number;
  ask: number;
  mark: number;
}

export interface OrderRequest {
  symbol: string;
  productId?: string | number;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  size: number;
  price?: number;
  marginMode?: 'portfolio' | 'isolated' | 'cross';
}

export interface OrderResult {
  orderId: string;
  status: 'filled' | 'open' | 'rejected' | 'simulated';
  filledSize: number;
  averagePrice: number;
  message?: string;
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

export interface IBrokerAdapter {
  readonly brokerType: string;
  connect(credentials: BrokerCredentials): Promise<boolean>;
  testConnection(): Promise<{ success: boolean; message: string; balance?: number }>;
  getTicker(symbol: string): Promise<TickerData>;
  getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
  getOptionChain(symbol: string, expiryDate: string): Promise<OptionContract[]>;
  placeOrder(order: OrderRequest): Promise<OrderResult>;
  cancelOrder(orderId: string, symbol?: string): Promise<boolean>;
  getPositions(): Promise<PositionInfo[]>;
  closePosition(symbol: string, productId?: string | number): Promise<boolean>;
  calculateContractQuantity(symbol: string, sizeBtc: number): Promise<number>;
}

