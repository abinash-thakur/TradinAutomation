import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Strategy } from '../entities/strategy.entity';
import { DynamicSchedulerService } from './dynamic-scheduler.service';
import { StrategyModule } from '../strategy/strategy.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Strategy]),
    StrategyModule,
  ],
  providers: [DynamicSchedulerService],
  exports: [DynamicSchedulerService],
})
export class AppSchedulerModule {}

