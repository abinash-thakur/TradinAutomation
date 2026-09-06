import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  AlertTriangle,
  Zap,
  TrendingUp,
  Clock,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Terminal,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { Strategy, BrokerAccount, TickerSummary, TradeLog } from '../../types';
import { api } from '../../services/api';
import { PositionsTable } from '../Positions/PositionsTable';
import { DeltaLogo } from '../Common/DeltaLogo';

interface DashboardProps {
  strategy: Strategy | null;
  strategies?: Strategy[];
  activeStrategyId?: string;
  onSelectStrategy?: (strategyId: string) => void;
  brokers: BrokerAccount[];
  btcTicker?: TickerSummary;
  ethTicker?: TickerSummary;
  btcPrice: number;
  indicatorStatus?: { trend: string; value: number; lastChecked: string } | null;
  tradeLogs?: TradeLog[];
  onRefresh: () => void;
  onEditStrategy: () => void;
}
const formatSchedule = (cfg?: Strategy['triggerConfig']) => {
  if (!cfg) return 'Daily at 3:30 PM IST';
  const timeStr = cfg.time || '15:30';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr || '00';
  const period = !isNaN(h) ? (h >= 12 ? 'PM' : 'AM') : '';
  const hour12 = !isNaN(h) ? (h % 12 || 12) : hStr;
  const timeFormatted = `${hour12}:${m} ${period} IST`;

  const freq = cfg.frequency || 'DAILY';
  if (freq === 'MINUTES') {
    return `Every ${cfg.intervalValue || 1}m`;
  }
  if (freq === 'HOURLY') {
    return `Every ${cfg.intervalValue || 1}h (at :${m})`;
  }
  if (freq === 'EVERY_N_DAYS') {
    return `Every ${cfg.intervalValue || 3}d at ${timeFormatted}`;
  }
  return `Daily at ${timeFormatted}`;
};

const formatLastChecked = (isoStr?: string) => {
  if (!isoStr) return null;
  try {
    const d = new Date(isoStr);
    return (
      d.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }) + ' IST'
    );
  } catch {
    return isoStr;
  }
};

