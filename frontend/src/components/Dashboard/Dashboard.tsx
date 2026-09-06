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
        <div className="stat-hover-line" />
        <ShieldCheck className="w-16 h-16 text-[#9de600] mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white">No Active Strategy Configured</h3>
        <p className="text-[#85888e] text-sm mt-2 max-w-md mx-auto">
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
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#13161b] border border-[#22262f] p-2.5 rounded-2xl">
          <div className="flex items-center space-x-2 overflow-x-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-[#85888e] px-2">
              Trading Asset:
            </span>
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
                  className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                    isSelected
                      ? 'bg-[#9de600]/15 text-[#9de600] border border-[#9de600]/40 shadow-sm shadow-[#9de600]/10'
                      : 'bg-[#1a1e26] text-[#cecfd2] hover:text-white hover:bg-[#22262f] border border-[#22262f]'
                  }`}
                >
                  <span className="font-mono">{icon}</span>
                  <span>{s.symbol || s.name}</span>
                  <span className={`w-2 h-2 rounded-full ${s.status === 'ACTIVE' ? 'bg-[#9de600] animate-pulse' : 'bg-[#61656c]'}`} />
                  {hasPos && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#9de600]/20 text-[#9de600] font-bold border border-[#9de600]/30">
                      Open
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={onEditStrategy}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#1a1e26] hover:bg-[#22262f] text-[#cecfd2] hover:text-[#9de600] text-xs font-bold transition border border-[#22262f]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#9de600]" />
            <span>Configure Strategy</span>
          </button>
        </div>
      )}

      {/* Hero Trading Control Bar */}
      <div className="mirror-card p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden">
        <div className="stat-hover-line" />
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full ${
                strategy.status === 'ACTIVE' ? 'bg-[#9de600] animate-pulse shadow-[0_0_8px_#9de600]' : 'bg-amber-400'
              }`}
            />
            <h2 className="text-2xl font-black text-white tracking-tight">{strategy.name}</h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                strategy.status === 'ACTIVE'
                  ? 'bg-[#9de600]/15 text-[#9de600] border-[#9de600]/30'
                  : 'bg-amber-400/10 text-amber-300 border-amber-400/30'
              }`}
            >
              {strategy.status}
            </span>

            {/* Live Next Trade Countdown Badge */}
            <div
              className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-mono font-bold border transition ${
                countdown.isTriggering
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/50 animate-pulse'
                  : strategy.status === 'ACTIVE'
                  ? 'bg-[#0c0e12] text-[#9de600] border-[#9de600]/40 shadow-sm shadow-[#9de600]/10'
                  : 'bg-[#1a1e26] text-[#85888e] border-[#22262f]'
              }`}
              title={
                strategy.status === 'ACTIVE'
                  ? stage === 'IN_POSITION'
                    ? `Routine check in ${countdown.display} (Position active - will average if drawdown >= 1%)`
                    : `Next order placement in ${countdown.display}`
                  : 'Engine is paused'
              }
            >
              <Clock className={`w-3.5 h-3.5 ${strategy.status === 'ACTIVE' ? 'text-[#9de600] animate-pulse' : 'text-[#85888e]'}`} />
              <span className="text-[#85888e] text-[10px] uppercase tracking-wider font-sans font-semibold">
                {stage === 'IN_POSITION' ? 'Next Check:' : 'Next Entry:'}
              </span>
              <span className={strategy.status === 'ACTIVE' ? 'text-[#9de600] font-black' : 'text-[#85888e]'}>
                {countdown.display}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-[#85888e]">
            <span className="inline-flex items-center space-x-1.5">
              <span>Broker:</span>
              {broker?.brokerType?.startsWith('delta-') ? (
                <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-[#0c0e12] border border-[#22262f] text-white font-semibold">
                  <DeltaLogo
                    variant="icon"
                    className="w-3.5 h-3.5"
                    type={broker.brokerType === 'delta-global' ? 'global' : 'india'}
                  />
                  <span>{broker?.name || 'Delta Exchange'}</span>
                </span>
              ) : (
                <strong className="text-[#f7f7f7]">{broker?.name || 'Paper Simulator'}</strong>
              )}
            </span>
            <span>•</span>
            <span>Symbol: <strong className="text-[#f7f7f7] font-mono">{strategy.symbol}</strong></span>
            <span>•</span>
            <span>Margin Mode: <strong className="text-[#9de600] font-mono uppercase font-semibold">{strategy.marginMode || strategy.legsConfig?.marginMode || 'PORTFOLIO'}</strong></span>
            <span>•</span>
            <span>Routine: <strong className="text-[#f7f7f7]">{formatSchedule(strategy.triggerConfig)}</strong></span>
            <span>•</span>
            <span>Stage: <strong className="text-[#9de600] font-mono uppercase font-bold">{stage}</strong></span>
            <span>•</span>
            <span className="flex items-center space-x-1.5">
              <span>{stage === 'IN_POSITION' ? 'Next Routine Check:' : 'Next Entry:'}</span>
              <strong className="text-[#9de600] font-mono">{countdown.display}</strong>
              {stage === 'IN_POSITION' && (
                <span className="text-[10px] text-cyan-400 font-semibold">(Holding &bull; &ge;1% DD: Avg Fut+Call | &lt;1% DD: Short Call [ATM if match, else OTM])</span>
              )}
            </span>
          </div>

          {strategy.state?.lastEvaluatedAt && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-[#85888e]">
              <span className="inline-flex items-center space-x-1.5 bg-[#0c0e12] px-2.5 py-1 rounded-lg border border-[#22262f]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#9de600]" />
                <span>Last Evaluated:</span>
                <strong className="text-[#cecfd2] font-mono">{formatLastChecked(strategy.state.lastEvaluatedAt)}</strong>
              </span>
              {strategy.state?.lastMessage && (
                <span className="text-[#85888e] max-w-xl truncate font-mono text-[10px]" title={strategy.state.lastMessage}>
                  {strategy.state.lastMessage}
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
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition ${
              strategy.status === 'ACTIVE'
                ? 'bg-[#1a1e26] hover:bg-[#22262f] text-amber-400 border border-amber-400/30'
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
            <Zap className="w-4 h-4 text-[#9de600]" />
            <span>Check Now</span>
          </button>

          <button
            onClick={handleSquareOff}
            disabled={actionLoading}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#f04438] hover:bg-[#d92d20] text-white shadow-lg shadow-[#f04438]/20 transition flex items-center space-x-2 active:scale-95"
          >
            <AlertTriangle className="w-4 h-4 text-white" />
            <span>Emergency Square Off All</span>
          </button>
        </div>
      </div>

      {/* Prominent Strategy Status / Exchange Rejection Alert Banner */}
      {strategy.state?.lastMessage && (() => {
        const msg = strategy.state.lastMessage;
        const isError =
          msg.toLowerCase().includes('fail') ||
          msg.toLowerCase().includes('error') ||
          msg.toLowerCase().includes('reject') ||
          msg.toLowerCase().includes('insufficient_margin');

        return (
          <div
            className={`p-4 rounded-xl border flex items-start space-x-3 transition-all ${
              isError
                ? 'bg-[#f04438]/10 border-[#f04438]/40 text-white shadow-lg shadow-[#f04438]/10'
                : 'bg-[#9de600]/10 border-[#9de600]/30 text-white shadow-lg shadow-[#9de600]/10'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-5 h-5 text-[#f04438] shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-[#9de600] shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${isError ? 'text-[#f04438]' : 'text-[#9de600]'}`}>
                  {isError ? '⚠️ Order Placement Notice / Exchange Rejection' : '✅ Latest Routine Action Status'}
                </span>
                {strategy.state.lastEvaluatedAt && (
                  <span className="text-[11px] text-[#85888e] font-mono">
                    Last Checked: {formatLastChecked(strategy.state.lastEvaluatedAt)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs font-mono text-[#f7f7f7] leading-relaxed break-words">
                {msg}
              </p>
              {msg.toLowerCase().includes('insufficient_margin') && (
                <div className="mt-2.5 p-3 rounded-lg bg-[#f04438]/15 border border-[#f04438]/30 text-xs text-[#fca5a5]">
                  <strong className="text-white block mb-1">Why did Delta Exchange reject the order?</strong>
                  Each short option contract requires isolated USD collateral margin. As the engine placed routine orders (accumulating 6 short contracts on Delta), your available balance dropped to ~$0.076 USD while Delta requires additional margin per lot.
                  <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="font-semibold text-white">To continue placing orders:</span>
                    <span>1. Deposit USD / USDT into your Delta Exchange wallet, OR</span>
                    <span>2. Square off or close running positions in the Live Positions table below.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 3 Clear Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Metric 1: Live Mark Price */}
        <div
          className={`mirror-card p-5 group transition-all duration-300 ${
            priceDirection === 'up'
              ? 'border-[#9de600]/60 bg-[#9de600]/5'
              : priceDirection === 'down'
              ? 'border-[#f04438]/60 bg-[#f04438]/5'
              : ''
          }`}
        >
          <div className="stat-hover-line" />
          <div className="flex items-center justify-between text-xs text-[#85888e]">
            <span className="flex items-center space-x-1.5 font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#9de600] animate-ping" />
              <span>Live {strategy.symbol || 'BTC'} Price</span>
            </span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                priceDirection === 'up'
                  ? 'bg-[#9de600]/20 text-[#9de600]'
                  : priceDirection === 'down'
                  ? 'bg-[#f04438]/20 text-[#f04438]'
                  : 'text-[#85888e] bg-[#1a1e26]'
              }`}
            >
              {priceDirection === 'up' ? '▲ UP' : priceDirection === 'down' ? '▼ DOWN' : 'LIVE'}
            </span>
          </div>
          <div className="mt-2 text-2xl font-mono font-black text-white">
            ${currentAssetPrice > 0 ? currentAssetPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '---'}
          </div>
          <p className="text-[11px] text-[#85888e] mt-1 font-mono">
            Streaming real-time ticks
          </p>
        </div>

        {/* Metric 2: Trend & Stage */}
        <div className="mirror-card p-5 group">
          <div className="stat-hover-line" />
          <div className="flex items-center justify-between text-xs text-[#85888e]">
            <span className="font-semibold">Trend Direction</span>
            <TrendingUp className="w-4 h-4 text-[#9de600]" />
          </div>
          <div className="mt-2 flex items-center space-x-2">
            <span
              className={`w-3 h-3 rounded-full ${
                indicatorStatus?.trend === 'BEARISH' ? 'bg-[#f04438]' : 'bg-[#9de600]'
              }`}
            />
            <span className="text-xl font-black text-white tracking-tight">
              {indicatorStatus?.trend || 'BULLISH'}
            </span>
          </div>
          <p className="text-[11px] text-[#85888e] mt-1 font-mono">
            Stage: <span className="text-[#9de600] font-bold">{stage}</span>
          </p>
        </div>

        {/* Metric 3: Future Profit Target */}
        <div className="mirror-card p-5 group">
          <div className="stat-hover-line" />
          <div className="flex items-center justify-between text-xs text-[#85888e]">
            <span className="font-semibold">Profit Target Goal</span>
            <span className="text-xs font-mono font-bold text-[#9de600]">
              {strategy.exitRules?.futureProfitTargetPercent || 4.5}%
            </span>
          </div>
          <div className="mt-2 text-2xl font-mono font-black text-white">
            +{strategy.exitRules?.futureProfitTargetPercent || 4.5}%
          </div>
          <p className="text-[11px] text-[#85888e] mt-1 font-mono">
            Auto squares off both legs on hit
          </p>
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
          <div className="mirror-card rounded-2xl overflow-hidden relative">
            <div className="stat-hover-line" />
            <div className="px-6 py-4 border-b border-[#22262f] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-[#9de600]" />
                <h3 className="text-base font-bold text-white">Recent Trade Activity</h3>
              </div>
              <div className="flex items-center space-x-3 text-xs">
                <div className="flex items-center space-x-1.5 text-[#85888e]">
                  <span>Rows:</span>
                  <select
                    value={activityPageSize}
                    onChange={(e) => {
                      setActivityPageSize(Number(e.target.value));
                      setActivityPage(1);
                    }}
                    className="bg-[#0c0e12] border border-[#22262f] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#9de600]"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <span className="text-xs text-[#85888e] font-mono">
                  {tradeLogs.length} total events
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0c0e12] text-[#85888e] border-b border-[#22262f] uppercase tracking-wider font-semibold text-[11px]">
                  <tr>
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Symbol</th>
                    <th className="px-5 py-3">Price</th>
                    <th className="px-5 py-3">Qty</th>
                    <th className="px-5 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#22262f] font-mono">
                  {paginatedTradeLogs.map((log) => {
                    const isFail = log.action.includes('FAIL') || log.action.includes('REJECT');
                    const isBuy = log.action.includes('BUY');
                    const isSquareOff = log.action.includes('SQUARE_OFF') || log.action.includes('CLOSE');
                    const isRoll = log.action.includes('ROLL');

                    return (
                      <tr key={log.id} className="hover:bg-[#0c0e12]/60 transition">
                        <td className="px-5 py-3 text-[#85888e] font-sans">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                              isFail
                                ? 'bg-[#f04438]/15 text-[#f04438] border border-[#f04438]/30'
                                : isSquareOff
                                ? 'bg-[#f04438]/10 text-[#f04438] border border-[#f04438]/20'
                                : isRoll
                                ? 'bg-[#b692f6]/10 text-[#d6bbfb] border border-[#b692f6]/20'
                                : isBuy
                                ? 'bg-[#9de600]/10 text-[#9de600] border border-[#9de600]/20'
                                : 'bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20'
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
                        <td className="px-5 py-3 font-bold text-white">{log.symbol}</td>
                        <td className="px-5 py-3 text-[#cecfd2]">${log.price.toLocaleString()}</td>
                        <td className="px-5 py-3 text-[#85888e]">{log.quantity}</td>
                        <td
                          className={`px-5 py-3 font-sans text-xs max-w-xs truncate ${
                            isFail ? 'text-[#fca5a5] font-semibold' : 'text-[#85888e]'
                          }`}
                          title={log.details}
                        >
                          {log.details || '---'}
                        </td>
                      </tr>
                    );
                  })}

                  {tradeLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-[#85888e] font-sans">
                        No trades executed yet. The automated engine logs every trade event here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {tradeLogs.length > 0 && (
              <div className="px-6 py-3.5 bg-[#0c0e12]/80 border-t border-[#22262f] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="text-[#85888e]">
                  Showing <span className="text-white font-medium">{(currentActPage - 1) * activityPageSize + 1}</span> to{' '}
                  <span className="text-white font-medium">
                    {Math.min(currentActPage * activityPageSize, tradeLogs.length)}
                  </span>{' '}
                  of <span className="text-white font-medium">{tradeLogs.length}</span> entries
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setActivityPage((p) => Math.max(p - 1, 1))}
                    disabled={currentActPage <= 1}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-[#22262f] bg-[#13161b] text-white hover:border-[#9de600]/40 disabled:opacity-30 disabled:cursor-not-allowed transition text-xs font-medium"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <div className="flex items-center space-x-1">
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
                          <span key={`dots-${idx}`} className="px-1 text-[#85888e]">
                            ...
                          </span>
                        ) : (
                          <button
                            key={item}
                            onClick={() => setActivityPage(item)}
                            className={`w-7 h-7 rounded-lg text-xs font-medium transition ${
                              currentActPage === item
                                ? 'bg-[#9de600] text-black font-bold'
                                : 'bg-[#13161b] border border-[#22262f] text-white hover:border-[#9de600]/40'
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
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-[#22262f] bg-[#13161b] text-white hover:border-[#9de600]/40 disabled:opacity-30 disabled:cursor-not-allowed transition text-xs font-medium"
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

      {/* Latest Strategy Status Notice */}
      {strategy.state?.lastMessage && (
        <div className="mirror-card p-4 flex items-center space-x-3 text-xs text-[#85888e]">
          <Clock className="w-4 h-4 text-[#9de600] shrink-0" />
          <span>Latest Engine Status: <strong className="text-[#f7f7f7]">{strategy.state.lastMessage}</strong></span>
        </div>
      )}
    </div>
  );
};
