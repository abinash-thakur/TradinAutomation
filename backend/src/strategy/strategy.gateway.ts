import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class StrategyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(StrategyGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwt: JwtService) {}

  /**
   * JwtAuthGuard (APP_GUARD) only intercepts HTTP requests, not the Socket.IO handshake, so the
   * gateway verifies the token itself here. The frontend sends it as `socket.io(url, { auth: { token } })`.
   */
  async handleConnection(client: Socket) {
    const token = (client.handshake.auth as any)?.token || (client.handshake.query as any)?.token;
    if (!token) {
      this.logger.warn(`Socket ${client.id} rejected: no auth token`);
      client.disconnect(true);
      return;
    }
    try {
      await this.jwt.verifyAsync(token);
    } catch {
      this.logger.warn(`Socket ${client.id} rejected: invalid/expired token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    // Client disconnected
  }

  broadcastPriceUpdate(data: { symbol: string; price: number; markPrice: number }) {
    if (this.server) {
      this.server.emit('price-update', data);
    }
  }

  broadcastStrategyUpdate(data: any) {
    if (this.server) {
      this.server.emit('strategy-update', data);
    }
  }

  broadcastTradeLog(log: any) {
    if (this.server) {
      this.server.emit('trade-log', log);
    }
  }

  broadcastIndicatorStatus(data: { strategyId: string; trend: string; value: number; lastChecked: string }) {
    if (this.server) {
      this.server.emit('indicator-status', data);
    }
  }
}

