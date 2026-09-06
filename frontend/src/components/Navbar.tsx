import { Activity, ShieldCheck, SlidersHorizontal, LogOut, Zap } from 'lucide-react';
import type { TickerSummary } from '../types';

interface NavbarProps {
  activeTab: 'dashboard' | 'strategy' | 'brokers';
  setActiveTab: (tab: 'dashboard' | 'strategy' | 'brokers') => void;
  btcTicker?: TickerSummary;
  ethTicker?: TickerSummary;
  isConnected: boolean;
  onLogout: () => void;
}

const tabs = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: Activity },
  { id: 'strategy' as const, label: 'Strategy Settings', icon: SlidersHorizontal },
  { id: 'brokers' as const, label: 'Broker Accounts', icon: ShieldCheck },
];

function PricePill({ label, ticker }: { label: string; ticker?: TickerSummary }) {
  const price = ticker?.markPrice || 0;
  const change = ticker?.change24h ?? 0;
  const isUp = change >= 0;
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono">
      <span className="text-txt-dim">{label}</span>
      <span className="text-txt-primary font-semibold">
        {price > 0 ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 1 })}` : '—'}
      </span>
      {ticker && (
        <span className={isUp ? 'text-brand' : 'text-danger'}>
          {isUp ? '+' : ''}{change.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  btcTicker,
  ethTicker,
  isConnected,
  onLogout,
}) => {
  return (
    <header className="border-b border-surface-border bg-surface-base/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          {/* Brand */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-surface-base">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <span className="text-base font-bold text-txt-primary tracking-tight">
              Trade<span className="text-brand">Pulse</span>
            </span>
          </button>

          {/* Tabs */}
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'text-txt-primary bg-surface-elevated'
                    : 'text-txt-muted hover:text-txt-primary'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Right: live prices + status + logout */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden lg:flex items-center gap-4">
            <PricePill label="BTC" ticker={btcTicker} />
            <PricePill label="ETH" ticker={ethTicker} />
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-brand' : 'bg-txt-dim'}`} />
            <span className="hidden sm:inline text-xs text-txt-muted">
              {isConnected ? 'Live' : 'Connecting'}
            </span>
          </div>

          <button
            onClick={onLogout}
            title="Sign out"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-txt-muted hover:text-danger hover:bg-surface-elevated transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs row for small screens */}
      <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === id
                ? 'text-txt-primary bg-surface-elevated'
                : 'text-txt-muted'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
};
