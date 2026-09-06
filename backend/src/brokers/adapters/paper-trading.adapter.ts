import axios from 'axios';
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

export class PaperTradingAdapter implements IBrokerAdapter {
  readonly brokerType: string = 'paper';
  private virtualBalance: number = 100000; // $100,000 USD virtual capital
  private virtualPositions: Map<string, PositionInfo> = new Map();
  private publicFeedUrl: string = 'https://api.india.delta.exchange';

  async connect(credentials: BrokerCredentials): Promise<boolean> {
    return true;
  }

  async testConnection(): Promise<{ success: boolean; message: string; balance?: number }> {
    return {
      success: true,
      message: 'Paper Trading Simulator is online and ready with live market feeds.',
      balance: this.virtualBalance,
    };
  }

  async getTicker(symbol: string = 'BTCUSD'): Promise<TickerData> {
    try {
      // Use Delta's public ticker endpoint to get true live prices
      const res = await axios.get(`${this.publicFeedUrl}/v2/tickers/${symbol}`, { timeout: 5000 });
      const d = res.data.result;
      const mark = parseFloat(d.mark_price || d.close || '65000');
      return {
        symbol,
        last: parseFloat(d.close || mark.toString()),
        mark,
        bid: parseFloat(d.quotes?.best_bid || (mark - 5).toString()),
        ask: parseFloat(d.quotes?.best_ask || (mark + 5).toString()),
      };
    } catch {
      // Fallback if network blip
      return {
        symbol,
        last: 65000,
        mark: 65000,
        bid: 64995,
        ask: 65005,
      };
    }
  }

