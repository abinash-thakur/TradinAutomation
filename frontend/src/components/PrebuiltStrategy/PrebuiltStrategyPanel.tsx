import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  Wallet,
  Layers,
  Clock,
  Calendar,
  TrendingUp,
  Target,
  Info,
  Check,
  Shield,
} from 'lucide-react';
import type { BrokerAccount, Strategy, TickerSummary, TriggerFrequency } from '../../types';
import { api } from '../../services/api';

interface PrebuiltStrategyPanelProps {
  brokers: BrokerAccount[];
  strategy: Strategy | null;
  strategies?: Strategy[];
  activeStrategyId?: string;
  onSelectStrategy?: (strategyId: string) => void;
  btcTicker?: TickerSummary;
  ethTicker?: TickerSummary;
  indicatorStatus?: { trend: string; value: number; lastChecked: string } | null;
  onRefresh: () => void;
}

export const PrebuiltStrategyPanel: React.FC<PrebuiltStrategyPanelProps> = ({
  brokers,
  strategy,
  strategies,
  activeStrategyId,
  onSelectStrategy,
  btcTicker,
  ethTicker,
  indicatorStatus,
  onRefresh,
}) => {
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('');
  const [futureLots, setFutureLots] = useState<number>(2);
  const [optionLots, setOptionLots] = useState<number>(2);
  const [profitTarget, setProfitTarget] = useState<number>(4.5);
  const [stopLoss, setStopLoss] = useState<number>(5.0);
  const [optionDecay, setOptionDecay] = useState<number>(80);
  const [marginMode, setMarginMode] = useState<'PORTFOLIO' | 'ISOLATED' | 'CROSS'>('PORTFOLIO');

  // Calendar & Frequency States
  const [frequency, setFrequency] = useState<TriggerFrequency>('DAILY');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [routineTime, setRoutineTime] = useState<string>('15:30');
  const [intervalValue, setIntervalValue] = useState<number>(3);

  const [saving, setSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Deliberately keyed on strategy?.id, NOT the whole `strategy` object (and NOT `brokers`).
  // A live `strategy-update` socket event arrives constantly - every scheduled trigger, every
  // 10s monitor tick - and each one hands down a new `strategy` object reference even when
  // nothing the user is editing actually changed. Depending on the whole object here meant this
  // effect re-fired on every one of those broadcasts and silently reset every field below
  // (broker selection included) back to the last-saved server value, discarding any in-progress
  // edit before the user got to click Save. Keying on the id means this only re-initializes the
  // form when the user switches to editing a genuinely different strategy.
  useEffect(() => {
    if (strategy) {
      setSelectedBrokerId(strategy.brokerAccountId || (brokers[0]?.id || ''));
      setFutureLots(strategy.legsConfig?.futureLeg?.size || 2);
      setOptionLots(strategy.legsConfig?.optionLeg?.size || 2);
      setMarginMode(strategy.marginMode || strategy.legsConfig?.marginMode || 'PORTFOLIO');
      setProfitTarget(strategy.exitRules?.futureProfitTargetPercent || 4.5);
      setStopLoss(strategy.exitRules?.stopLossPercent || 5.0);
      setOptionDecay(strategy.exitRules?.optionProfitTargetPercent || 80);

      const triggerCfg = strategy.triggerConfig;
      setFrequency(triggerCfg?.frequency || 'DAILY');
      setStartDate(triggerCfg?.startDate || new Date().toISOString().split('T')[0]);
      setRoutineTime(triggerCfg?.time || '15:30');
      setIntervalValue(triggerCfg?.intervalValue || (triggerCfg?.frequency === 'EVERY_N_DAYS' ? 3 : 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy?.id]);

  if (!strategy) {
    return (
      <div className="mirror-card p-12 text-center text-txt-muted">
        <SlidersHorizontal className="w-12 h-12 text-brand mx-auto mb-3" />
        <h3 className="text-lg font-bold text-txt-primary">No Strategy Selected</h3>
        <p className="text-xs mt-1">Please select or connect a broker account first.</p>
      </div>
    );
  }

  const selectedBroker = brokers.find((b) => b.id === selectedBrokerId) || brokers[0];
  const isEth = strategy.symbol?.includes('ETH');
  const isSol = strategy.symbol?.includes('SOL');
  const activeTicker = isEth ? ethTicker : btcTicker;
  const currentPrice = activeTicker?.markPrice || 0;
  const stage = strategy.state?.stage || 'IDLE';

  // Asset specs
  const contractMultiplier = isEth ? '0.01 ETH' : isSol ? '1 SOL' : '0.001 BTC';
  const strikeInterval = isEth ? '$50' : isSol ? '$5' : '$500';

  const formatRoutineTime = (timeStr?: string) => {
    if (!timeStr) return '3:30 PM IST';
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    const m = mStr || '00';
    if (isNaN(h)) return `${timeStr} IST`;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m} ${period} IST`;
  };

  const getScheduleDescription = () => {
    const formattedTime = formatRoutineTime(routineTime);
    if (frequency === 'DAILY') {
      return `Every Day at ${formattedTime}`;
    }
    if (frequency === 'EVERY_N_DAYS') {
      return `Every ${intervalValue} Days at ${formattedTime}`;
    }
    if (frequency === 'HOURLY') {
      return `Every ${intervalValue} Hour(s)`;
    }
    if (frequency === 'MINUTES') {
      return `Every ${intervalValue} Minute(s)`;
    }
    return `Daily at ${formattedTime}`;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      await api.updateStrategy(strategy.id, {
        brokerAccountId: selectedBrokerId,
        marginMode,
        triggerConfig: {
          ...strategy.triggerConfig,
          type: 'SCHEDULE',
          frequency,
          startDate,
          time: routineTime,
          intervalValue: Number(intervalValue),
          timezone: 'Asia/Kolkata',
        },
        legsConfig: {
          ...strategy.legsConfig,
          marginMode,
          futureLeg: {
            ...strategy.legsConfig?.futureLeg,
            size: Number(futureLots),
          },
          optionLeg: {
            ...strategy.legsConfig?.optionLeg,
            size: Number(optionLots),
          },
        },
        exitRules: {
          ...strategy.exitRules,
          futureProfitTargetPercent: Number(profitTarget),
          stopLossPercent: Number(stopLoss),
          optionProfitTargetPercent: Number(optionDecay),
        },
      });
      setStatusMsg({
        type: 'success',
        text: `Settings saved successfully! Routine scheduled: ${getScheduleDescription()} starting ${startDate}.`,
      });
      onRefresh();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.response?.data?.message || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    try {
      await api.toggleStrategy(strategy.id);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to toggle strategy');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Strategy Status */}
      <div className="mirror-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
        <div>
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-semibold text-txt-primary tracking-tight">Strategy Settings</h2>
            <span
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                strategy.status === 'ACTIVE'
                  ? 'bg-brand/15 text-brand border-brand/30'
                  : 'bg-amber-400/10 text-amber-300 border-amber-400/30'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${strategy.status === 'ACTIVE' ? 'bg-brand animate-pulse' : 'bg-amber-400'}`} />
              <span>{strategy.status === 'ACTIVE' ? 'Engine Running' : 'Engine Paused'}</span>
            </span>
          </div>
          <p className="text-xs text-txt-muted mt-1.5">
            Automated Covered Call execution parameters, multi-frequency calendar scheduler, and risk controls.
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition ${
            strategy.status === 'ACTIVE'
              ? 'bg-surface-elevated hover:bg-surface-border text-amber-400 border border-amber-400/30'
              : 'btn-mirror-primary'
          }`}
        >
          {strategy.status === 'ACTIVE' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{strategy.status === 'ACTIVE' ? 'Pause Automation' : 'Activate Automation'}</span>
        </button>
      </div>

      {/* Ticker Selector Bar */}
      {strategies && strategies.length > 1 && (
        <div className="flex items-center space-x-2 bg-surface-card border border-surface-border p-2 rounded-2xl">
          <span className="text-xs font-bold uppercase tracking-wider text-txt-muted px-3">
            Selected Pair:
          </span>
          <div className="flex items-center space-x-2">
            {strategies.map((s) => {
              const isSelected = s.id === (strategy?.id || activeStrategyId);
              return (
                <button
                  key={s.id}
                  onClick={() => onSelectStrategy && onSelectStrategy(s.id)}
                  className={`flex items-center space-x-2 px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                    isSelected
                      ? 'bg-brand/15 text-brand border border-brand/40'
                      : 'bg-surface-elevated text-txt-secondary hover:text-txt-primary hover:bg-surface-border border border-surface-border'
                  }`}
                >
                  <span>{s.symbol || s.name}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.status === 'ACTIVE' ? 'bg-brand animate-pulse' : 'bg-txt-dim'}`} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Settings (7 cols) */}
        <form onSubmit={handleSave} className="lg:col-span-7 space-y-6">
          {/* Card 1: Broker Routing */}
          <div className="mirror-card p-6 space-y-4 relative overflow-hidden">
            <div className="flex items-center space-x-2 border-b border-surface-border pb-3">
              <Wallet className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-bold text-txt-primary uppercase tracking-wider">
                1. Broker Routing &amp; Account
              </h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-txt-secondary mb-1.5">
                Execute On Broker Account
              </label>
              <select
                value={selectedBrokerId}
                onChange={(e) => setSelectedBrokerId(e.target.value)}
                disabled={brokers.length === 0}
                className="w-full bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2.5 text-sm text-txt-primary focus:outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {brokers.length === 0 ? (
                  <option value="">No broker connected — add one under Broker Accounts first</option>
                ) : (
                  brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.brokerType.toUpperCase()}) — ${b.balanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </option>
                  ))
                )}
              </select>
              {selectedBroker && (
                <div className="mt-2.5 flex items-center justify-between text-xs text-txt-muted bg-surface-base px-3.5 py-2 rounded-xl border border-surface-border">
                  <span>Available Balance:</span>
                  <span className="font-mono font-bold text-brand">
                    ${selectedBroker.balanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Margin Mode Configuration */}
          <div className="mirror-card p-6 space-y-4 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-border pb-3">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-bold text-txt-primary uppercase tracking-wider">
                  2. Margin Mode Configuration
                </h3>
              </div>
              <span className="text-[11px] font-mono font-bold text-brand bg-brand/10 px-2.5 py-1 rounded-md border border-brand/30 uppercase">
                {marginMode} Margin Mode
              </span>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-txt-secondary">
                Select Margin Calculation Mode
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: 'PORTFOLIO',
                    title: 'Portfolio Margin',
                    badge: 'Recommended',
                    desc: 'Offsets risk between Long Futures & Short Calls. Provides maximum capital efficiency on Delta Exchange.',
                  },
                  {
                    id: 'ISOLATED',
                    title: 'Isolated Margin',
                    badge: 'Standard',
                    desc: 'Locks independent USD collateral for each contract leg. Short options require separate collateral.',
                  },
                  {
                    id: 'CROSS',
                    title: 'Cross Margin',
                    badge: 'Shared',
                    desc: 'Shares entire available account balance across all running positions to prevent liquidation.',
                  },
                ].map((mode) => {
                  const isSelected = marginMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setMarginMode(mode.id as 'PORTFOLIO' | 'ISOLATED' | 'CROSS')}
                      className={`p-3.5 rounded-xl text-left transition border flex flex-col justify-between ${
                        isSelected
                          ? 'bg-brand/15 border-brand/40'
                          : 'bg-surface-base border-surface-border hover:border-surface-borderLight'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${isSelected ? 'text-brand' : 'text-txt-primary'}`}>
                            {mode.title}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                              mode.id === 'PORTFOLIO'
                                ? 'bg-brand/20 text-brand font-bold'
                                : 'bg-surface-elevated text-txt-muted'
                            }`}
                          >
                            {mode.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-txt-muted mt-1.5 leading-relaxed">
                          {mode.desc}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center space-x-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSelected ? 'bg-brand' : 'bg-surface-border'
                          }`}
                        />
                        <span className={`text-[10px] font-mono ${isSelected ? 'text-brand font-bold' : 'text-txt-dim'}`}>
                          {isSelected ? 'ACTIVE' : 'SELECT'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {marginMode === 'PORTFOLIO' && (
                <div className="p-3 bg-brand/10 border border-brand/25 rounded-xl text-xs text-[#d0f280] flex items-start space-x-2.5">
                  <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="text-txt-primary">Portfolio Margin Active:</strong> Delta Exchange will hedge your long futures against your short calls. All orders placed by the strategy will specify <code className="text-txt-primary font-mono font-bold bg-surface-base px-1 py-0.5 rounded border border-brand/30">margin_mode: portfolio</code>.
                  </div>
                </div>
              )}

              {marginMode === 'ISOLATED' && (
                <div className="p-3 bg-amber-400/10 border border-amber-400/25 rounded-xl text-xs text-amber-200 flex items-start space-x-2.5">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong className="text-txt-primary">Isolated Margin Notice:</strong> Each contract leg will lock separate collateral. Ensure your account has sufficient available USD balance to satisfy isolated margin requirements for short calls.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Date Calendar & Execution Frequency */}
          <div className="mirror-card p-6 space-y-4 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-surface-border pb-3">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-bold text-txt-primary uppercase tracking-wider">
                  3. Execution Schedule &amp; Frequency
                </h3>
              </div>
              <span className="text-[11px] font-mono font-bold text-brand bg-brand/10 px-2.5 py-1 rounded-md border border-brand/30">
                {getScheduleDescription()}
              </span>
            </div>

            <div className="space-y-4">
              {/* Frequency Selector Pills */}
              <div>
                <label className="block text-xs font-semibold text-txt-secondary mb-1.5">
                  Execution Frequency
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'DAILY', label: 'Every Day', desc: 'Daily at time' },
                    { id: 'EVERY_N_DAYS', label: 'Every N Days', desc: 'e.g. Every 3 days' },
                    { id: 'HOURLY', label: 'Every Hour', desc: 'Hourly routine' },
                    { id: 'MINUTES', label: 'Every Minute', desc: 'Minute intervals' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setFrequency(item.id as TriggerFrequency);
                        if (item.id === 'EVERY_N_DAYS' && intervalValue < 2) setIntervalValue(3);
                        if (item.id === 'HOURLY' && intervalValue > 24) setIntervalValue(1);
                        if (item.id === 'MINUTES' && intervalValue > 60) setIntervalValue(15);
                      }}
                      className={`p-2.5 rounded-xl text-left transition border ${
                        frequency === item.id
                          ? 'bg-brand/15 border-brand/40'
                          : 'bg-surface-base border-surface-border hover:border-surface-borderLight'
                      }`}
                    >
                      <div className={`text-xs font-bold ${frequency === item.id ? 'text-brand' : 'text-txt-primary'}`}>
                        {item.label}
                      </div>
                      <div className="text-[10px] text-txt-muted mt-0.5">{item.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Date & Time Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* Calendar Date Picker */}
                <div>
                  <label className="block text-xs font-semibold text-txt-secondary mb-1.5 flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-brand" />
                    <span>Calendar Start Date</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2.5 text-sm text-txt-primary font-mono focus:outline-none transition"
                  />
                  <p className="text-[11px] text-txt-muted mt-1">
                    Strategy schedule begins on this date.
                  </p>
                </div>

                {/* Routine Time Picker (for Daily & Every N Days) */}
                {(frequency === 'DAILY' || frequency === 'EVERY_N_DAYS') && (
                  <div>
                    <label className="block text-xs font-semibold text-txt-secondary mb-1.5 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-brand" />
                      <span>Execution Time (IST)</span>
                    </label>
                    <input
                      type="time"
                      value={routineTime}
                      onChange={(e) => setRoutineTime(e.target.value)}
                      required
                      className="w-full bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2.5 text-sm text-txt-primary font-mono focus:outline-none transition"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {[
                        { time: '15:30', label: '3:30 PM' },
                        { time: '16:30', label: '4:30 PM' },
                        { time: '17:00', label: '5:00 PM' },
                        { time: '09:30', label: '9:30 AM' },
                      ].map((preset) => (
                        <button
                          key={preset.time}
                          type="button"
                          onClick={() => setRoutineTime(preset.time)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition border ${
                            routineTime === preset.time
                              ? 'bg-brand/20 text-brand border-brand/40'
                              : 'bg-surface-base text-txt-muted border-surface-border hover:text-txt-primary'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Day Interval for EVERY_N_DAYS */}
                {frequency === 'EVERY_N_DAYS' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-txt-secondary mb-1.5">
                      Day Interval (Run every N days)
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={intervalValue}
                        onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value)))}
                        className="w-28 bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2 text-sm text-txt-primary font-mono focus:outline-none transition"
                      />
                      <span className="text-xs text-txt-secondary font-semibold">Days</span>
                      {[2, 3, 5, 7].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setIntervalValue(d)}
                          className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition border ${
                            intervalValue === d
                              ? 'bg-brand/20 text-brand border-brand/40'
                              : 'bg-surface-base text-txt-muted border-surface-border hover:text-txt-primary'
                          }`}
                        >
                          Every {d} Days
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hour Interval for HOURLY */}
                {frequency === 'HOURLY' && (
                  <div>
                    <label className="block text-xs font-semibold text-txt-secondary mb-1.5">
                      Hour Interval
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={intervalValue}
                        onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value)))}
                        className="w-28 bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2 text-sm text-txt-primary font-mono focus:outline-none transition"
                      />
                      <span className="text-xs text-txt-secondary font-semibold">Hour(s)</span>
                      {[1, 2, 4, 6].map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setIntervalValue(h)}
                          className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition border ${
                            intervalValue === h
                              ? 'bg-brand/20 text-brand border-brand/40'
                              : 'bg-surface-base text-txt-muted border-surface-border hover:text-txt-primary'
                          }`}
                        >
                          Every {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Minute Interval for MINUTES */}
                {frequency === 'MINUTES' && (
                  <div>
                    <label className="block text-xs font-semibold text-txt-secondary mb-1.5">
                      Minute Interval
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={intervalValue}
                        onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value)))}
                        className="w-28 bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2 text-sm text-txt-primary font-mono focus:outline-none transition"
                      />
                      <span className="text-xs text-txt-secondary font-semibold">Mins</span>
                      {[1, 5, 15, 30].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setIntervalValue(m)}
                          className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition border ${
                            intervalValue === m
                              ? 'bg-brand/20 text-brand border-brand/40'
                              : 'bg-surface-base text-txt-muted border-surface-border hover:text-txt-primary'
                          }`}
                        >
                          Every {m}m
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 4: Position Sizing & Lots */}
          <div className="mirror-card p-6 space-y-4 relative overflow-hidden">
            <div className="flex items-center space-x-2 border-b border-surface-border pb-3">
              <Layers className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-bold text-txt-primary uppercase tracking-wider">
                4. Position Sizing (Lots per Tranche)
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-txt-secondary">
                    Future Contract Size (Tranche)
                  </label>
                  <span className="text-[11px] text-txt-muted font-mono">
                    1 Contract = {contractMultiplier}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={futureLots}
                    onChange={(e) => setFutureLots(Number(e.target.value))}
                    required
                    className="flex-1 bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2.5 text-sm text-txt-primary font-mono focus:outline-none transition"
                  />
                  {[1, 2, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFutureLots(preset)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-mono font-bold transition border ${
                        futureLots === preset
                          ? 'bg-brand/20 text-brand border-brand/40'
                          : 'bg-surface-base text-txt-muted border-surface-border hover:text-txt-primary'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-txt-muted mt-1.5">
                  Number of future contracts bought per scheduled routine.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-txt-secondary">
                    Short Call Option Size
                  </label>
                  <span className="text-[11px] text-txt-muted font-mono">
                    ATM Strike ({strikeInterval} step)
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={optionLots}
                    onChange={(e) => setOptionLots(Number(e.target.value))}
                    required
                    className="flex-1 bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2.5 text-sm text-txt-primary font-mono focus:outline-none transition"
                  />
                  {[1, 2, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setOptionLots(preset)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-mono font-bold transition border ${
                        optionLots === preset
                          ? 'bg-brand/20 text-brand border-brand/40'
                          : 'bg-surface-base text-txt-muted border-surface-border hover:text-txt-primary'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-txt-muted mt-1.5">
                  Number of Next-Day ATM Call contracts sold to hedge the future leg.
                </p>
              </div>
            </div>
          </div>

          {/* Card 5: Profit Targets & Risk Parameters */}
          <div className="mirror-card p-6 space-y-4 relative overflow-hidden">
            <div className="flex items-center space-x-2 border-b border-surface-border pb-3">
              <Target className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-bold text-txt-primary uppercase tracking-wider">
                5. Profit Target &amp; Risk Parameters
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Profit Target */}
              <div>
                <label className="block text-xs font-semibold text-txt-secondary mb-1.5">
                  Future Profit Target (% Gain)
                </label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={profitTarget}
                      onChange={(e) => setProfitTarget(Number(e.target.value))}
                      required
                      className="w-full bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2.5 text-sm text-txt-primary font-mono focus:outline-none transition"
                    />
                    <span className="absolute right-4 top-2.5 text-xs text-txt-muted font-bold">%</span>
                  </div>
                  {[3, 4.5, 6].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProfitTarget(p)}
                      className={`px-2.5 py-2.5 rounded-xl text-xs font-mono font-bold transition border ${
                        profitTarget === p
                          ? 'bg-brand/20 text-brand border-brand/40'
                          : 'bg-surface-base text-txt-muted border-surface-border hover:text-txt-primary'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-txt-muted mt-1.5">
                  Auto squares off both legs when future hits this gain.
                </p>
              </div>

              {/* Stop Loss */}
              <div>
                <label className="block text-xs font-semibold text-txt-secondary mb-1.5">
                  Safety Stop Loss (% Drawdown)
                </label>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      value={stopLoss}
                      onChange={(e) => setStopLoss(Number(e.target.value))}
                      required
                      className="w-full bg-surface-base border border-surface-border focus:border-brand rounded-xl px-4 py-2.5 text-sm text-txt-primary font-mono focus:outline-none transition"
                    />
                    <span className="absolute right-4 top-2.5 text-xs text-txt-muted font-bold">%</span>
                  </div>
                  {[3, 5, 8].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStopLoss(s)}
                      className={`px-2.5 py-2.5 rounded-xl text-xs font-mono font-bold transition border ${
                        stopLoss === s
                          ? 'bg-danger/20 text-danger border-danger/40'
                          : 'bg-surface-base text-txt-muted border-surface-border hover:text-txt-primary'
                      }`}
                    >
                      {s}%
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-txt-muted mt-1.5">
                  Emergency exit threshold if market crashes deeply.
                </p>
              </div>
            </div>

            {/* Option Premium Decay */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-txt-secondary mb-1.5">
                <span className="font-semibold">Option Premium Decay Target</span>
                <span className="font-mono text-brand font-bold">{optionDecay}% decay</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={optionDecay}
                onChange={(e) => setOptionDecay(Number(e.target.value))}
                className="w-full accent-brand cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-txt-muted font-mono mt-1">
                <span>50% (Conservative)</span>
                <span>80% (Recommended)</span>
                <span>95% (Maximum)</span>
              </div>
            </div>
          </div>

          {/* Feedback Message */}
          {statusMsg && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-center space-x-2 ${
                statusMsg.type === 'success'
                  ? 'bg-brand/10 border-brand/30 text-brand'
                  : 'bg-danger/10 border-danger/30 text-[#fda29b]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{statusMsg.text}</span>
            </div>
          )}

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving}
            className="w-full btn-mirror-primary py-3.5 rounded-xl text-sm font-bold transition flex items-center justify-center space-x-2"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin text-surface-base" />
            ) : (
              <Check className="w-4 h-4 text-surface-base" />
            )}
            <span>{saving ? 'Saving Changes...' : 'Save Strategy Settings'}</span>
          </button>
        </form>

        {/* Right Column: Strategy Overview & Rules Summary (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Asset & Live Market Regime */}
          <div className="mirror-card p-6 space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-bold text-txt-primary uppercase tracking-wider">
                  Live Market Regime
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-base text-txt-muted border border-surface-border">
                4H Candle
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-surface-border">
                <span className="text-txt-muted">Trading Symbol:</span>
                <span className="font-bold text-txt-primary font-mono">{strategy.symbol}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-surface-border">
                <span className="text-txt-muted">Live Mark Price:</span>
                <span className="font-bold text-brand font-mono text-sm">
                  ${currentPrice > 0 ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '---'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-surface-border">
                <span className="text-txt-muted">Active Schedule:</span>
                <span className="font-bold text-brand font-mono text-right max-w-[200px] truncate">
                  {getScheduleDescription()}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-surface-border">
                <span className="text-txt-muted">Margin Mode:</span>
                <span className="font-bold text-brand font-mono">{marginMode}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-surface-border">
                <span className="text-txt-muted">Calendar Start:</span>
                <span className="font-bold text-txt-primary font-mono">{startDate}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-surface-border">
                <span className="text-txt-muted">4H Supertrend:</span>
                <span className={`font-bold font-mono ${indicatorStatus?.trend === 'BEARISH' ? 'text-danger' : 'text-brand'}`}>
                  {indicatorStatus?.trend || 'BULLISH (GREEN)'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-surface-border">
                <span className="text-txt-muted">Contract Size:</span>
                <span className="font-bold text-txt-primary font-mono">{contractMultiplier}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-txt-muted">Strike Interval:</span>
                <span className="font-bold text-txt-primary font-mono">{strikeInterval}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Strategy Rules in Plain English */}
          <div className="mirror-card p-6 space-y-4 relative overflow-hidden">
            <div className="flex items-center space-x-2 border-b border-surface-border pb-3">
              <Info className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-bold text-txt-primary uppercase tracking-wider">
                Execution Rules Summary
              </h3>
            </div>

            <div className="space-y-3.5 text-xs text-txt-secondary">
              <div className="flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded-full bg-brand/15 text-brand flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">
                  1
                </div>
                <div>
                  <strong className="text-txt-primary">Scheduled Trend Evaluation:</strong>
                  <p className="text-txt-muted text-[11px] mt-0.5">
                    Evaluates market trend ({getScheduleDescription()}). If 4H Supertrend is bullish, buys {futureLots} lots Future and sells {optionLots} lots ATM Next-Day Call (5:30 PM expiry).
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded-full bg-brand/15 text-brand flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">
                  2
                </div>
                <div>
                  <strong className="text-txt-primary">1% Dip Averaging:</strong>
                  <p className="text-txt-muted text-[11px] mt-0.5">
                    If price drops ≥ 1% below initial entry strike during scheduled check, the engine enters the next tranche layer to lower average cost.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded-full bg-brand/15 text-brand flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">
                  3
                </div>
                <div>
                  <strong className="text-txt-primary">+{profitTarget}% Profit Exit:</strong>
                  <p className="text-txt-muted text-[11px] mt-0.5">
                    When the future leg gains {profitTarget}%, both the future and short call positions are automatically closed for full profit.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded-full bg-brand/15 text-brand flex items-center justify-center shrink-0 font-bold text-[10px] mt-0.5">
                  4
                </div>
                <div>
                  <strong className="text-txt-primary">Protective Option Roll:</strong>
                  <p className="text-txt-muted text-[11px] mt-0.5">
                    If future price breaches strike price, the engine automatically rolls the short call to next-day ATM strike to protect gains.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Current Strategy Stage */}
          <div className="mirror-card p-5 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between text-xs">
              <span className="text-txt-muted">Current Engine Stage:</span>
              <span className="px-2.5 py-0.5 rounded font-mono font-bold uppercase bg-brand/15 text-brand border border-brand/30">
                {stage}
              </span>
            </div>
            {strategy.state?.lastMessage && (
              <p className="text-[11px] text-txt-muted font-mono pt-1">
                Last Event: <span className="text-txt-primary">{strategy.state.lastMessage}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
