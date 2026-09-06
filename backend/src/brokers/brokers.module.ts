import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerAccount } from '../entities/broker-account.entity';
import { TradeLog } from '../entities/trade-log.entity';
import { BrokerService } from './broker.service';
import { BrokerController } from './broker.controller';
import { BrokerFactoryService } from './broker-factory.service';

@Module({
  imports: [TypeOrmModule.forFeature([BrokerAccount, TradeLog])],
  controllers: [BrokerController],
  providers: [BrokerService, BrokerFactoryService],
  exports: [BrokerService, BrokerFactoryService],
})
export class BrokersModule {}

