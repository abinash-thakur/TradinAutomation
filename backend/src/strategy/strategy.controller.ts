import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { StrategyService } from './strategy.service';
import { Strategy } from '../entities/strategy.entity';
import { TriggerExecutionOptions } from './strategy-engine.service';

@Controller('api/strategies')
export class StrategyController {
  constructor(private readonly strategyService: StrategyService) {}

  @Get()
  async getAll() {
    return this.strategyService.findAll();
  }

  @Get('templates')
  getTemplates() {
    return this.strategyService.getTemplates();
  }

  @Get('default-script')
  getDefaultScript() {
    return { script: this.strategyService.getDefaultScript() };
  }

  @Post('test-script')
  async testScript(@Body() body: { customScript: string; symbol?: string }) {
    return this.strategyService.testScript(body.customScript, body.symbol);
  }

  @Get('logs')
  async getLogs(@Query('strategyId') strategyId?: string) {
    return this.strategyService.getTradeLogs(strategyId);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.strategyService.findOne(id);
  }

  @Post()
  async create(@Body() data: Partial<Strategy>) {
    return this.strategyService.create(data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: Partial<Strategy>) {
    return this.strategyService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.strategyService.delete(id);
  }

  @Post('subscribe')
  async subscribeMultiple(
    @Body()
    body: {
      tickers?: Array<{
        symbol: string;
        futureLots: number;
        optionLots: number;
        brokerAccountId?: string;
        status?: 'ACTIVE' | 'PAUSED';
      }>;
      symbol?: string;
      futureLots?: number;
      optionLots?: number;
      brokerAccountId?: string;
      defaultBrokerAccountId?: string;
    },
  ) {
    if (body.tickers && Array.isArray(body.tickers)) {
      return this.strategyService.subscribeMultiple({
        tickers: body.tickers,
        defaultBrokerAccountId: body.defaultBrokerAccountId,
      });
    }
    if (body.symbol) {
      return this.strategyService.subscribeTicker({
        symbol: body.symbol,
        futureLots: body.futureLots || 2,
        optionLots: body.optionLots || 2,
        brokerAccountId: body.brokerAccountId,
      });
    }
    return { success: false, message: 'Either tickers array or symbol must be provided' };
  }

  @Post('square-off-all')
  async squareOffAll(@Body() body?: { reason?: string }) {
    const res = await this.strategyService.squareOffAll(body?.reason);
    return {
      success: true,
      message: `Squared off positions across ${res.squaredOffCount} strategies`,
      data: res,
    };
  }

  @Post('sync-all')
  async syncAll() {
    const synced = await this.strategyService.syncAllWithBroker();
    return {
      success: true,
      message: `Synchronized ${synced.length} strategies with broker positions`,
      data: synced,
    };
  }

  @Post(':id/toggle')
  async toggle(@Param('id') id: string) {
    return this.strategyService.toggleStatus(id);
  }

  @Get(':id/preview-trigger')
  async previewTrigger(@Param('id') id: string) {
    return this.strategyService.previewTrigger(id);
  }

  @Post(':id/trigger')
  async manualTrigger(@Param('id') id: string, @Body() body?: TriggerExecutionOptions) {
    const res = await this.strategyService.manualTrigger(id, body);
    return res;
  }

  @Post(':id/square-off')
  async squareOff(@Param('id') id: string) {
    const success = await this.strategyService.squareOff(id);
    return { success, message: success ? 'All legs squared off' : 'Square off failed' };
  }

  @Post(':id/sync')
  async syncStrategy(@Param('id') id: string) {
    const strategy = await this.strategyService.syncWithBroker(id);
    return {
      success: true,
      message: `Strategy ${strategy.name} synchronized with broker`,
      data: strategy,
    };
  }
}

