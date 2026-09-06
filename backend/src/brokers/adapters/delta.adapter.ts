import * as crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
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

export class DeltaExchangeAdapter implements IBrokerAdapter {
  readonly brokerType: string;
  private client: AxiosInstance;
  private credentials: BrokerCredentials;
  private baseUrl: string;
  private productCache: Map<string, number> = new Map([
    ['BTC', 27],
    ['BTCUSD', 27],
    ['BTC/USD', 27],
    ['BTC-USD', 27],
    ['BTCUSDT', 84],
    ['BTC/USDT', 84],
    ['BTC-USDT', 84],
    ['ETH', 3136],
    ['ETHUSD', 3136],
    ['ETH/USD', 3136],
    ['ETH-USD', 3136],
    ['ETHUSDT', 3137],
    ['ETH/USDT', 3137],
    ['ETH-USDT', 3137],
    ['SOL', 14823],
    ['SOLUSD', 14823],
    ['SOL/USD', 14823],
    ['SOL-USD', 14823],
  ]);

  constructor(isIndia: boolean = true) {
    this.brokerType = isIndia ? 'delta-india' : 'delta-global';
    this.baseUrl = isIndia
      ? 'https://api.india.delta.exchange'
      : 'https://api.delta.exchange';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TradePulse/1.0',
      },
    });
  }

  async connect(credentials: BrokerCredentials): Promise<boolean> {
    this.credentials = {
      ...credentials,
      apiKey: credentials.apiKey?.trim() || '',
      apiSecret: credentials.apiSecret?.trim() || '',
      passphrase: credentials.passphrase?.trim(),
    };

    if (credentials.isTestnet) {
      this.baseUrl = this.brokerType === 'delta-india'
        ? 'https://cdn-ind.testnet.delta.exchange'
        : 'https://testnet-api.delta.exchange';
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TradePulse/1.0',
      },
    });

    return true;
  }

  private getAuthHeaders(method: string, path: string, payload: any = ''): Record<string, string> {
    if (!this.credentials?.apiKey || !this.credentials?.apiSecret) {
      return {};
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : '';
    const message = method.toUpperCase() + timestamp + path + bodyStr;
    const signature = crypto
      .createHmac('sha256', this.credentials.apiSecret)
      .update(message)
      .digest('hex');

    return {
      'api-key': this.credentials.apiKey,
      'timestamp': timestamp,
      'signature': signature,
      'User-Agent': 'TradePulse/1.0',
    };
  }

  private formatErrorMessage(err: any): string {
    const errorData = err.response?.data?.error;
    if (typeof errorData === 'string') {
      if (errorData === 'unauthorized') {
        return '401 Unauthorized: Delta Exchange rejected your API key or signature. Please ensure the API key is active, you selected Delta India vs Global correctly, and check IP restriction settings in Delta.';
      }
      return errorData;
    }

    if (errorData && typeof errorData === 'object') {
      const code = errorData.code || '';
      let details = '';
      if (errorData.context) {
        if (typeof errorData.context === 'string') {
          details = errorData.context;
        } else if (Array.isArray(errorData.context.validation_errors)) {
          details = errorData.context.validation_errors.join(', ');
        } else {
          try {
            details = JSON.stringify(errorData.context);
          } catch {
            details = String(errorData.context);
          }
        }
      }

      if (code === 'ip_not_whitelisted_for_api_key') {
        const clientIp = errorData.context?.client_ip || '';
        return `IP Restriction Error: Your current outbound IP (${clientIp}) is not whitelisted on Delta Exchange. Please log into Delta Exchange > Settings > API Management, edit your API key, and add ${clientIp} to the IP Whitelist (or leave the IP Whitelist blank/unrestricted).`;
      }
      if (code === 'invalid_api_key') {
        return `Invalid API Key: Delta Exchange could not validate this API key. Verify that your API key is for ${this.brokerType === 'delta-india' ? 'Delta Exchange India' : 'Delta Exchange Global'} and has not been deleted or expired.`;
      }
      if (code === 'expired_signature') {
        return 'Signature Expired: System clock drift exceeded Delta Exchange\'s 5-second window. Sync system time with NTP.';
      }
      if (errorData.message) {
        return `${code ? `[${code}] ` : ''}${errorData.message}${details ? ` (${details})` : ''}`;
      }
      if (code) {
        return `Delta API Error: ${code}${details ? ` - ${details}` : ''}`;
      }
    }

    if (err.response?.data?.message) {
      return err.response.data.message;
    }

    return err.message || 'Connection failed';
  }

  async testConnection(): Promise<{ success: boolean; message: string; balance?: number }> {
    try {
      const path = '/v2/wallet/balances';
      const headers = this.getAuthHeaders('GET', path);
      
      const res = await this.client.get(path, { headers });
      if (res.data && res.data.success) {
        const balances = res.data.result || [];
        const usdt = balances.find((b: any) => b.asset_symbol === 'USDT' || b.asset_symbol === 'USD' || b.asset_symbol === 'INR') || { balance: '0' };
        return {
          success: true,
          message: `Connected successfully to Delta Exchange (${this.brokerType}).`,
          balance: parseFloat(usdt.balance || '0'),
        };
      }
      return { success: false, message: 'Invalid response from Delta Exchange API' };
    } catch (err: any) {
      const errMsg = this.formatErrorMessage(err);
      return { success: false, message: errMsg };
    }
  }

  async getTicker(symbol: string = 'BTCUSD'): Promise<TickerData> {
    try {
      const res = await this.client.get(`/v2/tickers/${symbol}`);
      const d = res.data.result;
      return {
        symbol,
        last: parseFloat(d.close || d.mark_price || '0'),
        mark: parseFloat(d.mark_price || d.close || '0'),
        bid: parseFloat(d.quotes?.best_bid || d.mark_price || '0'),
        ask: parseFloat(d.quotes?.best_ask || d.mark_price || '0'),
      };
    } catch (err) {
      // Fallback to public products list if single ticker fails
      const res = await this.client.get('/v2/tickers');
      const item = res.data.result.find((t: any) => t.symbol === symbol || t.symbol === 'BTCUSD');
      if (item) {
        return {
          symbol,
          last: parseFloat(item.close || item.mark_price || '0'),
          mark: parseFloat(item.mark_price || item.close || '0'),
          bid: parseFloat(item.quotes?.best_bid || item.mark_price || '0'),
          ask: parseFloat(item.quotes?.best_ask || item.mark_price || '0'),
        };
      }
      throw err;
    }
  }

  async getCandles(symbol: string, timeframe: string, limit: number = 100): Promise<Candle[]> {
    try {
      // Delta resolutions: '1m', '5m', '15m', '30m', '1h', '2h', '4h', '1d'
      const resolution = timeframe.toLowerCase();
      const end = Math.floor(Date.now() / 1000);
      let stepSeconds = 4 * 3600; // default 4h
      if (resolution === '1h') stepSeconds = 3600;
      if (resolution === '15m') stepSeconds = 15 * 60;
      if (resolution === '1d') stepSeconds = 86400;

      const start = end - (limit * stepSeconds);

      const res = await this.client.get('/v2/history/candles', {
        params: {
          symbol: symbol || 'BTCUSD',
          resolution: resolution,
          start: start,
          end: end,
        },
      });

      const candlesRaw = res.data.result || [];
      return candlesRaw.map((c: any) => ({
        timestamp: c.time * 1000,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume || '0'),
      }));
    } catch (err) {
      console.error('Error fetching candles from Delta Exchange', err);
      return [];
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

      const res = await this.client.get('/v2/tickers', {
        params: {
          contract_types: 'call_options,put_options',
          underlying_asset_symbols: underlying,
        },
      });

      const list = res.data.result || [];

      // Extract 6-digit DDMMYY expiry code from expiryDate (e.g. "07-09-2026" -> "070926")
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

      // Filter by expiry if provided. If exact expiry not found, fallback to full list so caller can choose nearest.
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
    } catch (err) {
      console.error('Error fetching option chain from Delta Exchange', err);
      return [];
    }
  }

  async calculateContractQuantity(symbol: string, sizeBtc: number): Promise<number> {
    try {
      const res = await this.client.get('/v2/products');
      const products = res.data.result || [];
      const product = products.find((p: any) => p.symbol === symbol || p.symbol === 'BTCUSD');
      if (product) {
        const contractValue = parseFloat(product.contract_value || '0.001');
        if (contractValue > 0) {
          // If 1 contract = 0.001 BTC, then 2 BTC = 2 / 0.001 = 2000 contracts
          // If contract_value is USD based (e.g. 1 USD per contract), size = 2 * btcPrice / contractValue
          if (product.quoting_asset?.symbol === 'USD' && product.contract_type === 'perpetual_futures') {
            if (product.contract_value_currency_type === 'BASE') {
              return Math.round(sizeBtc / contractValue);
            }
          }
          return Math.round(sizeBtc / contractValue);
        }
      }
      // Standard default for BTC contracts on Delta
      return Math.round(sizeBtc / 0.001);
    } catch (err) {
      return Math.round(sizeBtc / 0.001);
    }
  }

  async getProductId(symbol: string): Promise<number | undefined> {
    if (!symbol) return undefined;
    const key = symbol.trim().toUpperCase();
    if (this.productCache.has(key)) {
      return this.productCache.get(key);
    }

    try {
      const res = await this.client.get('/v2/products');
      const products = res.data?.result || [];
      for (const p of products) {
        if (p.symbol && p.id) {
          const numId = Number(p.id);
          this.productCache.set(p.symbol.toUpperCase(), numId);
          const clean = p.symbol.replace(/[\/\-_]/g, '').toUpperCase();
          this.productCache.set(clean, numId);
        }
      }
    } catch (err: any) {
      console.error(`Failed to fetch Delta products list for symbol lookup: ${err?.message || err}`);
    }

    return this.productCache.get(key);
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    try {
      const path = '/v2/orders';
      const orderTypeStr = (order.orderType || '').toLowerCase();
      const deltaOrderType = (orderTypeStr === 'market' || orderTypeStr === 'market_order')
        ? 'market_order'
        : 'limit_order';

      let resolvedProductId: number | undefined;
      if (order.productId !== undefined && order.productId !== null) {
        const parsed = Number(order.productId);
        if (!isNaN(parsed) && parsed > 0) {
          resolvedProductId = parsed;
        }
      }

      if (!resolvedProductId && order.symbol) {
        resolvedProductId = await this.getProductId(order.symbol);
      }

      if (!resolvedProductId) {
        return {
          orderId: '',
          status: 'rejected',
          filledSize: 0,
          averagePrice: 0,
          message: `Cannot place Delta order: unable to resolve numeric product_id for symbol "${order.symbol}"`,
        };
      }

      const payload: any = {
        product_id: resolvedProductId,
        size: Math.max(1, Math.round(order.size)),
        side: order.side.toLowerCase(),
        order_type: deltaOrderType,
        margin_mode: (order.marginMode || 'portfolio').toLowerCase(),
      };

      if (deltaOrderType === 'limit_order') {
        if (order.price && order.price > 0) {
          payload.limit_price = order.price.toString();
        } else {
          return {
            orderId: '',
            status: 'rejected',
            filledSize: 0,
            averagePrice: 0,
            message: `Limit order requires a valid limit_price > 0 (received ${order.price})`,
          };
        }
      }

      const headers = this.getAuthHeaders('POST', path, payload);
      const res = await this.client.post(path, payload, { headers });

      if (res.data && res.data.success) {
        const o = res.data.result;
        return {
          orderId: o.id?.toString() || Date.now().toString(),
          status: o.state === 'filled' ? 'filled' : 'open',
          filledSize: parseFloat(o.size || '0'),
          averagePrice: parseFloat(o.average_fill_price || o.limit_price || order.price?.toString() || '0'),
        };
      }
      return {
        orderId: '',
        status: 'rejected',
        filledSize: 0,
        averagePrice: 0,
        message: this.formatErrorMessage({ response: res }),
      };
    } catch (err: any) {
      const msg = this.formatErrorMessage(err);
      return {
        orderId: '',
        status: 'rejected',
        filledSize: 0,
        averagePrice: 0,
        message: msg,
      };
    }
  }

  async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
    try {
      const path = '/v2/orders';
      const numericId = parseInt(orderId, 10);
      const payload: any = {
        id: isNaN(numericId) ? orderId : numericId,
      };
      if (symbol) {
        const pid = await this.getProductId(symbol);
        if (pid) {
          payload.product_id = pid;
        }
      }
      const headers = this.getAuthHeaders('DELETE', path, payload);
      const res = await this.client.delete(path, { data: payload, headers });
      return res.data && res.data.success;
    } catch (err) {
      return false;
    }
  }

  private calculateDeltaPositionPnl(
    p: any,
    entryPrice: number,
    markPrice: number,
    rawSize: number,
  ): { pnl: number; pnlPercent: number } {
    const isBuy = rawSize > 0;
    const contractValue = parseFloat(p.product?.contract_value || '1');
    const isOption =
      p.product?.contract_type?.includes('option') ||
      p.product_symbol?.startsWith('C-') ||
      p.product_symbol?.startsWith('P-') ||
      p.symbol?.startsWith('C-') ||
      p.symbol?.startsWith('P-');

    // 1. Percentage PnL relative to entry price:
    // Long: (markPrice - entryPrice) / entryPrice * 100
    // Short: (entryPrice - markPrice) / entryPrice * 100
    const pnlPercent =
      entryPrice > 0
        ? ((markPrice - entryPrice) / entryPrice) * 100 * (isBuy ? 1 : -1)
        : 0;

    // 2. Dollar Unrealized PnL:
    // On Delta Exchange, options are cash-settled on trade:
    // p.realized_cashflow represents cash received (+ for short) or paid (- for long) at entry.
    // p.unrealized_cashflow represents current mark liability/asset to close at mark price.
    // Therefore, Net PnL = realized_cashflow + unrealized_cashflow.
    // Note: Delta's raw p.unrealized_pnl for options is just the raw unsigned mark valuation (e.g. 0.22), NOT the PnL!
    let pnl: number;
    if (isOption && (p.realized_cashflow !== undefined || p.unrealized_cashflow !== undefined)) {
      pnl = parseFloat(p.realized_cashflow || '0') + parseFloat(p.unrealized_cashflow || '0');
    } else if (entryPrice > 0 && markPrice > 0) {
      pnl = (markPrice - entryPrice) * (isBuy ? 1 : -1) * Math.abs(rawSize) * contractValue;
    } else {
      pnl = parseFloat(p.unrealized_pnl || p.realized_pnl || '0');
    }

    return {
      pnl: parseFloat(pnl.toFixed(4)),
      pnlPercent: parseFloat(pnlPercent.toFixed(2)),
    };
  }

  async getPosition(productId: string | number): Promise<PositionInfo | null> {
    try {
      const path = `/v2/positions?product_id=${productId}`;
      const headers = this.getAuthHeaders('GET', path);
      const res = await this.client.get(path, { headers });
      const pos = res.data?.result;
      if (!pos || parseFloat(pos.size || '0') === 0) {
        return null;
      }
      const rawSize = parseFloat(pos.size);
      const entryPrice = parseFloat(pos.entry_price || '0');
      const markPrice = parseFloat(pos.mark_price || '0');
      const { pnl, pnlPercent } = this.calculateDeltaPositionPnl(pos, entryPrice, markPrice, rawSize);

      return {
        symbol: pos.product?.symbol || pos.product_symbol || '',
        productId: pos.product_id || productId,
        side: rawSize > 0 ? 'buy' : 'sell',
        size: Math.abs(rawSize),
        entryPrice,
        markPrice,
        unrealizedPnl: pnl,
        pnlPercent,
      };
    } catch (err) {
      return null;
    }
  }

  async getPositions(): Promise<PositionInfo[]> {
    try {
      const path = '/v2/positions/margined';
      const headers = this.getAuthHeaders('GET', path);
      const res = await this.client.get(path, { headers });
      const positions = res.data.result || [];
      return positions
        .filter((p: any) => parseFloat(p.size || '0') !== 0)
        .map((p: any) => {
          const entryPrice = parseFloat(p.entry_price || '0');
          const markPrice = parseFloat(p.mark_price || '0');
          const rawSize = parseFloat(p.size || '0');
          const { pnl, pnlPercent } = this.calculateDeltaPositionPnl(p, entryPrice, markPrice, rawSize);

          return {
            symbol: p.product_symbol || p.product?.symbol || p.symbol || '',
            productId: p.product_id || p.product?.id,
            side: rawSize > 0 ? 'buy' : 'sell',
            size: Math.abs(rawSize),
            entryPrice,
            markPrice,
            unrealizedPnl: pnl,
            pnlPercent,
            margin: parseFloat(p.margin || '0'),
          };
        });
    } catch (err: any) {
      const msg = this.formatErrorMessage(err);
      throw new Error(msg);
    }
  }

  async closePosition(symbol: string, productId?: string | number): Promise<boolean> {
    try {
      let pos: PositionInfo | undefined;
      const positions = await this.getPositions();
      pos = positions.find(
        (p) =>
          (productId && String(p.productId) === String(productId)) ||
          (p.symbol && p.symbol.toUpperCase() === symbol.toUpperCase()),
      );

      // If not found in bulk positions list, verify with product-specific endpoint
      if (!pos && productId) {
        pos = (await this.getPosition(productId)) || undefined;
      }

      if (!pos || pos.size === 0) {
        return true;
      }

      // Reverse order to close position immediately via market order
      const closeSide = pos.side === 'buy' ? 'sell' : 'buy';
      const res = await this.placeOrder({
        symbol: pos.symbol || symbol,
        productId: pos.productId || productId,
        side: closeSide,
        orderType: 'market',
        size: pos.size,
      });

      return res.status === 'filled' || res.status === 'open';
    } catch (err) {
      console.error('Failed to close position on Delta', err);
      return false;
    }
  }
}

