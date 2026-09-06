import { io, Socket } from 'socket.io-client';
import { authStore } from './auth';

// `??` (not `||`) so an intentionally-empty VITE_API_BASE ("" - same origin, e.g. behind an
// nginx reverse proxy that forwards /socket.io to the backend) is honored rather than silently
// overridden - only a genuinely *unset* var falls back to the direct-backend default.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (!this.socket) {
      // StrategyGateway checks this handshake token itself (JwtAuthGuard only covers HTTP),
      // and disconnects immediately if it's missing or invalid.
      // socket.io-client treats "" as an actual (invalid) URL rather than "same origin" - pass
      // undefined instead so it defaults to the page's own origin, same as an omitted argument.
      this.socket = io(API_BASE || undefined, {
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
