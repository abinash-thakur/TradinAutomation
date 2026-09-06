import React from 'react';
import { Terminal, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import type { TradeLog } from '../../types';

interface TradeLogsProps {
  logs: TradeLog[];
  onRefresh: () => void;
}

export const TradeLogs: React.FC<TradeLogsProps> = ({ logs, onRefresh }) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-txt-primary tracking-tight">Execution Trade Logs</h2>
          <p className="text-sm text-txt-muted mt-1">
            Real-time audit log of all orders, rolls, and emergency exits executed by the engine.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="btn-mirror-secondary inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Logs</span>
        </button>
      </div>

      <div className="mirror-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-base text-txt-muted border-b border-surface-border uppercase tracking-wider font-semibold text-[11px]">
              <tr>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Symbol</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Qty</th>
                <th className="px-5 py-3">Broker</th>
                <th className="px-5 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border font-mono">
              {logs.map((log) => {
                const isBuy = log.action.includes('BUY');
                const isSquareOff = log.action.includes('SQUARE_OFF');

                return (
                  <tr key={log.id} className="hover:bg-surface-base/60 transition">
                    <td className="px-5 py-3.5 text-txt-muted font-sans">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                          isSquareOff ? 'text-danger' : isBuy ? 'text-brand' : 'text-txt-secondary'
                        }`}
                      >
                        {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{log.action}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-txt-primary">{log.symbol}</td>
                    <td className="px-5 py-3.5 text-txt-secondary">${log.price.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-txt-muted">{log.quantity}</td>
                    <td className="px-5 py-3.5 text-txt-muted font-sans uppercase text-[10px]">
                      {log.brokerType}
                    </td>
                    <td className="px-5 py-3.5 text-txt-muted font-sans text-xs max-w-xs truncate" title={log.details}>
                      {log.details || '---'}
                    </td>
                  </tr>
                );
              })}

              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-txt-muted font-sans">
                    <Terminal className="w-8 h-8 text-txt-muted/40 mx-auto mb-2" />
                    <span>No trades executed yet. The engine logs every event in real-time.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
