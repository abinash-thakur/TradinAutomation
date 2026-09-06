import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrokerAccount, BrokerType } from '../entities/broker-account.entity';
import { TradeLog } from '../entities/trade-log.entity';
import { CryptoUtil } from '../config/crypto.util';
import { BrokerFactoryService } from './broker-factory.service';

export interface CreateBrokerAccountDto {
  name: string;
  brokerType: BrokerType;
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  isTestnet?: boolean;
}

@Injectable()
export class BrokerService {
  constructor(
    @InjectRepository(BrokerAccount)
    private readonly brokerRepo: Repository<BrokerAccount>,
    @InjectRepository(TradeLog)
    private readonly tradeLogRepo: Repository<TradeLog>,
    private readonly brokerFactory: BrokerFactoryService,
  ) {}

  async findAll(): Promise<any[]> {
    const accounts = await this.brokerRepo.find({ order: { createdAt: 'DESC' } });
    return accounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      brokerType: acc.brokerType,
      maskedApiKey: acc.encryptedApiKey ? CryptoUtil.mask(CryptoUtil.decrypt(acc.encryptedApiKey)) : 'N/A',
      isTestnet: acc.isTestnet,
      isActive: acc.isActive,
      lastTestStatus: acc.lastTestStatus,
      lastTestMessage: acc.lastTestMessage,
      balanceUsd: acc.balanceUsd,
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
    }));
  }

  async findOne(id: string): Promise<BrokerAccount> {
    const acc = await this.brokerRepo.findOne({ where: { id } });
    if (!acc) throw new NotFoundException(`Broker account ${id} not found`);
    return acc;
  }

  async create(dto: CreateBrokerAccountDto): Promise<BrokerAccount> {
    const account = this.brokerRepo.create({
      name: dto.name?.trim(),
      brokerType: dto.brokerType,
      encryptedApiKey: dto.apiKey ? CryptoUtil.encrypt(dto.apiKey.trim()) : '',
      encryptedApiSecret: dto.apiSecret ? CryptoUtil.encrypt(dto.apiSecret.trim()) : '',
      encryptedPassphrase: dto.passphrase ? CryptoUtil.encrypt(dto.passphrase.trim()) : '',
      isTestnet: !!dto.isTestnet,
      isActive: true,
      balanceUsd: 0,
    });

    const saved = await this.brokerRepo.save(account);
    // Auto test connection on creation
    await this.testConnection(saved.id);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: Partial<CreateBrokerAccountDto>): Promise<BrokerAccount> {
    const account = await this.findOne(id);
    if (dto.name !== undefined) account.name = dto.name.trim();
    if (dto.brokerType !== undefined) account.brokerType = dto.brokerType;
    if (dto.apiKey !== undefined) account.encryptedApiKey = CryptoUtil.encrypt(dto.apiKey.trim());
    if (dto.apiSecret !== undefined) account.encryptedApiSecret = CryptoUtil.encrypt(dto.apiSecret.trim());
    if (dto.passphrase !== undefined) account.encryptedPassphrase = CryptoUtil.encrypt(dto.passphrase.trim());
    if (dto.isTestnet !== undefined) account.isTestnet = dto.isTestnet;

    this.brokerFactory.clearAdapter(id);
    await this.brokerRepo.save(account);
    await this.testConnection(id);
    return this.findOne(id);
  }

  async remove(id: string): Promise<boolean> {
    this.brokerFactory.clearAdapter(id);
    await this.brokerRepo.delete(id);
    return true;
  }

  async testConnection(id: string): Promise<{ success: boolean; message: string; balance?: number }> {
    this.brokerFactory.clearAdapter(id);
    const account = await this.findOne(id);
    const adapter = await this.brokerFactory.getAdapter(account);
    const result = await adapter.testConnection();

    account.lastTestStatus = result.success ? 'SUCCESS' : 'FAILED';
    account.lastTestMessage = result.message;
    if (result.balance !== undefined) {
      account.balanceUsd = result.balance;
    }
    await this.brokerRepo.save(account);

    return result;
  }

  async getOutboundIp(): Promise<{ ipv4?: string; ipv6?: string }> {
    try {
      const [v4Res, v6Res] = await Promise.allSettled([
        fetch('https://api.ipify.org?format=json').then((r) => r.json()),
        fetch('https://api6.ipify.org?format=json').then((r) => r.json()),
      ]);

      return {
        ipv4: v4Res.status === 'fulfilled' ? v4Res.value.ip : undefined,
        ipv6: v6Res.status === 'fulfilled' ? v6Res.value.ip : undefined,
      };
    } catch {
      return {};
    }
  }

  async getAllPositions(): Promise<Array<{
    brokerAccountId: string;
    brokerName: string;
    brokerType: string;
    isTestnet: boolean;
    positions: any[];
    error?: string;
  }>> {
    const accounts = await this.brokerRepo.find({ where: { isActive: true } });
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const adapter = await this.brokerFactory.getAdapter(account);
          const positions = await adapter.getPositions();
          return {
            brokerAccountId: account.id,
            brokerName: account.name,
            brokerType: account.brokerType,
            isTestnet: account.isTestnet,
            positions,
          };
        } catch (err: any) {
          return {
            brokerAccountId: account.id,
            brokerName: account.name,
            brokerType: account.brokerType,
            isTestnet: account.isTestnet,
            positions: [],
            error: err.message || 'Failed to fetch positions',
          };
        }
      }),
    );
    return results;
  }

  async getAccountPositions(accountId: string): Promise<{
    brokerAccountId: string;
    brokerName: string;
    positions: any[];
  }> {
    const account = await this.findOne(accountId);
    const adapter = await this.brokerFactory.getAdapter(account);
    const positions = await adapter.getPositions();
    return {
      brokerAccountId: account.id,
      brokerName: account.name,
      positions,
    };
  }

  async closeAccountPosition(accountId: string, symbol: string, productId?: string | number): Promise<boolean> {
    const account = await this.findOne(accountId);
    const adapter = await this.brokerFactory.getAdapter(account);
    const success = await adapter.closePosition(symbol, productId);
    if (success) {
      try {
        let markPrice = 0;
        try {
          const ticker = await adapter.getTicker(symbol);
          markPrice = ticker.mark || ticker.last || 0;
        } catch {}

        await this.tradeLogRepo.save({
          brokerType: account.brokerType,
          symbol,
          action: 'MANUAL_CLOSE',
          price: markPrice,
          quantity: 1,
          details: `Manual position closed from Live Positions tab on ${account.name}`,
        });
      } catch {
        // ignore log error
      }
    }
    return success;
  }
}

