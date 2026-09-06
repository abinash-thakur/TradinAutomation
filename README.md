# TradePulse AI - Universal Multi-Broker Algorithmic Trading Platform

A modern, **100% broker-agnostic**, **script & dynamic-rule-driven** automated trading platform built with **NestJS (TypeScript)** and **React + Tailwind CSS**.

Strategies are **not hardcoded** in the backend. You can either design strategies visually through intuitive form controls or **manually write your custom algorithmic logic** in a full-fledged browser Code Editor with live simulation testing.

---

## Key Features

1. **Zero Hardcoded Strategies (Manual Code Editor + Visual Builder)**:
   - **Manual Code Editor**: Write standard JavaScript/TypeScript logic functions directly in the browser (`checkEntry(context)`, `getEntryOrders(context)`, `onMonitor(context)`).
   - **Context Cheat-Sheet**: Access `btcPrice`, `ethPrice`, `candles4h`, `indicators.supertrend`, `positions`, `getATMOption()`, and `timeIST`.
   - **Live Sandbox Simulation**: Test run your custom script against real live market data with instantaneous decision & order preview output.
   - **Visual Builder**: Alternatively configure schedules, indicators, multi-leg structures, and profit roll targets visually.

2. **Live Market Streaming (BTC & ETH)**:
   - Real-time ticker streaming directly from exchange endpoints.
   - Cached in **Redis** and pushed via WebSockets.
   - Dual live market pill in the header showing live mark prices and 24h change %.

3. **Interactive Live Option Chain**:
   - Live option matrix for **BTC** and **ETH**.
   - Side-by-side display of Calls (Bid/Ask/Mark/Delta/IV), Strike prices, and Puts (Bid/Ask/Mark/Delta/IV).
   - Automatic detection and emerald highlighting of the **At-The-Money (ATM)** strike.
   - Dynamic settlement expiry filter (daily at 5:30 PM IST / 12:00 UTC).

4. **Universal Broker Abstraction Layer**:
   - Standardized `IBrokerAdapter` interface.
   - **Delta Exchange India** (`api.india.delta.exchange`) & **Delta Exchange Global** (`api.delta.exchange`) with HMAC-SHA256 authentication and contract sizing.
   - **CCXT Connector**: Instant support for 100+ crypto exchanges (Binance, Bybit, Deribit, OKX, Kraken, etc.).
   - **Paper Trading Simulator**: Built-in virtual trading with real live market feeds and $100,000 USD virtual balance for zero-risk testing.

5. **Remote PostgreSQL & Remote Redis Architecture**:
   - Connects to your remote PostgreSQL server (`pg` driver with native `jsonb` columns).
   - Connects to your remote Redis server (`ioredis` driver for microsecond caching & Pub/Sub).
   - **Zero local database server installations**.

6. **Segregated Independent Applications**:
   - Completely decoupled `backend/` and `frontend/` folders with independent `package.json`, `.env.example`, `.env`, and dependencies.

---

## Running Backend & Frontend Individually

### 1. Backend (NestJS)
```bash
cd backend
cp .env.example .env    # Configure your remote PostgreSQL & Redis credentials
pnpm install
pnpm start:dev
```
- REST API: `http://localhost:3000`
- WebSocket Server: `ws://localhost:3000`

### 2. Frontend (React + Vite)
```bash
cd frontend
cp .env.example .env    # Defaults to VITE_API_BASE=http://localhost:3000
pnpm install
pnpm dev
```
- Web UI Dashboard: `http://localhost:5173`

---

## Project Structure

```
TradingAutomation/
├── backend/                            # NestJS Application
│   ├── .env.example                    # Remote DB & Redis env template
│   ├── package.json
│   ├── src/
│   │   ├── brokers/                    # Universal Broker Abstraction
│   │   │   ├── broker.interface.ts     # Standard IBrokerAdapter
│   │   │   ├── broker-factory.service.ts # Adapter resolver
│   │   │   └── adapters/               # Delta, CCXT, Paper Trading
│   │   ├── strategy/                   # Script Runner & Engine
│   │   │   ├── strategy-engine.service.ts
│   │   │   ├── strategy-script-runner.util.ts # Sandboxed JS script executor
│   │   │   └── strategy.controller.ts  # REST API
│   │   ├── market-data/                # Live Ticker & Market Price Engine
│   │   │   ├── market.service.ts       # Exchange polling, Redis cache
│   │   │   └── market.controller.ts    # Tickers REST API
│   │   ├── redis/                      # Remote Redis client & Pub/Sub
│   │   └── entities/                   # PostgreSQL TypeORM entities
├── frontend/                           # React + Vite + Tailwind CSS
│   ├── .env.example                    # Frontend env template
│   ├── package.json
│   └── src/
│       ├── components/
│       │   ├── Dashboard/              # Live PnL, Indicators & Controls
│       │   ├── PrebuiltStrategy/       # Universal Covered Call Engine
│       │   ├── BrokerPanel/            # Connect Brokers & Balances
│       │   ├── Positions/              # Real-Time Positions Table
│       │   ├── TradeLogs/              # Live Execution Logs
│       │   └── Navbar.tsx              # Live BTC & ETH Ticker Header
│       └── services/                   # Axios API & WebSocket Client
└── README.md
```
