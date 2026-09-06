import React, { useState } from 'react';
import { Plus, RefreshCw, Trash2, CheckCircle, XCircle, Clock, ShieldCheck, Wallet } from 'lucide-react';
import type { BrokerAccount } from '../../types';
import { api } from '../../services/api';
import { AddBrokerModal } from './AddBrokerModal';
import { DeltaLogo } from '../Common/DeltaLogo';

interface BrokerListProps {
  brokers: BrokerAccount[];
  onRefresh: () => void;
}

export const BrokerList: React.FC<BrokerListProps> = ({ brokers, onRefresh }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await api.testBroker(id);
      alert(res.message);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove broker account "${name}"?`)) {
      await api.deleteBroker(id);
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#f7f7f7] tracking-tight">Connected Broker Accounts</h2>
          <p className="text-sm text-[#85888e] mt-1">
            Manage exchange API keys, paper trading simulators, and verify connections.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-mirror-primary inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-[#9de600]/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add Broker Account</span>
        </button>
      </div>

      {/* Grid of Accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {brokers.map((broker) => {
          const isSuccess = broker.lastTestStatus === 'SUCCESS';
          const isFailed = broker.lastTestStatus === 'FAILED';

          return (
            <div
              key={broker.id}
              className="mirror-card relative p-5 flex flex-col justify-between group overflow-hidden"
            >
              <div className="stat-hover-line" />
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    {broker.brokerType.startsWith('delta-') ? (
                      <div className="w-10 h-10 rounded-xl bg-[#0c0e12] border border-[#22262f] flex items-center justify-center p-2 shadow-sm shrink-0">
                        <DeltaLogo
                          variant="icon"
                          className="w-6 h-6"
                          type={broker.brokerType === 'delta-global' ? 'global' : 'india'}
                          withGlow
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-[#0c0e12] border border-[#22262f] flex items-center justify-center text-white shrink-0">
                        <ShieldCheck className="w-5 h-5 text-[#9de600]" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-[#0c0e12] text-[#cecfd2] border border-[#22262f]">
                          {broker.brokerType === 'delta-india'
                            ? 'Delta India'
                            : broker.brokerType === 'delta-global'
                            ? 'Delta Global'
                            : broker.brokerType}
                        </span>
                        {broker.brokerType.startsWith('delta-') && (
                          <span className="text-[9px] font-bold text-[#FF9300] bg-[#FF9300]/10 border border-[#FF9300]/30 px-1.5 py-0.2 rounded font-mono">
                            OFFICIAL
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-[#f7f7f7] mt-1">{broker.name}</h3>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                      isSuccess
                        ? 'bg-[#9de600]/10 text-[#9de600] border-[#9de600]/30'
                        : isFailed
                        ? 'bg-[#f04438]/10 text-[#f04438] border-[#f04438]/30'
                        : 'bg-[#f79009]/10 text-[#fec84b] border-[#f79009]/30'
                    }`}
                  >
                    {isSuccess && <CheckCircle className="w-3.5 h-3.5" />}
                    {isFailed && <XCircle className="w-3.5 h-3.5" />}
                    {!isSuccess && !isFailed && <Clock className="w-3.5 h-3.5" />}
                    <span>{broker.lastTestStatus || 'UNKNOWN'}</span>
                  </span>
                </div>

                {/* Details */}
                <div className="mt-4 space-y-2 text-xs text-[#85888e]">
                  <div className="flex items-center justify-between py-1 border-b border-[#22262f] font-mono">
                    <span>API Key:</span>
                    <span className="text-[#cecfd2]">{broker.maskedApiKey}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-[#22262f]">
                    <span>Environment:</span>
                    <span className="text-[#cecfd2]">{broker.isTestnet ? 'Testnet / Demo' : 'Production (Live)'}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="flex items-center space-x-1">
                      <Wallet className="w-3.5 h-3.5 text-[#9de600]" />
                      <span>Wallet Balance:</span>
                    </span>
                    <span className="text-[#9de600] font-mono font-bold text-sm">
                      ${broker.balanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {broker.lastTestMessage && (
                  <div
                    className={`mt-3 p-2.5 rounded-xl text-xs leading-relaxed border ${
                      isFailed
                        ? 'bg-[#f04438]/10 border-[#f04438]/25 text-[#fda29b]'
                        : isSuccess
                        ? 'bg-[#9de600]/10 border-[#9de600]/25 text-[#9de600]'
                        : 'bg-[#0c0e12] border-[#22262f] text-[#85888e]'
                    }`}
                  >
                    <div className="font-semibold mb-0.5 flex items-center space-x-1">
                      {isFailed && <XCircle className="w-3.5 h-3.5 text-[#f04438] shrink-0" />}
                      {isSuccess && <CheckCircle className="w-3.5 h-3.5 text-[#9de600] shrink-0" />}
                      <span>{isFailed ? 'Connection Issue' : isSuccess ? 'Connection Verified' : 'Status'}</span>
                    </div>
                    <div className="text-[11px] break-words">{broker.lastTestMessage}</div>
                  </div>
                )}
              </div>

              {/* Card Actions */}
              <div className="mt-5 pt-3 border-t border-[#22262f] flex items-center justify-between">
                <button
                  onClick={() => handleTest(broker.id)}
                  disabled={testingId === broker.id}
                  className="text-xs font-bold text-[#9de600] hover:text-[#a6f900] transition flex items-center space-x-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingId === broker.id ? 'animate-spin' : ''}`} />
                  <span>Test Connection</span>
                </button>

                <button
                  onClick={() => handleDelete(broker.id, broker.name)}
                  className="text-[#85888e] hover:text-[#f04438] transition p-1"
                  title="Delete broker account"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {brokers.length === 0 && (
          <div className="col-span-full py-12 text-center bg-[#13161b] border border-[#22262f] rounded-2xl">
            <div className="flex justify-center mb-3">
              <DeltaLogo variant="icon" className="w-12 h-12" withGlow />
            </div>
            <p className="text-[#cecfd2] font-semibold text-base">No broker accounts connected yet.</p>
            <p className="text-xs text-[#85888e] mt-1">Connect your Delta Exchange India or Global API key to start automated trading.</p>
          </div>
        )}
      </div>

      <AddBrokerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={onRefresh}
      />
    </div>
  );
};