export const Dashboard: React.FC<DashboardProps> = ({
  strategy,
  strategies,
  activeStrategyId,
  onSelectStrategy,
  brokers,
  btcTicker,
  ethTicker,
  btcPrice,
  indicatorStatus,
  tradeLogs = [],
  onRefresh,
  onEditStrategy,
}) => {
  const [actionLoading, setActionLoading] = useState(false);
  const [prevPrice, setPrevPrice] = useState(btcPrice);
  const [priceDirection, setPriceDirection] = useState<'up' | 'down' | 'same'>('same');
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(10);

  // Live Next Trade countdown timer state
  const [countdown, setCountdown] = useState<{
    display: string;
    seconds: number;
    isTriggering: boolean;
  }>({
    display: '--:--',
    seconds: 0,
    isTriggering: false,
  });

  const prevTriggeringRef = useRef(false);

  useEffect(() => {
    if (btcPrice && btcPrice !== prevPrice) {
      if (prevPrice > 0) {
        setPriceDirection(btcPrice > prevPrice ? 'up' : 'down');
      }
      setPrevPrice(btcPrice);
      const timer = setTimeout(() => setPriceDirection('same'), 700);
      return () => clearTimeout(timer);
    }
  }, [btcPrice, prevPrice]);

  useEffect(() => {
    if (!strategy || strategy.status !== 'ACTIVE') {
      setCountdown({ display: 'Paused', seconds: 0, isTriggering: false });
      return;
    }

    const updateTimer = () => {
      const cfg = strategy.triggerConfig;
      const freq = cfg?.frequency || 'DAILY';
      const interval = Math.max(1, cfg?.intervalValue || (freq === 'MINUTES' ? 3 : 1));
      const targetTime = cfg?.time || '15:30';

      const now = new Date();
      const tzStr = cfg?.timezone || 'Asia/Kolkata';

      let curYear = now.getFullYear();
      let curMonth = now.getMonth() + 1;
      let curDay = now.getDate();
      let curH = now.getHours();
      let curM = now.getMinutes();
      let curS = now.getSeconds();

      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tzStr,
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const parts = formatter.formatToParts(now);
        const getPart = (type: string) => {
          const p = parts.find((pt) => pt.type === type);
          return p ? parseInt(p.value, 10) : 0;
        };
        curYear = getPart('year') || curYear;
        curMonth = getPart('month') || curMonth;
        curDay = getPart('day') || curDay;
        const h = getPart('hour');
        curH = h === 24 ? 0 : h;
        curM = getPart('minute');
        curS = getPart('second');
      } catch {
        // Fallback to local
      }

      // Check start date (calendar constraint)
      if (cfg?.startDate) {
        const todayStr = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(curDay).padStart(2, '0')}`;
        if (todayStr < cfg.startDate) {
          setCountdown({
            display: `Starts ${cfg.startDate}`,
            seconds: 86400,
            isTriggering: false,
          });
          return;
        }
      }

      if (freq === 'MINUTES') {
        const minsPast = curM % interval;
        const minsRemaining = interval - minsPast - 1;
        const secsRemaining = 60 - curS;
        const totalSecs = minsRemaining * 60 + secsRemaining;

        if (curS === 0 && minsPast === 0) {
          setCountdown({ display: '00:00 (Triggering)', seconds: 0, isTriggering: true });
          return;
        }

        const mPad = String(Math.floor(totalSecs / 60)).padStart(2, '0');
        const sPad = String(totalSecs % 60).padStart(2, '0');
        setCountdown({ display: `${mPad}:${sPad}`, seconds: totalSecs, isTriggering: false });
      } else if (freq === 'HOURLY') {
        const [, mStr] = targetTime.split(':');
        const targetMinute = parseInt(mStr || '0', 10);

        let nextH = curH;
        if (curM > targetMinute || (curM === targetMinute && curS > 0)) {
          nextH = curH + 1;
        }
        while (nextH % interval !== 0) {
          nextH++;
        }

        const targetDate = new Date();
        targetDate.setHours(nextH, targetMinute, 0, 0);
        const diffSecs = Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000));

        const hPad = String(Math.floor(diffSecs / 3600)).padStart(2, '0');
        const mPad = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, '0');
        const sPad = String(diffSecs % 60).padStart(2, '0');
        setCountdown({
          display: diffSecs >= 3600 ? `${hPad}h ${mPad}m ${sPad}s` : `${mPad}:${sPad}`,
          seconds: diffSecs,
          isTriggering: diffSecs === 0,
        });
      } else {
        // DAILY or EVERY_N_DAYS
        const [hStr, mStr] = targetTime.split(':');
        const targetH = parseInt(hStr || '15', 10);
        const targetM = parseInt(mStr || '30', 10);

        const targetDate = new Date();
        targetDate.setHours(targetH, targetM, 0, 0);

        if (Date.now() >= targetDate.getTime()) {
          const daysToAdd = freq === 'EVERY_N_DAYS' ? Math.max(1, interval) : 1;
          targetDate.setDate(targetDate.getDate() + daysToAdd);
        }

        const diffSecs = Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000));
        const days = Math.floor(diffSecs / 86400);
        const hours = Math.floor((diffSecs % 86400) / 3600);
        const mins = Math.floor((diffSecs % 3600) / 60);
        const secs = diffSecs % 60;

        let display = '';
        if (days > 0) {
          display = `${days}d ${hours}h ${mins}m`;
        } else if (hours > 0) {
          display = `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
        } else {
          display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }

        setCountdown({
          display,
          seconds: diffSecs,
          isTriggering: diffSecs === 0,
        });
      }
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [strategy]);

  // Auto-refresh when countdown hits 0 / triggers
  useEffect(() => {
    if (countdown.isTriggering && !prevTriggeringRef.current) {
      onRefresh(); // Refresh immediately
      const timer1 = setTimeout(() => {
        onRefresh(); // Follow-up after order execution completes on exchange
      }, 2500);
      const timer2 = setTimeout(() => {
        onRefresh(); // Final sync
      }, 5000);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
    prevTriggeringRef.current = countdown.isTriggering;
  }, [countdown.isTriggering]);

  if (!strategy) {
    return (
      <div className="text-center py-20 mirror-card p-8">
        <ShieldCheck className="w-12 h-12 text-txt-dim mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-txt-primary">No Active Strategy Configured</h3>
        <p className="text-txt-muted text-sm mt-2 max-w-md mx-auto">
          Please connect a broker account or configure your Covered Call strategy.
        </p>
        <button
          onClick={onEditStrategy}
          className="mt-6 btn-mirror-primary text-sm font-bold"
        >
          Open Strategy Settings
        </button>
      </div>
    );
  }

  const broker = brokers.find((b) => b.id === strategy.brokerAccountId);
  const stage = strategy.state?.stage || 'IDLE';
  const isEth = strategy.symbol?.includes('ETH');
  const currentAssetPrice = isEth ? (ethTicker?.markPrice || 0) : (btcTicker?.markPrice || btcPrice);

  const handleToggle = async () => {
    setActionLoading(true);
    try {
      await api.toggleStrategy(strategy.id);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Toggle failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerNow = async () => {
    setActionLoading(true);
    try {
      const res = await api.triggerStrategy(strategy.id);
      alert(res.message);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Trigger evaluation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSquareOff = async () => {
    if (confirm('🚨 EMERGENCY SQUARE OFF: Close all open future and call option positions immediately?')) {
      setActionLoading(true);
      try {
        const res = await api.squareOffStrategy(strategy.id);
        alert(res.message);
        onRefresh();
      } catch (err: any) {
        alert(err.response?.data?.message || 'Square off failed');
      } finally {
        setActionLoading(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Ticker Selector */}
      {strategies && strategies.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-surface-card border border-surface-border p-2 rounded-xl">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {strategies.map((s) => {
              const isSelected = s.id === (strategy?.id || activeStrategyId);
              const isBtc = s.symbol?.includes('BTC');
              const isEth = s.symbol?.includes('ETH');
              const icon = isBtc ? '₿' : isEth ? 'Ξ' : '◎';
              const hasPos = !!s.state?.futurePosition && s.state.futurePosition.size > 0;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelectStrategy && onSelectStrategy(s.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-surface-elevated text-txt-primary'
                      : 'text-txt-muted hover:text-txt-secondary'
                  }`}
                >
                  <span className="font-mono">{icon}</span>
                  <span>{s.symbol || s.name}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'ACTIVE' ? 'bg-brand' : 'bg-txt-dim'}`} />
                  {hasPos && <span className="text-[10px] text-brand font-bold">Open</span>}
                </button>
              );
            })}
          </div>

          <button
            onClick={onEditStrategy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-txt-muted hover:text-txt-primary text-xs font-semibold transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Configure</span>
          </button>
        </div>
      )}

      {/* Hero Trading Control Bar */}
      <div className="mirror-card p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${strategy.status === 'ACTIVE' ? 'bg-brand animate-pulse' : 'bg-amber-400'}`} />
            <h2 className="text-xl font-bold text-txt-primary tracking-tight">{strategy.name}</h2>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                strategy.status === 'ACTIVE' ? 'bg-brand/15 text-brand' : 'bg-amber-400/10 text-amber-300'
              }`}
            >
              {strategy.status}
            </span>

            {/* Live Next Trade Countdown Badge */}
            <div
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold ${
                countdown.isTriggering
                  ? 'bg-amber-400/15 text-amber-300 animate-pulse'
                  : strategy.status === 'ACTIVE'
                  ? 'bg-surface-elevated text-brand'
                  : 'bg-surface-elevated text-txt-muted'
              }`}
              title={
                strategy.status === 'ACTIVE'
                  ? stage === 'IN_POSITION'
                    ? `Routine check in ${countdown.display} (Position active - will average if drawdown >= 1%)`
                    : `Next order placement in ${countdown.display}`
                  : 'Engine is paused'
              }
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="text-txt-dim text-[10px] uppercase tracking-wider font-sans font-semibold">
                {stage === 'IN_POSITION' ? 'Next check' : 'Next entry'}
              </span>
              <span>{countdown.display}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 text-xs">
            <span className="inline-flex items-center gap-1.5 text-txt-muted">
              Broker
              {broker?.brokerType?.startsWith('delta-') ? (
                <span className="inline-flex items-center gap-1.5 text-txt-secondary font-medium">
                  <DeltaLogo
                    variant="icon"
                    className="w-3.5 h-3.5"
                    type={broker.brokerType === 'delta-global' ? 'global' : 'india'}
                  />
                  {broker?.name || 'Delta Exchange'}
                </span>
              ) : (
                <span className="text-txt-secondary font-medium">{broker?.name || 'Paper Simulator'}</span>
              )}
            </span>
            <span className="text-txt-muted">Symbol <span className="text-txt-secondary font-medium font-mono">{strategy.symbol}</span></span>
            <span className="text-txt-muted">Margin <span className="text-txt-secondary font-medium uppercase">{strategy.marginMode || strategy.legsConfig?.marginMode || 'PORTFOLIO'}</span></span>
            <span className="text-txt-muted">Schedule <span className="text-txt-secondary font-medium">{formatSchedule(strategy.triggerConfig)}</span></span>
            <span className="text-txt-muted">Stage <span className="text-txt-secondary font-medium uppercase">{stage}</span></span>
          </div>

          {strategy.state?.lastEvaluatedAt && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-txt-dim">
              <span>Last evaluated {formatLastChecked(strategy.state.lastEvaluatedAt)}</span>
              {strategy.state?.lastMessage && (
                <span className="text-txt-dim max-w-xl truncate font-mono" title={strategy.state.lastMessage}>
                  · {strategy.state.lastMessage}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleToggle}
            disabled={actionLoading}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              strategy.status === 'ACTIVE'
                ? 'bg-amber-400/10 hover:bg-amber-400/20 text-amber-400'
                : 'btn-mirror-primary'
            }`}
          >
            {strategy.status === 'ACTIVE' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{strategy.status === 'ACTIVE' ? 'Pause Engine' : 'Activate Engine'}</span>
          </button>

          <button
            onClick={handleTriggerNow}
            disabled={actionLoading}
            className="btn-mirror-secondary px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5"
            title={`Evaluate ${formatSchedule(strategy.triggerConfig)} routine immediately`}
          >
            <Zap className="w-4 h-4 text-brand" />
            <span>Check Now</span>
          </button>

          <button
            onClick={handleSquareOff}
            disabled={actionLoading}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-danger/10 hover:bg-danger/20 text-danger transition-colors flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Emergency Square Off</span>
          </button>
        </div>
      </div>

      {/* Strategy Status / Exchange Rejection Alert Banner */}
      {strategy.state?.lastMessage && (() => {
        const msg = strategy.state.lastMessage;
        const isMarginError = msg.toLowerCase().includes('insufficient_margin');
        const isError =
          msg.toLowerCase().includes('fail') ||
          msg.toLowerCase().includes('error') ||
          msg.toLowerCase().includes('reject') ||
          isMarginError;

        return (
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              isError ? 'bg-danger/5 border-danger/20' : 'bg-brand/5 border-brand/20'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${isError ? 'text-danger' : 'text-brand'}`}>
                  {isError ? 'Order Placement Notice' : 'Latest Routine Action'}
                </span>
                {strategy.state.lastEvaluatedAt && (
                  <span className="text-[11px] text-txt-dim font-mono">
                    {formatLastChecked(strategy.state.lastEvaluatedAt)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs font-mono text-txt-secondary leading-relaxed break-words">
                {msg}
              </p>
              {isMarginError && (
                <div className="mt-2.5 p-3 rounded-lg bg-danger/10 text-xs text-txt-secondary">
                  <strong className="text-txt-primary block mb-1">Order rejected for insufficient margin</strong>
                  Each short option contract requires collateral on the exchange. To continue placing orders,
                  deposit more balance into the broker account, or reduce/close open positions below.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 3 Clear Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Metric 1: Live Mark Price */}
        <div className="mirror-card p-5">
          <div className="flex items-center justify-between text-xs text-txt-muted">
            <span className="font-medium">Live {strategy.symbol || 'BTC'} Price</span>
            <span
              className={`text-[10px] font-mono font-semibold ${
                priceDirection === 'up' ? 'text-brand' : priceDirection === 'down' ? 'text-danger' : 'text-txt-dim'
              }`}
            >
              {priceDirection === 'up' ? '▲' : priceDirection === 'down' ? '▼' : '●'} LIVE
            </span>
          </div>
          <div className="mt-2 text-2xl font-mono font-semibold text-txt-primary">
            ${currentAssetPrice > 0 ? currentAssetPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '---'}
          </div>
          <p className="text-[11px] text-txt-dim mt-1">Streaming real-time ticks</p>
        </div>

        {/* Metric 2: Trend & Stage */}
        <div className="mirror-card p-5">
          <div className="flex items-center justify-between text-xs text-txt-muted">
            <span className="font-medium">Trend Direction</span>
            <TrendingUp className="w-4 h-4 text-txt-dim" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${indicatorStatus?.trend === 'BEARISH' ? 'bg-danger' : 'bg-brand'}`} />
            <span className="text-xl font-semibold text-txt-primary tracking-tight">
              {indicatorStatus?.trend || 'BULLISH'}
            </span>
          </div>
          <p className="text-[11px] text-txt-dim mt-1">
            Stage <span className="text-txt-secondary font-medium">{stage}</span>
          </p>
        </div>

        {/* Metric 3: Future Profit Target */}
        <div className="mirror-card p-5">
          <div className="flex items-center justify-between text-xs text-txt-muted">
            <span className="font-medium">Profit Target Goal</span>
          </div>
          <div className="mt-2 text-2xl font-mono font-semibold text-brand">
            +{strategy.exitRules?.futureProfitTargetPercent || 4.5}%
          </div>
          <p className="text-[11px] text-txt-dim mt-1">Auto squares off both legs on hit</p>
        </div>
      </div>

      {/* Live Open Positions & Closed Positions History */}
      <PositionsTable tradeLogs={tradeLogs} onPositionClosed={onRefresh} />

      {/* Recent Execution Activity with Pagination */}
      {(() => {
        const totalActivityPages = Math.max(1, Math.ceil(tradeLogs.length / activityPageSize));
        const currentActPage = Math.min(activityPage, totalActivityPages);
        const paginatedTradeLogs = tradeLogs.slice(
          (currentActPage - 1) * activityPageSize,
          currentActPage * activityPageSize
        );

        return (
          <div className="mirror-card rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-txt-muted" />
                <h3 className="text-sm font-semibold text-txt-primary">Recent Trade Activity</h3>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-txt-muted">
                  <span>Rows</span>
                  <select
                    value={activityPageSize}
                    onChange={(e) => {
                      setActivityPageSize(Number(e.target.value));
                      setActivityPage(1);
                    }}
                    className="bg-surface-elevated border border-surface-border rounded px-2 py-1 text-txt-primary text-xs focus:outline-none focus:border-brand/50"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <span className="text-txt-dim">{tradeLogs.length} total</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-txt-dim border-b border-surface-border uppercase tracking-wider font-medium text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Symbol</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Qty</th>
                    <th className="px-5 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border font-mono">
                  {paginatedTradeLogs.map((log) => {
                    const isFail = log.action.includes('FAIL') || log.action.includes('REJECT');
                    const isBuy = log.action.includes('BUY');
                    const isNegative = isFail || log.action.includes('SQUARE_OFF') || log.action.includes('CLOSE');

                    return (
                      <tr key={log.id} className="hover:bg-surface-elevated/50 transition-colors">
                        <td className="px-5 py-3 text-txt-dim font-sans">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                              isNegative ? 'text-danger' : isBuy ? 'text-brand' : 'text-txt-secondary'
                            }`}
                          >
                            {isFail ? (
                              <XCircle className="w-3 h-3" />
                            ) : isBuy ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            <span>{log.action}</span>
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold text-txt-primary">{log.symbol}</td>
                        <td className="px-5 py-3 text-txt-secondary">${log.price.toLocaleString()}</td>
                        <td className="px-5 py-3 text-txt-muted">{log.quantity}</td>
                        <td
                          className={`px-5 py-3 font-sans text-xs max-w-xs truncate ${isFail ? 'text-danger' : 'text-txt-dim'}`}
                          title={log.details}
                        >
                          {log.details || '—'}
                        </td>
                      </tr>
                    );
                  })}

                  {tradeLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-txt-dim font-sans">
                        No trades executed yet. The automated engine logs every trade event here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {tradeLogs.length > 0 && (
              <div className="px-6 py-3.5 border-t border-surface-border flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="text-txt-dim">
                  Showing <span className="text-txt-secondary font-medium">{(currentActPage - 1) * activityPageSize + 1}</span> to{' '}
                  <span className="text-txt-secondary font-medium">
                    {Math.min(currentActPage * activityPageSize, tradeLogs.length)}
                  </span>{' '}
                  of <span className="text-txt-secondary font-medium">{tradeLogs.length}</span> entries
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActivityPage((p) => Math.max(p - 1, 1))}
                    disabled={currentActPage <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-txt-secondary hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalActivityPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalActivityPages || Math.abs(p - currentActPage) <= 1)
                      .reduce<(number | string)[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                          acc.push('...');
                        }
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((item, idx) =>
                        typeof item === 'string' ? (
                          <span key={`dots-${idx}`} className="px-1 text-txt-dim">
                            ...
                          </span>
                        ) : (
                          <button
                            key={item}
                            onClick={() => setActivityPage(item)}
                            className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                              currentActPage === item
                                ? 'bg-brand text-surface-base font-semibold'
                                : 'text-txt-secondary hover:bg-surface-elevated'
                            }`}
                          >
                            {item}
                          </button>
                        )
                      )}
                  </div>

                  <button
                    onClick={() => setActivityPage((p) => Math.min(p + 1, totalActivityPages))}
                    disabled={currentActPage >= totalActivityPages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-txt-secondary hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