  async getCandles(symbol: string, timeframe: string = '4h', limit: number = 100): Promise<Candle[]> {
    try {
      const resolution = timeframe.toLowerCase();
      const end = Math.floor(Date.now() / 1000);
      let stepSeconds = 4 * 3600;
      if (resolution === '1h') stepSeconds = 3600;
      if (resolution === '15m') stepSeconds = 15 * 60;
      if (resolution === '1d') stepSeconds = 86400;

      const start = end - (limit * stepSeconds);
      const res = await axios.get(`${this.publicFeedUrl}/v2/history/candles`, {
        params: {
          symbol: symbol || 'BTCUSD',
          resolution,
          start,
          end,
        },
        timeout: 5000,
      });

      const list = res.data.result || [];
      return list.map((c: any) => ({
        timestamp: c.time * 1000,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume || '0'),
      }));
    } catch {
      // Generate synthetic candles for offline/test environments
      const now = Date.now();
      const candles: Candle[] = [];
      let base = 65000;
      for (let i = limit; i >= 0; i--) {
        const time = now - i * 4 * 3600 * 1000;
        const change = (Math.random() - 0.48) * 400;
        const open = base;
        const close = base + change;
        const high = Math.max(open, close) + Math.random() * 100;
        const low = Math.min(open, close) - Math.random() * 100;
        base = close;
        candles.push({ timestamp: time, open, high, low, close, volume: 100 });
      }
      return candles;
    }
  }

  async getOptionChain(symbol: string = 'BTC', expiryDate?: string): Promise<OptionContract[]> {
    try {
      const clean = (symbol || 'BTC').toUpperCase().replace(/[\/\-_]/g, '');
      let underlying = 'BTC';
      if (clean.includes('ETH')) underlying = 'ETH';
      else if (clean.includes('SOL')) underlying = 'SOL';
      else if (clean.startsWith('BTC')) underlying = 'BTC';
      else underlying = clean.replace(/(USD|USDT)$/, '') || 'BTC';

      const res = await axios.get(`${this.publicFeedUrl}/v2/tickers`, {
        params: {
          contract_types: 'call_options,put_options',
          underlying_asset_symbols: underlying,
        },
        timeout: 5000,
      });

      const list = res.data.result || [];

      // Extract 6-digit DDMMYY expiry code from expiryDate
      let targetCode = '';
      if (expiryDate) {
        const digits = expiryDate.replace(/[^0-9]/g, '');
        if (digits.length === 6) {
          targetCode = digits;
        } else if (digits.length === 8) {
          if (digits.startsWith('20')) {
            targetCode = `${digits.slice(6, 8)}${digits.slice(4, 6)}${digits.slice(2, 4)}`;
          } else {
            targetCode = `${digits.slice(0, 4)}${digits.slice(6, 8)}`;
          }
        } else {
          targetCode = expiryDate;
        }
      }

      const filtered = targetCode ? list.filter((item: any) => item.symbol?.includes(targetCode)) : list;
      const candidateList = filtered.length > 0 ? filtered : list;

      return candidateList.map((item: any) => {
        const isCall = item.contract_type === 'call_options' || item.symbol.startsWith('C-');
        const parts = item.symbol?.split('-');
        const expiryCode = (parts && parts.length >= 4) ? parts[3] : (item.expiry_date || targetCode || expiryDate || '');
        return {
          symbol: item.symbol,
          productId: item.product_id,
          strike: parseFloat(item.strike_price || '0'),
          optionType: isCall ? 'CALL' : 'PUT',
          expiryDate: expiryCode,
          bid: parseFloat(item.quotes?.best_bid || '0'),
          ask: parseFloat(item.quotes?.best_ask || '0'),
          mark: parseFloat(item.mark_price || '0'),
        };
      });
    } catch {
      // Fallback synthetic options
      const isEth = symbol?.includes('ETH');
      const strikes = isEth
        ? [2300, 2350, 2400, 2450, 2500, 2550, 2600, 2650, 2700]
        : [79000, 79500, 80000, 80500, 81000, 81500, 82000];
      const digits = (expiryDate || '').replace(/[^0-9]/g, '');
      const cleanCode = digits.length === 8
        ? (digits.slice(0, 4) + digits.slice(6, 8))
        : (digits.length === 6 ? digits : '070926');

      return strikes.map((strike) => ({
        symbol: `C-${isEth ? 'ETH' : 'BTC'}-${strike}-${cleanCode}`,
        productId: strike,
        strike,
        optionType: 'CALL',
        expiryDate: cleanCode,
        bid: isEth ? 18 : 650,
        ask: isEth ? 20 : 670,
        mark: isEth ? 19 : 660,
      }));
    }
  }

  async calculateContractQuantity(symbol: string, sizeBtc: number): Promise<number> {
    return sizeBtc;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    const ticker = await this.getTicker(order.symbol);
    const fillPrice = (order.orderType === 'limit' && order.price && order.price > 0)
      ? order.price
      : (order.side === 'buy' ? ticker.ask : ticker.bid);
    const key = order.productId ? order.productId.toString() : order.symbol;

    const existing = this.virtualPositions.get(key);
    if (existing) {
      if (existing.side === order.side) {
        // Increase position
        const newSize = existing.size + order.size;
        const avgPrice = (existing.entryPrice * existing.size + fillPrice * order.size) / newSize;
        existing.size = newSize;
        existing.entryPrice = avgPrice;
      } else {
        // Reduce or close position
        if (order.size >= existing.size) {
          this.virtualPositions.delete(key);
        } else {
          existing.size -= order.size;
        }
      }
    } else {
      this.virtualPositions.set(key, {
        symbol: order.symbol,
        productId: order.productId,
        side: order.side,
        size: order.size,
        entryPrice: fillPrice,
        markPrice: ticker.mark,
        unrealizedPnl: 0,
      });
    }

    return {
      orderId: `paper-${Date.now()}`,
      status: 'filled',
      filledSize: order.size,
      averagePrice: fillPrice,
      message: `Paper order filled as ${order.orderType.toUpperCase()} @ ${fillPrice}`,
    };
  }

  async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
    return true;
  }

  async getPositions(): Promise<PositionInfo[]> {
    const list: PositionInfo[] = [];
    for (const pos of this.virtualPositions.values()) {
      try {
        const ticker = await this.getTicker(pos.symbol);
        const markPrice = ticker.mark || pos.entryPrice;
        const diff = pos.side === 'buy' ? markPrice - pos.entryPrice : pos.entryPrice - markPrice;
        const pnl = diff * pos.size;
        const pnlPercent = pos.entryPrice > 0 ? (diff / pos.entryPrice) * 100 : 0;
        list.push({
          ...pos,
          markPrice,
          unrealizedPnl: parseFloat(pnl.toFixed(2)),
          pnlPercent: parseFloat(pnlPercent.toFixed(2)),
        });
      } catch {
        list.push(pos);
      }
    }
    return list;
  }

  async closePosition(symbol: string, productId?: string | number): Promise<boolean> {
    const key = productId ? productId.toString() : symbol;
    this.virtualPositions.delete(key);
    return true;
  }
}

