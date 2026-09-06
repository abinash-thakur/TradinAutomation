import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Strategy } from '../entities/strategy.entity';
import { TradeLog } from '../entities/trade-log.entity';
import { BrokerAccount } from '../entities/broker-account.entity';
import { StrategyEngineService } from './strategy-engine.service';
import { StrategyService } from './strategy.service';
import { StrategyController } from './strategy.controller';
import { StrategyGateway } from './strategy.gateway';
import { BrokersModule } from '../brokers/brokers.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Strategy, TradeLog, BrokerAccount]),
    BrokersModule,
    EmailModule,
  ],
  controllers: [StrategyController],
  providers: [StrategyEngineService, StrategyService, StrategyGateway],
  exports: [StrategyEngineService, StrategyService, StrategyGateway],
})
export class StrategyModule {}

