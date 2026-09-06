# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TradePulse AI — a broker-agnostic algorithmic crypto trading platform. NestJS backend (`backend/`) drives strategy execution against pluggable broker adapters; a React + Vite dashboard (`frontend/`) is a thin real-time client over REST + Socket.IO.

The two folders are **fully independent pnpm projects**. There is no root `package.json` and no workspace linking them — always `cd backend` or `cd frontend` before running anything.

## Commands

### Backend (`cd backend`)
```bash
pnpm install
pnpm start:dev                    # watch mode, http+ws on :3000
pnpm build && pnpm start:prod
pnpm lint                         # eslint --fix
pnpm format                       # prettier
pnpm test                         # jest, rootDir=src, *.spec.ts
pnpm test -- strategy             # single suite by path/name pattern
pnpm test -- -t "should return"   # single test by name
pnpm test:e2e                     # test/jest-e2e.json
```

### Frontend (`cd frontend`)
```bash
pnpm install
pnpm dev                          # vite on :5173
pnpm build                        # tsc -b && vite build
pnpm lint                         # oxlint (not eslint)
```

Both apps need a `.env` copied from `.env.example`. The backend requires a reachable **remote** PostgreSQL and Redis — there is no local/docker DB setup and no migrations (`synchronize: true` in [app.module.ts](backend/src/app.module.ts)), so schema changes come from editing entities. On first boot [database-seed.service.ts](backend/src/config/database-seed.service.ts) inserts a paper-trading broker, a Delta template account, and BTC/ETH covered-call strategies if the tables are empty.

