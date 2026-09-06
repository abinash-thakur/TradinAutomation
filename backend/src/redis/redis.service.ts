import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.initRedis();
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  private initRedis() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    const host = this.config.get<string>('REDIS_HOST') || 'localhost';
    const port = Number(this.config.get<number>('REDIS_PORT') || 6379);
    const password = this.config.get<string>('REDIS_PASSWORD') || undefined;
    const tls = this.config.get<string>('REDIS_TLS') === 'true' ? {} : undefined;

    try {
      if (redisUrl) {
        this.client = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => Math.min(times * 1000, 15000),
        });
      } else {
        this.client = new Redis({
          host,
          port,
          password,
          tls,
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => Math.min(times * 1000, 15000),
        });
      }

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`✅ Connected to Remote Redis server at ${host}:${port}`);
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection warning: ${err.message}. Engine will continue safely without cache.`);
      });
    } catch (err: any) {
      this.logger.warn(`Failed to initialize Redis client: ${err.message}`);
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async setPrice(symbol: string, price: number, ttlSeconds: number = 60): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.set(`price:${symbol}`, price.toString(), 'EX', ttlSeconds);
    } catch {}
  }

  async getPrice(symbol: string): Promise<number | null> {
    if (!this.client || !this.isConnected) return null;
    try {
      const val = await this.client.get(`price:${symbol}`);
      return val ? parseFloat(val) : null;
    } catch {
      return null;
    }
  }

  async setIndicatorState(key: string, data: any, ttlSeconds: number = 300): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.set(`indicator:${key}`, JSON.stringify(data), 'EX', ttlSeconds);
    } catch {}
  }

  async getIndicatorState(key: string): Promise<any | null> {
    if (!this.client || !this.isConnected) return null;
    try {
      const val = await this.client.get(`indicator:${key}`);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  async publish(channel: string, message: any): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      const str = typeof message === 'string' ? message : JSON.stringify(message);
      await this.client.publish(channel, str);
    } catch {}
  }
}

