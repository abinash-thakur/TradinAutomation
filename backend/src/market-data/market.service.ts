import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import axios from 'axios';
import { RedisService } from '../redis/redis.service';
import { StrategyGateway } from '../strategy/strategy.gateway';

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

@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketService.name);
  private pollingTimer: NodeJS.Timeout | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private wsPingTimer: NodeJS.Timeout | null = null;
  private deltaWs: any = null;
  private isDestroyed = false;
  private readonly baseUrl = 'https://api.india.delta.exchange';
  private latestTickers: Record<string, TickerSummary> = {};

  constructor(
    private readonly redis: RedisService,
    private readonly gateway: StrategyGateway,
  ) {}

  onModuleInit() {
    this.startPricePolling();
    this.initDeltaWebSocket();
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    if (this.wsPingTimer) clearInterval(this.wsPingTimer);
    if (this.deltaWs) {
      try {
        this.deltaWs.close();
      } catch {}
    }
  }

  /**
   * 1-Second real-time polling loop for continuous live prices
   */
  private startPricePolling() {
    this.fetchLivePrices();
    this.pollingTimer = setInterval(() => {
      this.fetchLivePrices();
    }, 1000); // every 1 second
  }

  /**
   * Connects to Delta Exchange live public WebSocket stream for sub-second updates
   */
  private initDeltaWebSocket() {
    if (typeof (globalThis as any).WebSocket !== 'function') return;

    try {
      const wsUrl = 'wss://public-socket.india.delta.exchange';
      const ws = new (globalThis as any).WebSocket(wsUrl);
      this.deltaWs = ws;

      ws.onopen = () => {
        this.logger.log('Connected to Delta Exchange Live Public WebSocket stream');
        const subscribePayload = {
          type: 'subscribe',
          payload: {
            channels: [
              {
                name: 'mark_price',
                symbols: ['MARK:BTCUSD', 'MARK:ETHUSD'],
              },
              {
                name: 'ticker',
                symbols: ['BTCUSD', 'ETHUSD'],
              },
            ],
          },
        };
        try {
          ws.send(JSON.stringify(subscribePayload));
        } catch {}

        if (this.wsPingTimer) clearInterval(this.wsPingTimer);
        this.wsPingTimer = setInterval(() => {
          try {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          } catch {}
        }, 30000);
      };

      ws.onmessage = (event: any) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : event.data.toString();
          const msg = JSON.parse(raw);
          this.handleDeltaWsMessage(msg);
        } catch {}
      };

      ws.onclose = () => {
        if (!this.isDestroyed) {
          if (this.wsPingTimer) clearInterval(this.wsPingTimer);
          this.wsReconnectTimer = setTimeout(() => this.initDeltaWebSocket(), 3000);
        }
      };

      ws.onerror = (err: any) => {
        this.logger.warn(`Delta WebSocket: ${err.message || 'reconnecting'}`);
      };
    } catch (e: any) {
      this.logger.warn(`Failed to connect Delta WebSocket: ${e.message}`);
    }
  }

  private handleDeltaWsMessage(msg: any) {
    if (!msg || !msg.type) return;

    if (msg.type === 'mark_price') {
      const symbol = msg.sy || '';
      const isBtc = symbol.includes('BTC');
      const isEth = symbol.includes('ETH');
      if (!isBtc && !isEth) return;

      const underlying = isBtc ? 'BTC' : 'ETH';
      const markPrice = parseFloat(msg.p || '0');
      if (markPrice <= 0) return;

      if (!this.latestTickers[underlying]) {
        this.latestTickers[underlying] = {
          symbol: isBtc ? 'BTCUSD' : 'ETHUSD',
          underlying,
          markPrice,
          lastPrice: markPrice,
          bid: markPrice,
          ask: markPrice,
          change24h: 0,
          high24h: markPrice,
          low24h: markPrice,
          volume24h: 0,
          updatedAt: new Date().toISOString(),
        };
      } else {
        this.latestTickers[underlying].markPrice = markPrice;
        this.latestTickers[underlying].updatedAt = new Date().toISOString();
      }

      this.redis.setPrice(this.latestTickers[underlying].symbol, markPrice, 60).catch(() => {});
      this.gateway.server?.emit('market-tickers', this.latestTickers);

      if (underlying === 'BTC') {
        this.gateway.broadcastPriceUpdate({
          symbol: 'BTCUSD',
          price: this.latestTickers['BTC'].lastPrice,
          markPrice: markPrice,
        });
      }
    } else if (msg.type === 'ticker') {
      const item = msg.d?.[0];
      if (!item) return;

      const symbol = item.s || msg.sy || '';
      const isBtc = symbol.includes('BTC');
      const isEth = symbol.includes('ETH');
      if (!isBtc && !isEth) return;

      const underlying = isBtc ? 'BTC' : 'ETH';
      const markPrice = parseFloat(item.m || '0');
      const lastPrice = item.ohlc?.[3] ? parseFloat(item.ohlc[3]) : (markPrice || 0);
      const bid = item.q?.[0] ? parseFloat(item.q[0]) : (markPrice || 0);
      const ask = item.q?.[2] ? parseFloat(item.q[2]) : (markPrice || 0);
      const change24h = parseFloat(item.m24hc || '0');

      if (!this.latestTickers[underlying]) {
        this.latestTickers[underlying] = {
          symbol,
          underlying,
          markPrice: markPrice || lastPrice,
          lastPrice,
          bid,
          ask,
          change24h,
          high24h: item.ohlc?.[1] ? parseFloat(item.ohlc[1]) : lastPrice,
          low24h: item.ohlc?.[2] ? parseFloat(item.ohlc[2]) : lastPrice,
          volume24h: item.to?.[0] ? parseFloat(item.to[0]) : 0,
          updatedAt: new Date().toISOString(),
        };
      } else {
        if (markPrice > 0) this.latestTickers[underlying].markPrice = markPrice;
        if (lastPrice > 0) this.latestTickers[underlying].lastPrice = lastPrice;
        if (bid > 0) this.latestTickers[underlying].bid = bid;
        if (ask > 0) this.latestTickers[underlying].ask = ask;
        this.latestTickers[underlying].change24h = change24h;
        this.latestTickers[underlying].updatedAt = new Date().toISOString();
      }

      this.gateway.server?.emit('market-tickers', this.latestTickers);
    }
  }

  async fetchLivePrices() {
    try {
      const res = await axios.get(
        `${this.baseUrl}/v2/tickers?contract_types=perpetual_futures&underlying_asset_symbols=BTC,ETH`,
        { timeout: 4000 }
      );

      const items = res.data?.result || [];
      const updated: Record<string, TickerSummary> = {};

      for (const item of items) {
        const isBtc = item.symbol.startsWith('BTC');
        const isEth = item.symbol.startsWith('ETH');
        if (!isBtc && !isEth) continue;

        const underlying = isBtc ? 'BTC' : 'ETH';
        const markPrice = parseFloat(item.mark_price || item.close || '0');
        const lastPrice = parseFloat(item.close || markPrice.toString());
        const bid = parseFloat(item.quotes?.best_bid || markPrice.toString());
        const ask = parseFloat(item.quotes?.best_ask || markPrice.toString());
        const change24h = parseFloat(item.price_change_percent_24h || '0');
        const high24h = parseFloat(item.high_24h || markPrice.toString());
        const low24h = parseFloat(item.low_24h || markPrice.toString());
        const volume24h = parseFloat(item.volume_24h || '0');

        const summary: TickerSummary = {
          symbol: item.symbol,
          underlying,
          markPrice,
          lastPrice,
          bid,
          ask,
          change24h,
          high24h,
          low24h,
          volume24h,
          updatedAt: new Date().toISOString(),
        };

        updated[underlying] = summary;
        this.latestTickers[underlying] = summary;

        // Cache in Redis
        await this.redis.setPrice(item.symbol, markPrice, 60);
      }

      // Broadcast to all connected UI clients via WebSocket
      this.gateway.server?.emit('market-tickers', updated);

      if (updated['BTC']) {
        this.gateway.broadcastPriceUpdate({
          symbol: 'BTCUSD',
          price: updated['BTC'].lastPrice,
          markPrice: updated['BTC'].markPrice,
        });
      }
    } catch (err: any) {
      // Quiet fail if temporary network glitch
    }
  }

  getTickers(): Record<string, TickerSummary> {
    return this.latestTickers;
  }
}

