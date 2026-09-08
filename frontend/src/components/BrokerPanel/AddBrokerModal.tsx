import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, RefreshCw, Key, Shield } from 'lucide-react';
import type { BrokerType } from '../../types';
import { api } from '../../services/api';
import { DeltaLogo } from '../Common/DeltaLogo';

interface AddBrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddBrokerModal: React.FC<AddBrokerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [brokerType, setBrokerType] = useState<BrokerType>('delta-india');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isTestnet, setIsTestnet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ipInfo, setIpInfo] = useState<{ ipv4?: string; ipv6?: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; balance?: number } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      api.getIpInfo().then(setIpInfo).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTestResult(null);
    try {
      const acc = await api.createBroker({
        name: name.trim() || `${brokerType.toUpperCase()} Account`,
        brokerType,
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        passphrase: passphrase.trim(),
        isTestnet,
      });

      if (acc.lastTestStatus === 'FAILED') {
        setTestResult({
          success: false,
          message: acc.lastTestMessage || 'Connection failed. Check credentials or IP whitelist.',
        });
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || err.message || 'Failed to connect broker',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="mirror-card rounded-2xl w-full max-w-lg overflow-hidden shadow-card relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {brokerType.startsWith('delta-') ? (
              <DeltaLogo
                variant="icon"
                className="w-6 h-6"
                type={brokerType === 'delta-global' ? 'global' : 'india'}
                withGlow
              />
            ) : (
              <Shield className="w-5 h-5 text-brand" />
            )}
            <div>
              <h3 className="text-lg font-bold text-txt-primary">
                {brokerType.startsWith('delta-')
                  ? brokerType === 'delta-india'
                    ? 'Connect Delta Exchange India'
                    : 'Connect Delta Exchange Global'
                  : 'Connect Broker Account'}
              </h3>
              <p className="text-[11px] text-txt-muted">
                {brokerType.startsWith('delta-')
                  ? 'Official Delta Exchange API & WebSocket Integration'
                  : 'Configure API credentials'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-txt-muted hover:text-txt-primary transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
              Broker / Exchange Type
            </label>
            <select
              value={brokerType}
              onChange={(e) => setBrokerType(e.target.value as BrokerType)}
              className="w-full bg-surface-base border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-txt-primary focus:outline-none focus:border-brand transition"
            >
              <option value="delta-india">Delta Exchange India (api.india.delta.exchange)</option>
              <option value="delta-global">Delta Exchange Global (api.delta.exchange)</option>
              <option value="binance">Binance (Crypto Futures/Spot)</option>
              <option value="bybit">Bybit (Crypto Futures/Options)</option>
              <option value="deribit">Deribit (BTC Options & Futures)</option>
            </select>
          </div>

          {brokerType.startsWith('delta-') && (
            <div className="bg-surface-base border border-surface-border rounded-xl p-3.5 text-xs text-txt-secondary space-y-2">
              <div className="flex items-center space-x-2 font-semibold text-txt-primary">
                <DeltaLogo
                  variant="icon"
                  className="w-4 h-4 shrink-0"
                  type={brokerType === 'delta-global' ? 'global' : 'india'}
                />
                <span>Delta Exchange IP Whitelisting</span>
              </div>
              <p className="text-txt-muted leading-relaxed">
                If IP restriction is enabled for your Delta API Key, requests from your system originate from:
              </p>
              <div className="font-mono text-[11px] bg-surface-card p-2 rounded-lg border border-surface-border text-brand space-y-0.5 select-all">
                {ipInfo?.ipv4 && <div>IPv4: {ipInfo.ipv4}</div>}
                {ipInfo?.ipv6 && <div>IPv6: {ipInfo.ipv6}</div>}
                {!ipInfo && <div className="text-txt-muted">Detecting server outbound IP...</div>}
              </div>
              <p className="text-[11px] text-txt-muted">
                💡 Log into <strong className="text-txt-primary">Delta Exchange &gt; API Management</strong> and either add the IP above to your whitelist or leave the IP whitelist field blank.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
              Account Label / Name
            </label>
            <input
              type="text"
              placeholder="e.g. My Delta India Main, Alpha Sandbox"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-base border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-txt-primary focus:outline-none focus:border-brand transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
              API Key
            </label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3.5 top-3 text-txt-muted" />
              <input
                type="text"
                placeholder="Enter API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                className="w-full bg-surface-base border border-surface-border rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-txt-primary focus:outline-none focus:border-brand font-mono transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
              API Secret (Encrypted with AES-256)
            </label>
            <input
              type="password"
              placeholder="Enter API Secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              required
              className="w-full bg-surface-base border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-txt-primary focus:outline-none focus:border-brand font-mono transition"
            />
          </div>

          {(brokerType === 'bybit' || brokerType === 'deribit') && (
            <div>
              <label className="block text-xs font-bold text-txt-secondary uppercase tracking-wider mb-1.5">
                Passphrase (Optional)
              </label>
              <input
                type="password"
                placeholder="Enter API Passphrase if required"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full bg-surface-base border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-txt-primary focus:outline-none focus:border-brand font-mono transition"
              />
            </div>
          )}

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="testnet"
              checked={isTestnet}
              onChange={(e) => setIsTestnet(e.target.checked)}
              className="rounded border-surface-border text-brand focus:ring-brand bg-surface-base"
            />
            <label htmlFor="testnet" className="text-xs text-txt-secondary select-none cursor-pointer">
              Connect to Testnet / Sandbox mode
            </label>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                testResult.success
                  ? 'bg-brand/10 border-brand/30 text-brand'
                  : 'bg-danger/10 border-danger/30 text-[#fda29b]'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-brand" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-danger" />
              )}
              <div>
                <p className="font-semibold">{testResult.message}</p>
                {testResult.balance !== undefined && (
                  <p className="mt-0.5 text-txt-secondary font-mono">
                    Wallet Balance: ${testResult.balance.toFixed(2)} USD
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-surface-border">
            <button
              type="button"
              onClick={onClose}
              className="btn-mirror-secondary px-4 py-2 rounded-xl text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-mirror-primary px-5 py-2 rounded-xl text-sm font-bold transition flex items-center space-x-1.5"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-surface-base" />}
              <span>Save & Verify Connection</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
