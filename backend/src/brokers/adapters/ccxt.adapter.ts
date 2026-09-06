import * as ccxt from 'ccxt';
import {
  IBrokerAdapter,
  BrokerCredentials,
  TickerData,
  Candle,
  OptionContract,
  OrderRequest,
  OrderResult,
  PositionInfo,
} from '../broker.interface';

export class CcxtBrokerAdapter implements IBrokerAdapter {
  readonly brokerType: string;
  private exchange: any;

  constructor(brokerType: string) {
    this.brokerType = brokerType;
  }

  async connect(credentials: BrokerCredentials): Promise<boolean> {
    const exchangeClass = (ccxt as any)[this.brokerType];
    if (!exchangeClass) {
      throw new Error(`Unsupported CCXT exchange: ${this.brokerType}`);
    }

    const config: any = {
      apiKey: credentials.apiKey,
      secret: credentials.apiSecret,
      enableRateLimit: true,
    };

    if (credentials.passphrase) {
      config.password = credentials.passphrase;
    }

    this.exchange = new exchangeClass(config);

    if (credentials.isTestnet && this.exchange.setSandboxMode) {
      this.exchange.setSandboxMode(true);
    }

    return true;
  }

  async testConnection(): Promise<{ success: boolean; message: string; balance?: number }> {
    try {
      if (!this.exchange) {
        return { success: false, message: 'Exchange client not initialized' };
      }
      const balance = await this.exchange.fetchBalance();
      const usdt = balance.total['USDT'] || balance.total['USD'] || 0;
      return {
        success: true,
        message: `Successfully connected to ${this.brokerType.toUpperCase()}`,
        balance: usdt,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || `Failed to connect to ${this.brokerType}`,
      };
    }
  }

  async getTicker(symbol: string): Promise<TickerData> {
    const ticker = await this.exchange.fetchTicker(symbol);
    return {
      symbol,
      last: ticker.last || ticker.close || 0,
      mark: ticker.info?.markPrice ? parseFloat(ticker.info.markPrice) : (ticker.last || 0),
      bid: ticker.bid || ticker.last || 0,
      ask: ticker.ask || ticker.last || 0,
    };
  }

  async getCandles(symbol: string, timeframe: string = '4h', limit: number = 100): Promise<Candle[]> {
    const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    return ohlcv.map((c: any) => ({
      timestamp: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5],
    }));
  }

  async getOptionChain(symbol: string, expiryDate: string): Promise<OptionContract[]> {
    // If exchange supports options (like Deribit or Bybit)
    if (this.exchange.has['fetchOptionChain']) {
      const chain = await this.exchange.fetchOptionChain(symbol);
      return Object.values(chain).map((opt: any) => ({
        symbol: opt.symbol,
        productId: opt.id || opt.symbol,
        strike: opt.strike,
        optionType: opt.optionType?.toUpperCase() === 'PUT' ? 'PUT' : 'CALL',
        expiryDate: opt.expiry || expiryDate,
        bid: opt.bid || 0,
        ask: opt.ask || 0,
        mark: opt.markPrice || opt.last || 0,
      }));
    }
    return [];
  }

  async calculateContractQuantity(symbol: string, sizeBtc: number): Promise<number> {
    return sizeBtc;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    try {
      const type = order.orderType === 'limit' ? 'limit' : 'market';
      const side = order.side;
      const amount = order.size;
      const price = order.price;

      const res = await this.exchange.createOrder(order.symbol, type, side, amount, price);
      return {
        orderId: res.id,
        status: res.status === 'closed' ? 'filled' : 'open',
        filledSize: res.filled || amount,
        averagePrice: res.average || res.price || price || 0,
      };
    } catch (err: any) {
      return {
        orderId: '',
        status: 'rejected',
        filledSize: 0,
        averagePrice: 0,
        message: err.message,
      };
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    try {
      await this.exchange.cancelOrder(orderId, symbol);
      return true;
    } catch {
      return false;
    }
  }

  async getPositions(): Promise<PositionInfo[]> {
    try {
      if (this.exchange.has['fetchPositions']) {
        const positions = await this.exchange.fetchPositions();
        return positions.map((p: any) => ({
          symbol: p.symbol,
          side: p.side === 'long' ? 'buy' : 'sell',
          size: p.contracts || p.size || 0,
          entryPrice: p.entryPrice || 0,
          markPrice: p.markPrice || 0,
          unrealizedPnl: p.unrealizedPnl || 0,
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  async closePosition(symbol: string): Promise<boolean> {
    try {
      const positions = await this.getPositions();
      const pos = positions.find((p) => p.symbol === symbol);
      if (!pos || pos.size === 0) return true;

      const reverseSide = pos.side === 'buy' ? 'sell' : 'buy';
      await this.placeOrder({
        symbol,
        side: reverseSide,
        orderType: 'market',
        size: pos.size,
      });
      return true;
    } catch {
      return false;
    }
  }
}

