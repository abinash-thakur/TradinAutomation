import { Module, Global } from '@nestjs/common';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';
import { StrategyGateway } from '../strategy/strategy.gateway';

@Global()
@Module({
  controllers: [MarketController],
  providers: [MarketService, StrategyGateway],
  exports: [MarketService],
})
export class MarketDataModule {}

