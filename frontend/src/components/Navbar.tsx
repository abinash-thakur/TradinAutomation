import { Activity, LogOut, ShieldCheck, SlidersHorizontal, Zap } from 'lucide-react';
import type { TickerSummary } from '../types';
import { DeltaLogo } from './Common/DeltaLogo';

interface NavbarProps {
  activeTab: 'dashboard' | 'strategy' | 'brokers';
  setActiveTab: (tab: 'dashboard' | 'strategy' | 'brokers') => void;
  btcTicker?: TickerSummary;
  ethTicker?: TickerSummary;
  isConnected: boolean;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  btcTicker,
  ethTicker,
  isConnected,
  onLogout,
}) => {
  const btcPrice = btcTicker?.markPrice || 0;
  const ethPrice = ethTicker?.markPrice || 0;

  return (
    <>
      {/* Live Crypto Marquee */}
      <div className="bg-[#08090b] border-b border-[#22262f] py-1 px-4 overflow-hidden select-none text-[11px] font-mono flex items-center justify-between text-[#85888e]">
        <div className="flex items-center space-x-2 shrink-0 pr-4 border-r border-[#22262f]">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9de600] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9de600]"></span>
          </span>
          <span className="text-[#9de600] font-bold tracking-wider text-[10px] uppercase">LIVE PULSE</span>
        </div>

        <div className="flex-1 overflow-hidden relative ml-4">
          <div className="flex space-x-8 items-center animate-marquee whitespace-nowrap">
            {/* BTC */}
            <div className="inline-flex items-center space-x-2">
              <span className="text-white font-semibold">BTC/USD</span>
              <span className="text-[#cecfd2] font-bold">
                ${btcPrice > 0 ? btcPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '91,240.0'}
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                (btcTicker?.change24h || 2.4) >= 0
                  ? 'bg-[#9de600]/15 text-[#9de600] border border-[#9de600]/30'
                  : 'bg-[#f04438]/15 text-[#f04438] border border-[#f04438]/30'
              }`}>
                {(btcTicker?.change24h || 2.4) >= 0 ? '+' : ''}{(btcTicker?.change24h || 2.4).toFixed(1)}%
              </span>
            </div>

            {/* ETH */}
            <div className="inline-flex items-center space-x-2">
              <span className="text-white font-semibold">ETH/USD</span>
              <span className="text-[#cecfd2] font-bold">
                ${ethPrice > 0 ? ethPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '2,480.5'}
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                (ethTicker?.change24h || 1.8) >= 0
                  ? 'bg-[#9de600]/15 text-[#9de600] border border-[#9de600]/30'
                  : 'bg-[#f04438]/15 text-[#f04438] border border-[#f04438]/30'
              }`}>
                {(ethTicker?.change24h || 1.8) >= 0 ? '+' : ''}{(ethTicker?.change24h || 1.8).toFixed(1)}%
              </span>
            </div>

            {/* SOL */}
            <div className="inline-flex items-center space-x-2">
              <span className="text-white font-semibold">SOL/USD</span>
              <span className="text-[#cecfd2] font-bold">$142.30</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#9de600]/15 text-[#9de600] border border-[#9de600]/30">+4.5%</span>
            </div>

            {/* XRP */}
            <div className="inline-flex items-center space-x-2">
              <span className="text-white font-semibold">XRP/USD</span>
              <span className="text-[#cecfd2] font-bold">$1.48</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#9de600]/15 text-[#9de600] border border-[#9de600]/30">+1.2%</span>
            </div>

            {/* REPEAT FOR SMOOTH LOOP */}
            <div className="inline-flex items-center space-x-2">
              <span className="text-white font-semibold">BTC/USD</span>
              <span className="text-[#cecfd2] font-bold">
                ${btcPrice > 0 ? btcPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '91,240.0'}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#9de600]/15 text-[#9de600] border border-[#9de600]/30">+2.4%</span>
            </div>

            <div className="inline-flex items-center space-x-2">
              <span className="text-white font-semibold">ETH/USD</span>
              <span className="text-[#cecfd2] font-bold">
                ${ethPrice > 0 ? ethPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '2,480.5'}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#9de600]/15 text-[#9de600] border border-[#9de600]/30">+1.8%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="border-b border-[#22262f] bg-[#0c0e12]/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            {/* Brand Logo */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
              <div className="w-9 h-9 rounded-xl bg-[#9de600] flex items-center justify-center shadow-[0_0_15px_rgba(157,230,0,0.3)] text-[#0c0e12]">
                <Zap className="w-5 h-5 fill-[#0c0e12] stroke-[#0c0e12]" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-lg font-extrabold text-white tracking-tight">
                    Trade<span className="text-[#9de600]">Pulse</span>
                  </span>
                  <span className="hidden sm:inline-block px-2 py-0.5 text-[9px] font-extrabold bg-[#9de600]/15 text-[#9de600] border border-[#9de600]/30 rounded-full tracking-wider uppercase">
                    PRO ENGINE
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation tabs - 3 Focused Tabs */}
            <nav className="flex space-x-1 pl-4 h-16 items-center">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`relative h-16 px-4 text-sm font-medium transition-all flex items-center space-x-2 ${
                  activeTab === 'dashboard'
                    ? 'text-white font-semibold after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-[#9de600] after:shadow-[0_0_10px_#9de600]'
                    : 'text-[#cecfd2] hover:text-white'
                }`}
              >
                <Activity className={`w-4 h-4 ${activeTab === 'dashboard' ? 'text-[#9de600]' : 'text-[#85888e]'}`} />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setActiveTab('strategy')}
                className={`relative h-16 px-4 text-sm font-medium transition-all flex items-center space-x-2 ${
                  activeTab === 'strategy'
                    ? 'text-white font-semibold after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-[#9de600] after:shadow-[0_0_10px_#9de600]'
                    : 'text-[#cecfd2] hover:text-white'
                }`}
              >
                <SlidersHorizontal className={`w-4 h-4 ${activeTab === 'strategy' ? 'text-[#9de600]' : 'text-[#85888e]'}`} />
                <span>Strategy Settings</span>
              </button>

              <button
                onClick={() => setActiveTab('brokers')}
                className={`relative h-16 px-4 text-sm font-medium transition-all flex items-center space-x-2 ${
                  activeTab === 'brokers'
                    ? 'text-white font-semibold after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-[#9de600] after:shadow-[0_0_10px_#9de600]'
                    : 'text-[#cecfd2] hover:text-white'
                }`}
              >
                <ShieldCheck className={`w-4 h-4 ${activeTab === 'brokers' ? 'text-[#9de600]' : 'text-[#85888e]'}`} />
                <span>Broker Accounts</span>
              </button>
            </nav>
          </div>

          {/* Right Info: Live Delta Exchange Connection & Status */}
          <div className="flex items-center space-x-3">
            {/* Delta Exchange Brand Badge */}
            <div className="hidden sm:flex items-center space-x-2 bg-[#13161b] border border-[#22262f] px-3 py-1.5 rounded-xl shadow-sm">
              <DeltaLogo variant="icon" className="w-4 h-4" withGlow={isConnected} />
              <span className="text-xs font-bold text-white tracking-tight">Delta Exchange</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-[#FF9300]/15 text-[#FF9300] border border-[#FF9300]/30">
                PRO
              </span>
            </div>

            {/* Live Status Pill */}
            <div className="flex items-center space-x-2 bg-[#13161b] border border-[#22262f] px-3 py-1.5 rounded-xl">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  isConnected ? 'bg-[#9de600] animate-pulse shadow-[0_0_8px_#9de600]' : 'bg-[#f04438]'
                }`}
              />
              <span className="text-xs font-semibold text-[#f7f7f7]">
                {isConnected ? 'Exchange Live' : 'Connecting...'}
              </span>
            </div>

            {/* Logout */}
            <button
              onClick={onLogout}
              title="Sign out"
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#13161b] border border-[#22262f] text-[#85888e] hover:text-[#f04438] hover:border-[#f04438]/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
    </>
  );
};
