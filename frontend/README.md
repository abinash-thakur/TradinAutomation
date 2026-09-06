# TradePulse AI - Frontend (React + Vite + Tailwind CSS)

Modern visual Strategy Builder, Live Trading Dashboard, and Broker Management Panel.

---

## Running the Frontend Individually

### 1. Prerequisites
- Node.js >= 20
- pnpm (`npm install -g pnpm`)

### 2. Environment Setup
Copy `.env.example` to `.env` (already done by default):
```bash
cp .env.example .env
```

Ensure `VITE_API_BASE` points to your running backend:
```env
VITE_API_BASE=http://localhost:3000
```

### 3. Install Dependencies
```bash
pnpm install
```

### 4. Run Development Server
```bash
pnpm dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.

### 5. Build for Production
```bash
pnpm build
pnpm preview
```

---

## Dashboard Features

1. **Live Dashboard**:
   - Live 4H Supertrend indicator status (🟢 Bullish / 🔴 Bearish).
   - Real-time BTC Mark price ticker.
   - Active open Future & Call option legs with real-time PnL.
   - Visual progress bars towards the 70% option decay target and 4.5% future target.
   - Emergency controls: **"Emergency Square Off All"**, **"Trigger Check Now"**, and **"Pause Strategy"**.
2. **Visual Strategy Builder**:
   - Form to build and tweak custom strategies visually.
   - Pre-loaded **"Load BTC Covered Call Preset"** button.
3. **Broker Accounts**:
   - Connect Delta Exchange India/Global, CCXT crypto exchanges, or Paper Trading.
   - Instant "Verify Ping" and live wallet balance fetcher.
4. **Execution Trade Logs**:
   - Real-time audit log of all order executions, rolls, and emergency square-offs.
