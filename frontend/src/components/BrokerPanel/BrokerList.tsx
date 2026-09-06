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
          <h2 className="text-2xl font-bold text-txt-primary tracking-tight">Connected Broker Accounts</h2>
          <p className="text-sm text-txt-muted mt-1">
            Manage exchange API keys, paper trading simulators, and verify connections.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-mirror-primary inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-bold transition"
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
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    {broker.brokerType.startsWith('delta-') ? (
                      <div className="w-10 h-10 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center p-2 shadow-sm shrink-0">
                        <DeltaLogo
                          variant="icon"
                          className="w-6 h-6"
                          type={broker.brokerType === 'delta-global' ? 'global' : 'india'}
                          withGlow
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-surface-base border border-surface-border flex items-center justify-center text-txt-primary shrink-0">
                        <ShieldCheck className="w-5 h-5 text-brand" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-surface-base text-txt-secondary border border-surface-border">
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
                      <h3 className="text-lg font-bold text-txt-primary mt-1">{broker.name}</h3>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                      isSuccess
                        ? 'bg-brand/10 text-brand border-brand/30'
                        : isFailed
                        ? 'bg-danger/10 text-danger border-danger/30'
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
                <div className="mt-4 space-y-2 text-xs text-txt-muted">
                  <div className="flex items-center justify-between py-1 border-b border-surface-border font-mono">
                    <span>API Key:</span>
                    <span className="text-txt-secondary">{broker.maskedApiKey}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-surface-border">
                    <span>Environment:</span>
                    <span className="text-txt-secondary">{broker.isTestnet ? 'Testnet / Demo' : 'Production (Live)'}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="flex items-center space-x-1">
                      <Wallet className="w-3.5 h-3.5 text-brand" />
                      <span>Wallet Balance:</span>
                    </span>
                    <span className="text-brand font-mono font-bold text-sm">
                      ${broker.balanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {broker.lastTestMessage && (
                  <div
                    className={`mt-3 p-2.5 rounded-xl text-xs leading-relaxed border ${
                      isFailed
                        ? 'bg-danger/10 border-danger/25 text-[#fda29b]'
                        : isSuccess
                        ? 'bg-brand/10 border-brand/25 text-brand'
                        : 'bg-surface-base border-surface-border text-txt-muted'
                    }`}
                  >
                    <div className="font-semibold mb-0.5 flex items-center space-x-1">
                      {isFailed && <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />}
                      {isSuccess && <CheckCircle className="w-3.5 h-3.5 text-brand shrink-0" />}
                      <span>{isFailed ? 'Connection Issue' : isSuccess ? 'Connection Verified' : 'Status'}</span>
                    </div>
                    <div className="text-[11px] break-words">{broker.lastTestMessage}</div>
                  </div>
                )}
              </div>

              {/* Card Actions */}
              <div className="mt-5 pt-3 border-t border-surface-border flex items-center justify-between">
                <button
                  onClick={() => handleTest(broker.id)}
                  disabled={testingId === broker.id}
                  className="text-xs font-bold text-brand hover:text-[#a6f900] transition flex items-center space-x-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingId === broker.id ? 'animate-spin' : ''}`} />
                  <span>Test Connection</span>
                </button>

                <button
                  onClick={() => handleDelete(broker.id, broker.name)}
                  className="text-txt-muted hover:text-danger transition p-1"
                  title="Delete broker account"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {brokers.length === 0 && (
          <div className="col-span-full py-12 text-center bg-surface-card border border-surface-border rounded-2xl">
            <div className="flex justify-center mb-3">
              <DeltaLogo variant="icon" className="w-12 h-12" withGlow />
            </div>
            <p className="text-txt-secondary font-semibold text-base">No broker accounts connected yet.</p>
            <p className="text-xs text-txt-muted mt-1">Connect your Delta Exchange India or Global API key to start automated trading.</p>
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
