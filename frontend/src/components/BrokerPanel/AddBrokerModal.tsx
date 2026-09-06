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
      <div className="mirror-card rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative">
        <div className="stat-hover-line" />
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#22262f] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {brokerType.startsWith('delta-') ? (
              <DeltaLogo
                variant="icon"
                className="w-6 h-6"
                type={brokerType === 'delta-global' ? 'global' : 'india'}
                withGlow
              />
            ) : (
              <Shield className="w-5 h-5 text-[#9de600]" />
            )}
            <div>
              <h3 className="text-lg font-bold text-[#f7f7f7]">
                {brokerType.startsWith('delta-')
                  ? brokerType === 'delta-india'
                    ? 'Connect Delta Exchange India'
                    : 'Connect Delta Exchange Global'
                  : 'Connect Broker Account'}
              </h3>
              <p className="text-[11px] text-[#85888e]">
                {brokerType.startsWith('delta-')
                  ? 'Official Delta Exchange API & WebSocket Integration'
                  : 'Configure API credentials'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#85888e] hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#cecfd2] uppercase tracking-wider mb-1.5">
              Broker / Exchange Type
            </label>
            <select
              value={brokerType}
              onChange={(e) => setBrokerType(e.target.value as BrokerType)}
              className="w-full bg-[#0c0e12] border border-[#22262f] rounded-xl px-3.5 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#9de600] transition"
            >
              <option value="delta-india">Delta Exchange India (api.india.delta.exchange)</option>
              <option value="delta-global">Delta Exchange Global (api.delta.exchange)</option>
              <option value="paper">Paper Trading Simulator (Zero Capital Risk)</option>
              <option value="binance">Binance (Crypto Futures/Spot)</option>
              <option value="bybit">Bybit (Crypto Futures/Options)</option>
              <option value="deribit">Deribit (BTC Options & Futures)</option>
            </select>
          </div>

          {brokerType.startsWith('delta-') && (
            <div className="bg-[#0c0e12] border border-[#22262f] rounded-xl p-3.5 text-xs text-[#cecfd2] space-y-2">
              <div className="flex items-center space-x-2 font-semibold text-[#f7f7f7]">
                <DeltaLogo
                  variant="icon"
                  className="w-4 h-4 shrink-0"
                  type={brokerType === 'delta-global' ? 'global' : 'india'}
                />
                <span>Delta Exchange IP Whitelisting</span>
              </div>
              <p className="text-[#85888e] leading-relaxed">
                If IP restriction is enabled for your Delta API Key, requests from your system originate from:
              </p>
              <div className="font-mono text-[11px] bg-[#13161b] p-2 rounded-lg border border-[#22262f] text-[#9de600] space-y-0.5 select-all">
                {ipInfo?.ipv4 && <div>IPv4: {ipInfo.ipv4}</div>}
                {ipInfo?.ipv6 && <div>IPv6: {ipInfo.ipv6}</div>}
                {!ipInfo && <div className="text-[#85888e]">Detecting server outbound IP...</div>}
              </div>
              <p className="text-[11px] text-[#85888e]">
                💡 Log into <strong className="text-white">Delta Exchange &gt; API Management</strong> and either add the IP above to your whitelist or leave the IP whitelist field blank.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#cecfd2] uppercase tracking-wider mb-1.5">
              Account Label / Name
            </label>
            <input
              type="text"
              placeholder="e.g. My Delta India Main, Alpha Sandbox"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0c0e12] border border-[#22262f] rounded-xl px-3.5 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#9de600] transition"
            />
          </div>

          {brokerType !== 'paper' && (
            <>
              <div>
                <label className="block text-xs font-bold text-[#cecfd2] uppercase tracking-wider mb-1.5">
                  API Key
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3.5 top-3 text-[#85888e]" />
                  <input
                    type="text"
                    placeholder="Enter API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required
                    className="w-full bg-[#0c0e12] border border-[#22262f] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#9de600] font-mono transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#cecfd2] uppercase tracking-wider mb-1.5">
                  API Secret (Encrypted with AES-256)
                </label>
                <input
                  type="password"
                  placeholder="Enter API Secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  required
                  className="w-full bg-[#0c0e12] border border-[#22262f] rounded-xl px-3.5 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#9de600] font-mono transition"
                />
              </div>

              {(brokerType === 'bybit' || brokerType === 'deribit') && (
                <div>
                  <label className="block text-xs font-bold text-[#cecfd2] uppercase tracking-wider mb-1.5">
                    Passphrase (Optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Enter API Passphrase if required"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-full bg-[#0c0e12] border border-[#22262f] rounded-xl px-3.5 py-2.5 text-sm text-[#f7f7f7] focus:outline-none focus:border-[#9de600] font-mono transition"
                  />
                </div>
              )}

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="testnet"
                  checked={isTestnet}
                  onChange={(e) => setIsTestnet(e.target.checked)}
                  className="rounded border-[#22262f] text-[#9de600] focus:ring-[#9de600] bg-[#0c0e12]"
                />
                <label htmlFor="testnet" className="text-xs text-[#cecfd2] select-none cursor-pointer">
                  Connect to Testnet / Sandbox mode
                </label>
              </div>
            </>
          )}

          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                testResult.success
                  ? 'bg-[#9de600]/10 border-[#9de600]/30 text-[#9de600]'
                  : 'bg-[#f04438]/10 border-[#f04438]/30 text-[#fda29b]'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#9de600]" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#f04438]" />
              )}
              <div>
                <p className="font-semibold">{testResult.message}</p>
                {testResult.balance !== undefined && (
                  <p className="mt-0.5 text-[#cecfd2] font-mono">
                    Wallet Balance: ${testResult.balance.toFixed(2)} USD
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[#22262f]">
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
              className="btn-mirror-primary px-5 py-2 rounded-xl text-sm font-bold shadow-lg shadow-[#9de600]/20 transition flex items-center space-x-1.5"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin text-[#0c0e12]" />}
              <span>Save & Verify Connection</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
