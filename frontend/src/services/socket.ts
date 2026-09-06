import { io, Socket } from 'socket.io-client';
import { authStore } from './auth';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (!this.socket) {
      // StrategyGateway checks this handshake token itself (JwtAuthGuard only covers HTTP),
      // and disconnects immediately if it's missing or invalid.
      this.socket = io(API_BASE, {
        transports: ['websocket', 'polling'],
        auth: { token: authStore.getToken() },
      });
    }
    return this.socket;
  }

  getSocket() {
    return this.socket || this.connect();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