### Docker (`cd` repo root)
```bash
docker compose up -d --build      # builds + starts both — backend :3000, frontend :5173
docker compose logs -f backend    # or frontend
docker compose down
```
Requires `backend/.env` to already exist (`env_file:` in [docker-compose.yml](docker-compose.yml) — there's no root `.env`, and the backend still needs the same remote Postgres/Redis reachable from wherever the container runs). [backend/Dockerfile](backend/Dockerfile) is Debian slim, not alpine — `sqlite3` and `bufferutil` are optional native peers of TypeORM/socket.io that pnpm compiles from source (`allowBuilds` in `pnpm-workspace.yaml`), and alpine's musl libc is a common source of native-module breakage; the install stages install `python3 make g++` for that compile step. **`pnpm-workspace.yaml` must be copied into the image alongside `package.json`/`pnpm-lock.yaml`** before `pnpm install` — it's what carries the `allowBuilds` allowlist, and without it pnpm silently blocks those same build scripts (`ERR_PNPM_IGNORED_BUILDS`) instead of failing loudly.

[frontend/Dockerfile](frontend/Dockerfile) builds a static bundle and serves it from nginx — no Node process in the final image. `VITE_API_BASE` is a **build-time** ARG baked into the JS bundle (Vite env vars aren't read at container start); the default (`http://localhost:3000`) is correct for the normal case of the browser and the containers sharing one host with published ports, and only needs overriding (`VITE_API_BASE` in the compose file, or `--build-arg` directly) when the backend is reachable at a different host/port than the browser.

## Architecture

### Execution flow
`DynamicSchedulerService` (`@Cron('* * * * *')`) → `StrategyEngineService.evaluateStrategyTrigger()` → `BrokerFactoryService.getAdapter()` → `IBrokerAdapter` → persist `Strategy.state` (jsonb) → `StrategyGateway` broadcast → React state updates.

A second loop, `@Interval(10000)` → `monitorActivePositions()`, reconciles live PnL and fires the profit-target square-off.

### Auth ([backend/src/auth/](backend/src/auth/))
Single-admin login, not a user table: credentials come from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars, compared with a timing-safe check in `AuthService`. Login is **two-step, password then emailed OTP** — there is no password-only path:
1. `POST /api/auth/login` (username, password) → on success, emails a 6-digit OTP to `NOTIFY_EMAIL` and returns `{ loginToken }` (NOT a JWT). Fails outright if SMTP isn't configured — there is no fallback that skips the OTP.
2. `POST /api/auth/verify-otp` (loginToken, otp) → returns the real JWT. OTP is valid 5 minutes, max 5 attempts, then the session must be restarted from step 1.
3. `POST /api/auth/resend-otp` (loginToken) → re-sends a fresh OTP for the same pending session.

Pending OTP sessions live in an **in-memory `Map`** in `AuthService`, not Redis — `RedisService` silently no-ops when the remote server is unreachable (see below), which would make OTPs vanish without warning; a restart mid-login just means starting over from step 1, which is an acceptable tradeoff for a single-operator tool. `JwtAuthGuard` is registered as a global `APP_GUARD`, so **every** controller requires `Authorization: Bearer <token>` by default — mark a route `@Public()` (from [public.decorator.ts](backend/src/auth/public.decorator.ts)) to exempt it; only the three auth routes above are public. `AuthModule`'s `JwtModule` is registered with `global: true`, so `JwtService` is injectable anywhere without importing `AuthModule`.

`APP_GUARD` only intercepts HTTP — the Socket.IO gateway is a separate transport, so `StrategyGateway.handleConnection()` verifies the token itself from `client.handshake.auth.token` and calls `client.disconnect(true)` if it's missing or invalid. The frontend sends it via `io(url, { auth: { token } })` in [socket.ts](frontend/src/services/socket.ts). **Adding a new WebSocket gateway means adding this same handshake check by hand** — it is not covered by the global guard.

Frontend: [Login.tsx](frontend/src/components/Auth/Login.tsx) is a two-screen form (credentials → OTP) with its own resend cooldown (30s) kept deliberately separate from the OTP's actual 5-minute expiry. [services/auth.ts](frontend/src/services/auth.ts) stores the token in `localStorage`; [api.ts](frontend/src/services/api.ts) attaches it via a request interceptor and a response interceptor clears it and reloads the page on any `401`. [App.tsx](frontend/src/App.tsx) renders `Login` when there's no token and otherwise mounts the rest of the app as `AuthenticatedApp` — kept as a separate component so hooks stay unconditional.

There is no rate limiting on `/api/auth/login` or `/api/auth/resend-otp`, and no refresh-token flow; rotating `JWT_SECRET` is how you invalidate every issued JWT at once (it does not affect pending OTP sessions, which are independent).

### Email ([backend/src/email/](backend/src/email/))
`EmailService` wraps nodemailer over plain SMTP (`SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM`, `NOTIFY_EMAIL` for the delivery address). It is the transport for both login OTPs and trade notifications, and is deliberately **non-fatal**: if SMTP env vars are missing or a send throws, it logs a warning and returns `false`/resolves silently rather than throwing — `AuthService.login()` is the one caller that checks the return value and blocks login on it (a lost OTP must not let a user "log in" with no way to finish); the trading engine calls (`notifyOrderPlaced`/`notifySquareOff`) are fire-and-forget (`void this.email...`) so a flaky mail server can never delay or fail an order.

Trade notifications hook into two existing single-funnel points rather than each call site:
- **Order placed** — `StrategyEngineService.logTrade()` (every real order fill runs through here already) fires `notifyOrderPlaced()` for a whitelisted action set (`BUY_FUTURE_ENTRY`, `SELL_CALL_ENTRY`, `BUY_FUTURE_AVERAGING`, `SELL_CALL_ATM_MATCH`, `SELL_CALL_OTM`, `ROLL_CLOSE_EXPIRING_CALL`). `*_FAILED` and `ROLLBACK_*` rows do **not** email — only successful placements do.
- **Square off** — `emergencySquareOff()` accumulates every leg it closes into a `closedLegs` array and sends **one** batched email per square-off event at the end, not one per leg (a covered-call square-off closes 2 legs; that should read as one event, not two emails).

**Deliverability**: every send is multipart/alternative (`text` + `html`, via the shared private `send()`) with a matching `replyTo`, sentence-style subjects/bodies (`ACTION_LABELS` maps raw action codes like `BUY_FUTURE_ENTRY` to "future buy order filled" for both subject and body), and a plain, banner-free HTML wrapper (`wrap()`) — the combination that matters most for a personal Gmail-SMTP relay, where the biggest signals are a missing text part and bulk/marketing-style formatting. None of this overrides a sender Gmail has already learned to spam-filter for a given recipient — that needs a manual "Not Spam" / add-to-contacts on the recipient's end, once.

`logTrade()`'s first parameter is the `Strategy` entity (not just `strategyId`) specifically so it has `strategy.name` for the email body — a deliberate signature change from the original `strategyId: string`.

### Broker abstraction ([backend/src/brokers/](backend/src/brokers/))
Everything trading-related goes through `IBrokerAdapter` in [broker.interface.ts](backend/src/brokers/broker.interface.ts). Implementations: `DeltaExchangeAdapter` (India/Global, one class flagged by constructor arg), `CcxtBrokerAdapter` (binance/bybit/deribit), `PaperTradingAdapter` (default fallback for unknown `brokerType`). The engine never imports an adapter directly — add new venues by implementing the interface and adding a `case` in [broker-factory.service.ts](backend/src/brokers/broker-factory.service.ts).

Adapters are cached by `${account.id}-${account.updatedAt.getTime()}`, so credential edits auto-invalidate; `BrokerService` also calls `clearAdapter(id)` on update/delete/test.

API keys are stored AES-256-GCM encrypted (`iv:authTag:ciphertext`) via [crypto.util.ts](backend/src/config/crypto.util.ts), keyed off `ENCRYPTION_SECRET`. Changing that env var makes every stored credential undecryptable. `decrypt()` returns the input unchanged if it isn't 3 colon-separated parts (legacy plaintext fallback).

### Strategy engine ([strategy-engine.service.ts](backend/src/strategy/strategy-engine.service.ts), ~1400 lines)
The hardcoded covered-call algorithm — the largest and most delicate file:

- **Roll step (runs first, every trigger)**: `closeExpiringTodayCalls()` buys back any short call expiring **today** before tomorrow's call is shorted, so held calls drop to 0 and the book stays at a strict 1 future : 1 short call. It is non-fatal by design — a failure logs `ROLL_CLOSE_CALL_FAILED` and the trigger continues.
- **No future position** → fresh entry: buy the configured future lots at ATM + short the same number of next-day calls at that same strike. The 4H Supertrend(10,3) is computed and broadcast to the UI but **does not size the position**.
- **Future exists, drawdown ≤ -1.0%** from `state.buyingStrike` → averaging layer (`executeDrawdownAveraging`), which re-bases `buyingStrike` to the new weighted-average entry so the next layer needs a further 1% drop.
- **Future exists, drawdown > -1.0%** → routine call sell only (`executeRoutineCallSell`), capped at `futureLots * legsConfig.maxCallsPerFutureLot` (default 1 = strict 1:1 covered call; higher values allow a ratio write where calls beyond the 1:1 line are **naked**, logged as a `RATIO WRITE` warning). The cap is what stops an intraday schedule from compounding short calls on every trigger. Strike choice follows `OptionsUtil.selectRoutineCallOption`: if next-day ATM strike equals the held call's strike, reuse ATM; otherwise pick nearest OTM. Since the roll step clears today's call first, the normal daily path is nearest OTM; the ATM-match branch remains for longer-dated calls and failed rolls.
- **Monitor loop**: closes everything when future PnL ≥ `exitRules.futureProfitTargetPercent` (default 4%), then skips all other logic. Option PnL is tracked but the 70% roll described in the README is **not** implemented in the monitor — it only exists in the default user script.

**Atomic rollback**: entry and averaging place the future leg first; if the option leg fails, the future order is reversed with a market order and strategy state is left untouched. Errors carrying "rolled back" surface as `rolledBack: true` to the UI. Preserve this invariant — an unhedged future is the failure mode it guards against.

**Calls expiring today never count as coverage.** `isExpiringToday()` (6-digit `DDMMYY` code from the symbol or the stored `expiryDate`) filters them out of both the held-call count and the strike reference, in the engine *and* the preview — otherwise a broker book that hasn't yet reflected the buy-to-close would make `availableToShort` 0 and silently skip tomorrow's call.

`getTriggerPreview()` mirrors the same decision tree without placing orders and backs the frontend confirmation modal. **Any change to entry/averaging/routine logic must be made in both places or the preview lies to the user.**

`syncStrategyWithBroker()` reconciles persisted `state` against live broker positions (legs closed manually on the exchange get cleared), with a 20-second grace period before dropping a freshly opened option leg.

### Strategy configuration model ([strategy.entity.ts](backend/src/entities/strategy.entity.ts))
One row holds `triggerConfig`, `indicatorConfig`, `legsConfig`, `exitRules`, and mutable `state` as `jsonb`. `state` is the source of truth for open legs, `buyingStrike`, drawdown, and realized PnL. `lastRollCount` preserves the roll counter across a roll (which nulls `optionPosition`). `logicMode` is `'CODE' | 'VISUAL_RULES'`, but the scheduler path always runs the hardcoded engine — `customScript` is currently only executed through the sandbox test endpoint.

### Script sandbox ([strategy-script-runner.util.ts](backend/src/strategy/strategy-script-runner.util.ts))
Node `vm` with a 3s timeout. User scripts `module.exports` `checkEntry` / `getEntryOrders` / `onMonitor`, receiving a `ScriptContext` and a global `indicators` helper. This is a soft sandbox, not a security boundary. Exposed via `POST /api/strategies/test-script`.

### Market data ([market.service.ts](backend/src/market-data/market.service.ts))
Independent of any configured broker: hardcoded to `api.india.delta.exchange` with **two** live sources — a 1-second REST poll plus a public WebSocket (`wss://public-socket.india.delta.exchange`, `mark_price` + `ticker` channels, 30s ping, 3s reconnect). Both write into `latestTickers`, cache marks in Redis (60s TTL), and emit `market-tickers`. Only BTC/ETH are tracked.

### Real-time channel
`StrategyGateway` (Socket.IO, same port, CORS `*`) emits `price-update`, `strategy-update`, `trade-log`, `indicator-status`, `market-tickers`. There are no inbound client events — the frontend only listens. Every emitter is a plain `broadcast*` method; add new events there rather than injecting `server` elsewhere.

### Frontend ([frontend/src/](frontend/src/))
No router or state library. [App.tsx](frontend/src/App.tsx) owns all app state, does one `loadData()` fan-out over [services/api.ts](frontend/src/services/api.ts), subscribes to the socket once, and switches between three tabs (dashboard / strategy / brokers). Most logic lives in three large components (`Dashboard`, `PrebuiltStrategyPanel`, `PositionsTable`, 600–1000 lines each) that take props and call `onRefresh`.

`api.ts` is the single HTTP surface — every backend route has a typed wrapper there; keep it in sync when adding controller routes.

### Design language
Refined dark theme, one accent color used sparingly. Always use the tokens in [tailwind.config.js](frontend/tailwind.config.js) — `brand` (lime `#9de600`, the only accent), `surface.{base,card,elevated,border,borderLight}`, `txt.{primary,secondary,muted,dim}`, `danger` — never raw hex values; `amber-400`/`amber-300` (Tailwind's own palette) is the one sanctioned second hue, reserved for a paused/pending state. `.mirror-card`, `.btn-mirror-primary`, `.btn-mirror-secondary` in [index.css](frontend/src/index.css) are the shared card/button classes.

Deliberately absent, don't reintroduce: glow/shadow-on-color effects (no `shadow-[0_0_Npx_#hex]`, no `shadow-lime`), `animate-ping`, decorative gradients, or `font-black`/`font-bold` on headings (use `font-semibold`). A card is `mirror-card` with one 1px border — never stack a bordered wrapper inside another bordered card. A "selected" tab/pill is a plain background swap (`bg-surface-elevated text-txt-primary`, no border, no shadow); a border is reserved for larger selectable option cards (e.g. the margin-mode picker in `PrebuiltStrategyPanel`) where it communicates a real choice, not for tabs. The Navbar has no ticker marquee — live BTC/ETH prices sit as plain text pills in the header.

## Domain conventions

- **Delta option symbols**: `C-BTC-<strike>-<DDMMYY>` / `P-...`. Expiry codes are 6-digit `DDMMYY`; `OptionsUtil.normalizeExpiryCode()` converts any input format and should be used rather than ad-hoc slicing. Daily settlement is 5:30 PM IST (12:00 UTC).
- **Order `size` is in contracts/lots, not coins.** Delta's `placeOrder` does `Math.max(1, Math.round(size))`; `calculateContractQuantity()` converts a coin amount to contracts via `contract_value`.
- **Delta auth**: HMAC-SHA256 over `METHOD + timestamp + path + body` — the signed `path` must include the query string, and the body must be the exact serialized payload sent.
- `state.buyingStrike` is the drawdown reference, distinct from `futurePosition.entryPrice`: both are set to the fill on fresh entry and both re-base to the weighted average on each averaging layer, but the 4% profit target measures against `entryPrice` while the 1% averaging trigger measures against `buyingStrike`.
- Strike intervals are resolved by underlying (`BTC` 500, `ETH` 50, `SOL` 5) in `OptionsUtil.getUnderlyingAndStrikeInterval()`.
- Schedules are timezone-aware via `date-fns-tz`, defaulting to `Asia/Kolkata`; the scheduler dedupes fires with an in-memory `triggeredKeys` set cleared on date change, so a restart can re-trigger the same minute.
- Option chain lookups **fall back to the full chain** when an exact expiry match is missing, so a caller can silently receive a different expiry — check the returned symbol when it matters.

## Notes

- The backend `.env.example` ships a default `ENCRYPTION_SECRET` and `CORS_ORIGIN=*`; `main.ts` currently hardcodes `origin: '*'` and ignores `CORS_ORIGIN`.
- Test coverage is essentially the NestJS scaffold (`app.controller.spec.ts`, `app.e2e-spec.ts`) — there are no tests for the engine, adapters, or options utils.
- An OpenAI Codex config exists at `~/.codex/`. To pull its MCP servers, commands, subagents, or skills into Claude Code, reply `/import` to see what's importable, then `/import --yes=<digest>` to apply (or run `claude import` from a terminal if the command isn't available here).
