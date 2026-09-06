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
          <h2 className="text-2xl font-bold text-[#f7f7f7] tracking-tight">Execution Trade Logs</h2>
          <p className="text-sm text-[#85888e] mt-1">
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

      <div className="mirror-card rounded-2xl overflow-hidden shadow-sm relative">
        <div className="stat-hover-line" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0c0e12] text-[#85888e] border-b border-[#22262f] uppercase tracking-wider font-semibold text-[11px]">
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
            <tbody className="divide-y divide-[#22262f] font-mono">
              {logs.map((log) => {
                const isBuy = log.action.includes('BUY');
                const isSquareOff = log.action.includes('SQUARE_OFF');
                const isRoll = log.action.includes('ROLL');

                return (
                  <tr key={log.id} className="hover:bg-[#0c0e12]/60 transition">
                    <td className="px-5 py-3.5 text-[#85888e] font-sans">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                          isSquareOff
                            ? 'bg-[#f04438]/10 text-[#f04438] border border-[#f04438]/20'
                            : isRoll
                            ? 'bg-[#b692f6]/10 text-[#d6bbfb] border border-[#b692f6]/20'
                            : isBuy
                            ? 'bg-[#9de600]/10 text-[#9de600] border border-[#9de600]/20'
                            : 'bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20'
                        }`}
                      >
                        {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{log.action}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-white">{log.symbol}</td>
                    <td className="px-5 py-3.5 text-[#cecfd2]">${log.price.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-[#85888e]">{log.quantity}</td>
                    <td className="px-5 py-3.5 text-[#85888e] font-sans uppercase text-[10px]">
                      {log.brokerType}
                    </td>
                    <td className="px-5 py-3.5 text-[#85888e] font-sans text-xs max-w-xs truncate" title={log.details}>
                      {log.details || '---'}
                    </td>
                  </tr>
                );
              })}

              {logs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-[#85888e] font-sans">
                    <Terminal className="w-8 h-8 text-[#85888e]/40 mx-auto mb-2" />
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
