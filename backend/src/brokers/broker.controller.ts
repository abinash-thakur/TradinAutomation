import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { BrokerService, CreateBrokerAccountDto } from './broker.service';

@Controller('api/brokers')
export class BrokerController {
  constructor(private readonly brokerService: BrokerService) {}

  @Get('ip-info')
  async getIpInfo() {
    return this.brokerService.getOutboundIp();
  }

  @Get('positions')
  async getAllPositions() {
    return this.brokerService.getAllPositions();
  }

  @Get(':id/positions')
  async getAccountPositions(@Param('id') id: string) {
    return this.brokerService.getAccountPositions(id);
  }

  @Post(':id/positions/close')
  async closePosition(
    @Param('id') id: string,
    @Body() body: { symbol: string; productId?: string | number },
  ) {
    return this.brokerService.closeAccountPosition(id, body.symbol, body.productId);
  }

  @Get()
  async getAll() {
    return this.brokerService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateBrokerAccountDto) {
    return this.brokerService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateBrokerAccountDto>) {
    return this.brokerService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.brokerService.remove(id);
  }

  @Post(':id/test')
  async test(@Param('id') id: string) {
    return this.brokerService.testConnection(id);
  }
}

