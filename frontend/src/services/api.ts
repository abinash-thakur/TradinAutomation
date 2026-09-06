import axios from 'axios';
import type { BrokerAccount, Strategy, TradeLog, TickerSummary, BrokerAccountPositions, PositionInfo } from '../types';
import { authStore } from './auth';

// `??` (not `||`) so an intentionally-empty VITE_API_BASE ("" - same origin, e.g. behind an
// nginx reverse proxy that forwards /api to the backend) is honored rather than silently
// overridden - only a genuinely *unset* var falls back to the direct-backend default.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach the session token to every request. /api/auth/login is the only route the backend
// exempts from JwtAuthGuard, so this is safe to apply unconditionally.
client.interceptors.request.use((config) => {
  const token = authStore.getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 means the token is missing/expired - clear it and force the login screen back up.
// Full reload (not a router push, since there's no router) so every in-flight socket/poll resets.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      authStore.clearToken();
      window.location.reload();
    }
    return Promise.reject(error);
  },
);

export interface TriggerExecutionOptions {
  force?: boolean;
  futureOrderType?: 'limit' | 'market';
  futureLimitPrice?: number;
  optionOrderType?: 'limit' | 'market';
  optionLimitPrice?: number;
}

export const api = {
  // Auth (the only endpoints reachable without a token) - two-step: password, then emailed OTP.
  login: (username: string, password: string) =>
    client.post<{ loginToken: string; expiresInSeconds: number; sentTo: string }>('/api/auth/login', { username, password }).then((r) => r.data),
  verifyOtp: (loginToken: string, otp: string) =>
    client.post<{ accessToken: string; username: string }>('/api/auth/verify-otp', { loginToken, otp }).then((r) => r.data),
  resendOtp: (loginToken: string) =>
    client.post<{ expiresInSeconds: number; sentTo: string }>('/api/auth/resend-otp', { loginToken }).then((r) => r.data),

  // Market Tickers
  getTickers: () => client.get<Record<string, TickerSummary>>('/api/market/tickers').then((r) => r.data),

  // Brokers & Positions
  getBrokers: () => client.get<BrokerAccount[]>('/api/brokers').then((r) => r.data),
  getIpInfo: () => client.get<{ ipv4?: string; ipv6?: string }>('/api/brokers/ip-info').then((r) => r.data),
  createBroker: (data: any) => client.post<BrokerAccount>('/api/brokers', data).then((r) => r.data),
  updateBroker: (id: string, data: any) => client.put<BrokerAccount>(`/api/brokers/${id}`, data).then((r) => r.data),
  deleteBroker: (id: string) => client.delete(`/api/brokers/${id}`).then((r) => r.data),
  testBroker: (id: string) => client.post<{ success: boolean; message: string; balance?: number }>(`/api/brokers/${id}/test`).then((r) => r.data),
  getAllPositions: () => client.get<BrokerAccountPositions[]>('/api/brokers/positions').then((r) => r.data),
  getAccountPositions: (id: string) => client.get<{ brokerAccountId: string; brokerName: string; positions: PositionInfo[] }>(`/api/brokers/${id}/positions`).then((r) => r.data),
  closePosition: (id: string, symbol: string, productId?: string | number) =>
    client.post<boolean>(`/api/brokers/${id}/positions/close`, { symbol, productId }).then((r) => r.data),

  // Strategies & Scripting
  getStrategies: () => client.get<Strategy[]>('/api/strategies').then((r) => r.data),
  getStrategy: (id: string) => client.get<Strategy>(`/api/strategies/${id}`).then((r) => r.data),
  createStrategy: (data: Partial<Strategy>) => client.post<Strategy>('/api/strategies', data).then((r) => r.data),
  updateStrategy: (id: string, data: Partial<Strategy>) => client.put<Strategy>(`/api/strategies/${id}`, data).then((r) => r.data),
  deleteStrategy: (id: string) => client.delete(`/api/strategies/${id}`).then((r) => r.data),
  toggleStrategy: (id: string) => client.post<Strategy>(`/api/strategies/${id}/toggle`).then((r) => r.data),
  triggerStrategy: (id: string, options?: boolean | TriggerExecutionOptions) => {
    const payload = typeof options === 'boolean' ? { force: options } : (options || {});
    return client.post<{ success: boolean; message: string; rolledBack?: boolean }>(`/api/strategies/${id}/trigger`, payload).then((r) => r.data);
  },
  previewTrigger: (id: string) =>
    client.get<{
      strategyId: string;
      strategyName: string;
      willCloseExpiringCall: boolean;
      expiringCallSymbols: string[];
      expiringCallLots: number;
      expiringCallExitCost: number;
      symbol: string;
      underlying: string;
      currentMark: number;
      futureBid?: number;
      futureAsk?: number;
      atmStrike: number;
      expiryDate: string;
      expiryCode: string;
      trend: string;
      isBullish: boolean;
      actionType: 'FRESH_ENTRY' | 'DRAWDOWN_AVERAGING' | 'SELL_CALL_ROUTINE';
      buyingStrike: number;
      drawdownPercent: number;
      reasonText: string;
      hasMatchingOption: boolean;
      optionSymbol: string;
      optionPremium: number;
      optionBid?: number;
      optionAsk?: number;
      optionMark?: number;
      futureLots: number;
      optionLots: number;
      brokerName: string;
      brokerType: string;
    }>(`/api/strategies/${id}/preview-trigger`).then((r) => r.data),
  subscribeMultiple: (data: {
    tickers: Array<{
      symbol: string;
      futureLots: number;
      optionLots: number;
      brokerAccountId?: string;
      status?: 'ACTIVE' | 'PAUSED';
    }>;
    defaultBrokerAccountId?: string;
  }) => client.post<Strategy[]>('/api/strategies/subscribe', data).then((r) => r.data),
  squareOffStrategy: (id: string) => client.post<{ success: boolean; message: string }>(`/api/strategies/${id}/square-off`).then((r) => r.data),
  squareOffAllStrategies: (reason?: string) =>
    client.post<{ success: boolean; message: string; data: any }>('/api/strategies/square-off-all', { reason }).then((r) => r.data),
  syncStrategyWithBroker: (id: string) => client.post<{ success: boolean; message: string; data: Strategy }>(`/api/strategies/${id}/sync`).then((r) => r.data),
  syncAllStrategies: () => client.post<{ success: boolean; message: string; data: Strategy[] }>('/api/strategies/sync-all').then((r) => r.data),
  getTemplates: () => client.get<any[]>('/api/strategies/templates').then((r) => r.data),
  getDefaultScript: () => client.get<{ script: string }>('/api/strategies/default-script').then((r) => r.data),
  testScript: (customScript: string, symbol?: string) =>
    client.post<{
      checkEntryResult?: boolean;
      entryOrders?: any[];
      monitorAction?: any;
      logs: string[];
      error?: string;
    }>('/api/strategies/test-script', { customScript, symbol }).then((r) => r.data),
  getLogs: (strategyId?: string) => client.get<TradeLog[]>('/api/strategies/logs', { params: { strategyId } }).then((r) => r.data),
  getTradeLogs: (strategyId?: string) => client.get<TradeLog[]>('/api/strategies/logs', { params: { strategyId } }).then((r) => r.data),
};
