import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Strategy } from '../entities/strategy.entity';
import { StrategyEngineService } from '../strategy/strategy-engine.service';
import { toZonedTime, format } from 'date-fns-tz';
import { differenceInCalendarDays, parseISO } from 'date-fns';

@Injectable()
export class DynamicSchedulerService {
  private readonly logger = new Logger(DynamicSchedulerService.name);
  private triggeredKeys: Set<string> = new Set();
  private lastDateTracked: string = '';

  constructor(
    @InjectRepository(Strategy)
    private readonly strategyRepo: Repository<Strategy>,
    private readonly engine: StrategyEngineService,
  ) {}

  /**
   * Evaluates time and frequency triggers every minute
   * Supports:
   * - Calendar start date
   * - DAILY (Every Day at specified time, e.g. 16:30 / 4:30 PM)
   * - EVERY_N_DAYS (Every 2, 3, 5 days at specified time)
   * - HOURLY (Every 1, 2, 4 hours)
   * - MINUTES (Every 1, 5, 15, 30 minutes)
   */
  @Cron('* * * * *')
  async handleMinuteSchedules() {
    const activeStrategies = await this.strategyRepo.find({ where: { status: 'ACTIVE' } });
    if (activeStrategies.length === 0) return;

    for (const strategy of activeStrategies) {
      const config = strategy.triggerConfig;
      if (!config) continue;

      const tz = config.timezone || 'Asia/Kolkata';
      const nowZoned = toZonedTime(new Date(), tz);
      const currentDate = format(nowZoned, 'yyyy-MM-dd');
      const currentTime = format(nowZoned, 'HH:mm');
      const currentMinute = parseInt(format(nowZoned, 'm'), 10);
      const currentHour = parseInt(format(nowZoned, 'H'), 10);

      // Clean up tracking set on date change
      if (this.lastDateTracked !== currentDate) {
        this.triggeredKeys.clear();
        this.lastDateTracked = currentDate;
      }

      // Check start date (calendar constraint)
      if (config.startDate && currentDate < config.startDate) {
        continue; // Scheduled start date is in the future
      }

      const frequency = config.frequency || 'DAILY';
      const targetTime = config.time || '15:30';
      let shouldTrigger = false;
      let triggerKey = '';

      switch (frequency) {
        case 'DAILY': {
          if (currentTime === targetTime) {
            triggerKey = `${strategy.id}-${currentDate}-${targetTime}`;
            shouldTrigger = true;
          }
          break;
        }

        case 'EVERY_N_DAYS': {
          const daysInterval = Math.max(1, config.intervalValue || 3);
          const baseDate = config.startDate ? parseISO(config.startDate) : new Date(strategy.createdAt);
          const diffDays = Math.abs(differenceInCalendarDays(nowZoned, baseDate));
          if (diffDays % daysInterval === 0 && currentTime === targetTime) {
            triggerKey = `${strategy.id}-${currentDate}-${targetTime}`;
            shouldTrigger = true;
          }
          break;
        }

        case 'HOURLY': {
          const hourInterval = Math.max(1, config.intervalValue || 1);
          const targetMinute = targetTime ? parseInt(targetTime.split(':')[1] || '0', 10) : 0;
          if (currentMinute === targetMinute && currentHour % hourInterval === 0) {
            triggerKey = `${strategy.id}-${currentDate}-${currentHour}:${currentMinute}`;
            shouldTrigger = true;
          }
          break;
        }

        case 'MINUTES': {
          const minuteInterval = Math.max(1, config.intervalValue || 1);
          if (currentMinute % minuteInterval === 0) {
            triggerKey = `${strategy.id}-${currentDate}-${currentHour}:${currentMinute}`;
            shouldTrigger = true;
          }
          break;
        }

        default: {
          if (currentTime === targetTime) {
            triggerKey = `${strategy.id}-${currentDate}-${targetTime}`;
            shouldTrigger = true;
          }
        }
      }

      if (shouldTrigger && triggerKey && !this.triggeredKeys.has(triggerKey)) {
        this.logger.log(
          `Triggering strategy [${strategy.name}] (${frequency}, interval: ${config.intervalValue || 1}, time: ${targetTime}, tz: ${tz})`,
        );
        this.triggeredKeys.add(triggerKey);
        await this.engine.evaluateStrategyTrigger(strategy.id);
      }
    }
  }

  /**
   * Real-time monitoring loop runs every 10 seconds to check:
   * 1. 70% Call Option decay target -> book & roll
   * 2. 4% to 5% Future target -> emergency square-off both
   */
  @Interval(10000)
  async handlePositionMonitoring() {
    await this.engine.monitorActivePositions();
  }
}

