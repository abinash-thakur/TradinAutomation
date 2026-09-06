import { Injectable } from '@nestjs/common';
import { IBrokerAdapter } from './broker.interface';
import { BrokerAccount } from '../entities/broker-account.entity';
import { CryptoUtil } from '../config/crypto.util';
import { DeltaExchangeAdapter } from './adapters/delta.adapter';
import { CcxtBrokerAdapter } from './adapters/ccxt.adapter';
import { PaperTradingAdapter } from './adapters/paper-trading.adapter';

@Injectable()
export class BrokerFactoryService {
  private adapterCache: Map<string, IBrokerAdapter> = new Map();

  async getAdapter(account: BrokerAccount): Promise<IBrokerAdapter> {
    const cacheKey = `${account.id}-${account.updatedAt.getTime()}`;
    if (this.adapterCache.has(cacheKey)) {
      return this.adapterCache.get(cacheKey)!;
    }

    let adapter: IBrokerAdapter;

    switch (account.brokerType) {
      case 'delta-india':
        adapter = new DeltaExchangeAdapter(true);
        break;
      case 'delta-global':
        adapter = new DeltaExchangeAdapter(false);
        break;
      case 'paper':
        adapter = new PaperTradingAdapter();
        break;
      case 'binance':
      case 'bybit':
      case 'deribit':
        adapter = new CcxtBrokerAdapter(account.brokerType);
        break;
      default:
        // Default to CCXT if supported or Paper
        adapter = new PaperTradingAdapter();
        break;
    }

    const decryptedKey = CryptoUtil.decrypt(account.encryptedApiKey || '');
    const decryptedSecret = CryptoUtil.decrypt(account.encryptedApiSecret || '');
    const decryptedPassphrase = CryptoUtil.decrypt(account.encryptedPassphrase || '');

    await adapter.connect({
      apiKey: decryptedKey,
      apiSecret: decryptedSecret,
      passphrase: decryptedPassphrase,
      isTestnet: account.isTestnet,
    });

    this.adapterCache.set(cacheKey, adapter);
    return adapter;
  }

  clearAdapter(accountId?: string) {
    if (accountId) {
      for (const key of this.adapterCache.keys()) {
        if (key.startsWith(accountId)) {
          this.adapterCache.delete(key);
        }
      }
    } else {
      this.adapterCache.clear();
    }
  }
}

