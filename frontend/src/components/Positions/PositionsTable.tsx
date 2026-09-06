import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  XCircle,
  AlertCircle,
  Layers,
  History,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { api } from '../../services/api';
import type { BrokerAccountPositions, PositionInfo, TradeLog } from '../../types';
import { DeltaLogo } from '../Common/DeltaLogo';

interface PositionsTableProps {
  tradeLogs?: TradeLog[];
  onPositionClosed?: () => void;
}

export const PositionsTable: React.FC<PositionsTableProps> = ({ tradeLogs = [], onPositionClosed }) => {
  const [activeSubTab, setActiveSubTab] = useState<'open' | 'closed'>('open');
  const [accountPositions, setAccountPositions] = useState<BrokerAccountPositions[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [closingKey, setClosingKey] = useState<string | null>(null);

  // Closed positions state & pagination
  const [fetchedLogs, setFetchedLogs] = useState<TradeLog[]>([]);
  const [closedPage, setClosedPage] = useState<number>(1);
  const [closedPageSize, setClosedPageSize] = useState<number>(10);

  // Open positions pagination
  const [openPage, setOpenPage] = useState<number>(1);
  const [openPageSize, setOpenPageSize] = useState<number>(10);

  const fetchPositions = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.getAllPositions();
      setAccountPositions(data);
    } catch (err) {
      console.error('Failed to fetch positions', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchClosedLogs = async () => {
    try {
      const logs = await api.getLogs();
      setFetchedLogs(logs);
    } catch (err) {
      console.error('Failed to fetch closed position logs', err);
    }
  };

  useEffect(() => {
    fetchPositions();
    fetchClosedLogs();

    // Continuous live refresh every 3 seconds
    const interval = setInterval(() => {
      fetchPositions(true);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleClosePosition = async (
    accountId: string,
    accountName: string,
    pos: PositionInfo,
  ) => {
    const confirmMsg = `Close ${pos.side.toUpperCase()} position of ${pos.size} contracts in ${pos.symbol} on "${accountName}"?`;
    if (!confirm(confirmMsg)) return;

    const key = `${accountId}-${pos.productId || pos.symbol}`;
    setClosingKey(key);
    try {
      await api.closePosition(accountId, pos.symbol, pos.productId);
      await fetchPositions(false);
      await fetchClosedLogs();
      if (onPositionClosed) onPositionClosed();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Failed to close position');
    } finally {
      setClosingKey(null);
    }
  };

  // Aggregate live open positions
  const allPositions = accountPositions.flatMap((acc) =>
    acc.positions.map((p) => ({
      ...p,
      brokerName: acc.brokerName,
      brokerType: acc.brokerType,
      accountId: acc.brokerAccountId,
    })),
  );

  const totalUnrealizedPnl = allPositions.reduce((acc, p) => acc + (p.unrealizedPnl || 0), 0);

  // Combine parent logs and local logs for closed positions
  const combinedLogs = tradeLogs.length > 0 ? tradeLogs : fetchedLogs;
  const closedPositionsList = combinedLogs.filter(
    (log) =>
      log.action.includes('SQUARE_OFF') ||
      log.action.includes('CLOSE') ||
      log.action.includes('EXIT') ||
      log.action.includes('ROLL') ||
      log.action.includes('DECAY') ||
      log.action.includes('FAILED') ||
      (log.pnl !== null && log.pnl !== undefined),
  );

  // Pagination for Closed Positions
  const totalClosedPages = Math.max(1, Math.ceil(closedPositionsList.length / closedPageSize));
  const safeClosedPage = Math.min(closedPage, totalClosedPages);
  const paginatedClosedPositions = closedPositionsList.slice(
    (safeClosedPage - 1) * closedPageSize,
    safeClosedPage * closedPageSize,
  );

  // Pagination for Open Positions
  const totalOpenPages = Math.max(1, Math.ceil(allPositions.length / openPageSize));
  const safeOpenPage = Math.min(openPage, totalOpenPages);
  const paginatedOpenPositions = allPositions.slice(
    (safeOpenPage - 1) * openPageSize,
    safeOpenPage * openPageSize,
  );

  return (
    <div className="mirror-card p-6 space-y-6">
      {/* Header with Sub-tabs and Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-border pb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Sub-tab 1: Open Positions */}
          <button
            type="button"
            onClick={() => setActiveSubTab('open')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeSubTab === 'open'
                ? 'bg-surface-elevated text-txt-primary'
                : 'text-txt-muted hover:text-txt-secondary'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Live Open Positions</span>
            <span className={activeSubTab === 'open' ? 'text-brand font-mono' : 'text-txt-dim font-mono'}>
              {allPositions.length}
            </span>
          </button>

          {/* Sub-tab 2: Closed Positions History */}
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('closed');
              fetchClosedLogs();
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeSubTab === 'closed'
                ? 'bg-surface-elevated text-txt-primary'
                : 'text-txt-muted hover:text-txt-secondary'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Closed Positions History</span>
            <span className={activeSubTab === 'closed' ? 'text-brand font-mono' : 'text-txt-dim font-mono'}>
              {closedPositionsList.length}
            </span>
          </button>
        </div>

        {/* Right side: Live PnL & Refresh */}
        <div className="flex items-center space-x-3">
          {activeSubTab === 'open' && allPositions.length > 0 && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                totalUnrealizedPnl >= 0
                  ? 'bg-brand/10 text-brand border-brand/30'
                  : 'bg-danger/10 text-danger border-danger/30'
              }`}
            >
              Unrealized PnL:{' '}
              {totalUnrealizedPnl > 0 ? '+' : totalUnrealizedPnl < 0 ? '-' : ''}$
              {Math.abs(totalUnrealizedPnl).toFixed(2)}
            </span>
          )}

          <button
            onClick={() => {
              fetchPositions(false);
              fetchClosedLogs();
            }}
            disabled={loading}
            className="btn-mirror-secondary px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5"
            title="Refresh positions from exchange"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Account Notices / Errors */}
      {accountPositions.some((a) => a.error) && (
        <div className="space-y-2">
          {accountPositions
            .filter((a) => a.error)
            .map((a) => (
              <div
                key={a.brokerAccountId}
                className="p-3 bg-[#f79009]/10 border border-[#f79009]/30 rounded-xl text-xs text-[#fec84b] flex items-start space-x-2"
              >
                <AlertCircle className="w-4 h-4 text-[#f79009] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-txt-primary">{a.brokerName}: </span>
                  <span>{a.error}</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* TAB 1: LIVE OPEN POSITIONS */}
      {activeSubTab === 'open' && (
        <div className="space-y-4">
          {allPositions.length > 0 && (
            <div className="p-3 bg-surface-card border border-surface-border rounded-xl text-xs text-txt-muted flex items-center space-x-2.5">
              <span className="w-2 h-2 rounded-full bg-brand shrink-0" />
              <span>
                <strong className="text-txt-primary">Exchange Order Accumulation:</strong> Consecutive routine orders in the same contract accumulate directly into the single row below by increasing its contract <strong className="text-brand">Size</strong>.
              </span>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl bg-surface-base/50">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-base text-txt-muted font-semibold border-b border-surface-border uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Account / Broker</th>
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4">Side</th>
                  <th className="py-3 px-4 text-right">Size</th>
                  <th className="py-3 px-4 text-right">Entry Price</th>
                  <th className="py-3 px-4 text-right">Mark Price</th>
                  <th className="py-3 px-4 text-right">Unrealized PnL</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border font-mono">
                {allPositions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-txt-muted font-sans text-xs">
                      {loading ? (
                        <div className="flex items-center justify-center space-x-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-brand" />
                          <span>Checking exchange running positions...</span>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <CheckCircle2 className="w-8 h-8 text-txt-muted mx-auto mb-1 opacity-50" />
                          <p className="font-semibold text-txt-primary">No Active Running Positions</p>
                          <p className="text-[11px] text-txt-muted">
                            All positions are currently closed. The engine will place fresh orders on the next routine schedule.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedOpenPositions.map((pos, idx) => {
                    const isBuy = pos.side === 'buy';
                    const rowKey = `${pos.accountId}-${pos.productId || pos.symbol}-${idx}`;
                    const isClosing = closingKey === `${pos.accountId}-${pos.productId || pos.symbol}`;

                    return (
                      <tr key={rowKey} className="hover:bg-surface-card transition">
                        {/* Broker Name */}
                        <td className="py-3 px-4 font-sans">
                          <div className="flex items-center space-x-2">
                            {pos.brokerType?.startsWith('delta-') ? (
                              <DeltaLogo
                                variant="icon"
                                className="w-4 h-4 shrink-0"
                                type={pos.brokerType === 'delta-global' ? 'global' : 'india'}
                              />
                            ) : null}
                            <div>
                              <div className="font-semibold text-txt-primary">{pos.brokerName}</div>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-card text-txt-muted border border-surface-border">
                                {pos.brokerType}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Symbol */}
                        <td className="py-3 px-4 font-bold text-txt-primary font-mono">
                          {pos.symbol}
                        </td>

                        {/* Side */}
                        <td className="py-3 px-4 font-sans">
                          <span
                            className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              isBuy
                                ? 'bg-brand/15 text-brand border border-brand/30'
                                : 'bg-danger/15 text-danger border border-danger/30'
                            }`}
                          >
                            {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            <span>{isBuy ? 'LONG / BUY' : 'SHORT / SELL'}</span>
                          </span>
                        </td>

                        {/* Size */}
                        <td className="py-3 px-4 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-elevated border border-surface-border text-txt-primary font-mono font-bold text-xs">
                            {pos.size} {pos.size === 1 ? 'contract' : 'contracts'}
                          </span>
                        </td>

                        {/* Entry Price */}
                        <td className="py-3 px-4 text-right text-txt-secondary">
                          ${pos.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Mark Price */}
                        <td className="py-3 px-4 text-right text-txt-secondary">
                          ${pos.markPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Unrealized PnL */}
                        <td className="py-3 px-4 text-right font-bold font-mono">
                          {(() => {
                            const pnl = pos.unrealizedPnl || 0;
                            const isPnlPos = pnl > 0;
                            const isPnlNeg = pnl < 0;
                            const pnlSign = isPnlPos ? '+' : isPnlNeg ? '-' : '';
                            const pnlAbs = Math.abs(pnl);
                            const pnlFormatted = `${pnlSign}$${pnlAbs > 0 && pnlAbs < 0.01 ? pnlAbs.toFixed(3) : pnlAbs.toFixed(2)}`;

                            const pct = pos.pnlPercent;
                            const isPctPos = pct !== undefined && pct > 0;
                            const isPctNeg = pct !== undefined && pct < 0;
                            const pctSign = isPctPos ? '+' : isPctNeg ? '-' : '';
                            const pctFormatted =
                              pct !== undefined
                                ? `(${pctSign}${Math.abs(pct).toFixed(2)}%)`
                                : null;

                            return (
                              <>
                                <div
                                  className={
                                    isPnlPos
                                      ? 'text-brand'
                                      : isPnlNeg
                                      ? 'text-danger'
                                      : 'text-txt-muted'
                                  }
                                >
                                  {pnlFormatted}
                                </div>
                                {pctFormatted && (
                                  <div
                                    className={`text-[10px] ${
                                      isPctPos
                                        ? 'text-brand'
                                        : isPctNeg
                                        ? 'text-danger'
                                        : 'text-txt-muted'
                                    }`}
                                  >
                                    {pctFormatted}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </td>

                        {/* Close Position Action Button */}
                        <td className="py-3 px-4 text-center font-sans">
                          <button
                            type="button"
                            onClick={() => handleClosePosition(pos.accountId, pos.brokerName, pos)}
                            disabled={isClosing}
                            className="px-3 py-1.5 rounded-xl bg-danger/15 hover:bg-danger/25 text-danger border border-danger/40 text-xs font-bold transition flex items-center space-x-1.5 mx-auto active:scale-95"
                            title={`Close ${pos.symbol} position immediately`}
                          >
                            {isClosing ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            <span>Close Position</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Open Positions Pagination */}
          {allPositions.length > 5 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-txt-muted pt-1">
              <div className="flex items-center space-x-2">
                <span>
                  Showing {(safeOpenPage - 1) * openPageSize + 1} to{' '}
                  {Math.min(safeOpenPage * openPageSize, allPositions.length)} of {allPositions.length} active positions
                </span>
                <div className="flex items-center space-x-1 ml-2">
                  <span>Rows:</span>
                  <select
                    value={openPageSize}
                    onChange={(e) => {
                      setOpenPageSize(Number(e.target.value));
                      setOpenPage(1);
                    }}
                    className="bg-surface-base border border-surface-border rounded px-1.5 py-0.5 text-txt-primary text-xs focus:outline-none focus:border-brand"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setOpenPage((p) => Math.max(1, p - 1))}
                  disabled={safeOpenPage <= 1}
                  className="px-2.5 py-1 rounded-lg bg-surface-card border border-surface-border text-txt-primary disabled:opacity-30 hover:border-brand/40 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono text-txt-primary">
                  Page {safeOpenPage} of {totalOpenPages}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenPage((p) => Math.min(totalOpenPages, p + 1))}
                  disabled={safeOpenPage >= totalOpenPages}
                  className="px-2.5 py-1 rounded-lg bg-surface-card border border-surface-border text-txt-primary disabled:opacity-30 hover:border-brand/40 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CLOSED POSITIONS HISTORY */}
      {activeSubTab === 'closed' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl bg-surface-base/50">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-base text-txt-muted font-semibold border-b border-surface-border uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Closed Time</th>
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4 text-right">Exit Price</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Realized PnL</th>
                  <th className="py-3 px-4">Details &amp; Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border font-mono">
                {closedPositionsList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-txt-muted font-sans text-xs">
                      <Clock className="w-8 h-8 text-txt-muted mx-auto mb-1 opacity-50" />
                      <p className="font-semibold text-txt-primary">No Closed Positions Yet</p>
                      <p className="text-[11px] text-txt-muted">
                        When positions are closed (via take-profit, call decay roll, or manual close), their exit details appear here.
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedClosedPositions.map((log) => {
                    const isPositive = (log.pnl || 0) > 0;
                    const isNegative = (log.pnl || 0) < 0;
                    const hasPnl = log.pnl !== null && log.pnl !== undefined;
                    const dateObj = new Date(log.timestamp);
                    const formattedDate = dateObj.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    });
                    const formattedTime = dateObj.toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <tr key={log.id} className="hover:bg-surface-card transition">
                        {/* Time */}
                        <td className="py-3 px-4 font-sans text-txt-muted">
                          <div>{formattedTime}</div>
                          <div className="text-[10px] text-txt-dim">{formattedDate}</div>
                        </td>

                        {/* Symbol */}
                        <td className="py-3 px-4 font-bold text-txt-primary font-mono">
                          {log.symbol}
                        </td>

                        {/* Action Badge */}
                        <td className="py-3 px-4 font-sans">
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-danger/15 text-danger border border-danger/30">
                            <XCircle className="w-3 h-3" />
                            <span>{log.action}</span>
                          </span>
                        </td>

                        {/* Exit Price */}
                        <td className="py-3 px-4 text-right text-txt-secondary">
                          ${log.price > 0 ? log.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Market'}
                        </td>

                        {/* Qty */}
                        <td className="py-3 px-4 text-right text-txt-primary font-bold">
                          {log.quantity}
                        </td>

                        {/* Realized PnL */}
                        <td className="py-3 px-4 text-right font-bold">
                          {hasPnl ? (
                            <span className={isPositive ? 'text-brand' : isNegative ? 'text-danger' : 'text-txt-muted'}>
                              {isPositive ? '+' : ''}${log.pnl!.toFixed(2)}
                            </span>
                          ) : log.action.includes('FAILED') ? (
                            <span className="text-danger text-[11px] font-bold">Rejected</span>
                          ) : (
                            <span className="text-txt-muted text-[11px]">Filled</span>
                          )}
                        </td>

                        {/* Details */}
                        <td className="py-3 px-4 font-sans text-[11px] text-txt-muted max-w-sm truncate" title={log.details}>
                          {log.details || 'Position closed on broker'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Closed Positions Pagination Controls */}
          {closedPositionsList.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-txt-muted pt-2 border-t border-surface-border/60">
              <div className="flex items-center space-x-3">
                <span>
                  Showing{' '}
                  <strong className="text-txt-primary font-mono">
                    {(safeClosedPage - 1) * closedPageSize + 1}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-txt-primary font-mono">
                    {Math.min(safeClosedPage * closedPageSize, closedPositionsList.length)}
                  </strong>{' '}
                  of <strong className="text-txt-primary font-mono">{closedPositionsList.length}</strong> closed positions
                </span>

                {/* Page Size Selector */}
                <div className="flex items-center space-x-1.5 ml-4">
                  <span>Per page:</span>
                  {[5, 10, 20, 50].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setClosedPageSize(size);
                        setClosedPage(1);
                      }}
                      className={`px-2 py-0.5 rounded font-mono text-[11px] transition ${
                        closedPageSize === size
                          ? 'bg-brand/20 text-brand font-bold border border-brand/40'
                          : 'bg-surface-card text-txt-muted hover:text-txt-primary border border-surface-border'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Page Buttons */}
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setClosedPage(1)}
                  disabled={safeClosedPage <= 1}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-card border border-surface-border text-txt-primary hover:bg-surface-elevated disabled:opacity-30 text-[11px] font-semibold"
                >
                  First
                </button>
                <button
                  type="button"
                  onClick={() => setClosedPage((p) => Math.max(1, p - 1))}
                  disabled={safeClosedPage <= 1}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-card border border-surface-border text-txt-primary hover:bg-surface-elevated disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalClosedPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalClosedPages > 5) {
                      if (safeClosedPage > 3 && safeClosedPage < totalClosedPages - 1) {
                        pageNum = safeClosedPage - 2 + i;
                      } else if (safeClosedPage >= totalClosedPages - 1) {
                        pageNum = totalClosedPages - 4 + i;
                      }
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setClosedPage(pageNum)}
                        className={`w-7 h-7 rounded-lg font-mono text-xs font-bold transition ${
                          safeClosedPage === pageNum
                            ? 'bg-brand text-surface-base'
                            : 'bg-surface-card text-txt-muted hover:text-txt-primary border border-surface-border'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setClosedPage((p) => Math.min(totalClosedPages, p + 1))}
                  disabled={safeClosedPage >= totalClosedPages}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-card border border-surface-border text-txt-primary hover:bg-surface-elevated disabled:opacity-30"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setClosedPage(totalClosedPages)}
                  disabled={safeClosedPage >= totalClosedPages}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-card border border-surface-border text-txt-primary hover:bg-surface-elevated disabled:opacity-30 text-[11px] font-semibold"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
