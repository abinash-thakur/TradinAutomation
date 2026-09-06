# TradePulse AI - Backend (NestJS)

Universal Algorithmic Trading Engine and REST/WebSocket API.

---

## Running the Backend Individually

### 1. Prerequisites
- Node.js >= 20
- pnpm (`npm install -g pnpm`)

### 2. Environment Setup (Remote PostgreSQL & Redis)
No database servers are installed locally. Connect to your remote server by editing `.env`:

```env
# Remote PostgreSQL Database
DB_HOST=your-remote-postgres-host.com
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_secure_password
DB_NAME=trading_platform
DB_SSL=false   # Set to true if remote host requires SSL (AWS RDS, Supabase, Neon)

# Or use full URL:
# DATABASE_URL=postgresql://user:pass@remote-host:5432/trading_platform?sslmode=require

# Remote Redis Server (Real-time Caching & Pub/Sub)
REDIS_HOST=your-remote-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=false   # Set to true if using TLS/SSL

# Or use full URL:
# REDIS_URL=redis://default:password@remote-redis-host:6379
```

TypeORM is configured with `synchronize: true`, which means it will automatically create all tables (`broker_accounts`, `strategies`, `trade_logs`) on your remote database upon connection.

### 3. Install Dependencies
```bash
pnpm install
```

### 4. Run Backend in Development Mode
```bash
pnpm start:dev
```

### 5. Build and Run in Production Mode
```bash
pnpm build
pnpm start:prod
```

---

## Endpoints Summary

- **Brokers API**:
  - `GET /api/brokers`: List connected accounts (masked keys)
  - `POST /api/brokers`: Connect new exchange account
  - `POST /api/brokers/:id/test`: Instant connection ping & wallet balance check
  - `DELETE /api/brokers/:id`: Remove broker
- **Strategies API**:
  - `GET /api/strategies`: List all configured strategies
  - `POST /api/strategies`: Deploy new strategy from UI
  - `PUT /api/strategies/:id`: Update strategy parameters
  - `POST /api/strategies/:id/toggle`: Pause or activate
  - `POST /api/strategies/:id/trigger`: Manual routine evaluation
  - `POST /api/strategies/:id/square-off`: Emergency square-off all legs
  - `GET /api/strategies/templates`: Pre-configured strategy templates
  - `GET /api/strategies/logs`: Trade audit logs
- **WebSocket Gateway**:
  - Connect via `ws://localhost:3000` (Socket.IO) for live tickers, PnL updates, and trade alerts.
