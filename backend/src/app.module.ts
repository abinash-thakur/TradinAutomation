import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BrokerAccount } from './entities/broker-account.entity';
import { Strategy } from './entities/strategy.entity';
import { TradeLog } from './entities/trade-log.entity';
import { BrokersModule } from './brokers/brokers.module';
import { StrategyModule } from './strategy/strategy.module';
import { AppSchedulerModule } from './scheduler/scheduler.module';
import { DatabaseSeedService } from './config/database-seed.service';
import { RedisModule } from './redis/redis.module';
import { MarketDataModule } from './market-data/market-data.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    ScheduleModule.forRoot(),
    MarketDataModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        const isSsl = config.get<string>('DB_SSL') === 'true';

        if (url) {
          return {
            type: 'postgres',
            url,
            entities: [BrokerAccount, Strategy, TradeLog],
            synchronize: true,
            ssl: isSsl ? { rejectUnauthorized: false } : false,
          };
        }

        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST', 'localhost'),
          port: Number(config.get<number>('DB_PORT', 5432)),
          username: config.get<string>('DB_USERNAME', 'postgres'),
          password: config.get<string>('DB_PASSWORD', 'postgres'),
          database: config.get<string>('DB_NAME', 'trading_platform'),
          entities: [BrokerAccount, Strategy, TradeLog],
          synchronize: true,
          ssl: isSsl ? { rejectUnauthorized: false } : false,
        };
      },
    }),
    TypeOrmModule.forFeature([BrokerAccount, Strategy, TradeLog]),
    RedisModule,
    BrokersModule,
    StrategyModule,
    AppSchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService, DatabaseSeedService],
})
export class AppModule {}
