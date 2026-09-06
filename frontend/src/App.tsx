import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard/Dashboard';
import { PrebuiltStrategyPanel } from './components/PrebuiltStrategy/PrebuiltStrategyPanel';
import { BrokerList } from './components/BrokerPanel/BrokerList';
import { Login } from './components/Auth/Login';
import { api } from './services/api';
import { socketService } from './services/socket';
import { authStore } from './services/auth';
import type { BrokerAccount, Strategy, TradeLog, TickerSummary } from './types';

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'strategy' | 'brokers'>('dashboard');
  const [brokers, setBrokers] = useState<BrokerAccount[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [activeStrategyId, setActiveStrategyId] = useState<string>('');
  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([]);
  const [btcTicker, setBtcTicker] = useState<TickerSummary | undefined>();
  const [ethTicker, setEthTicker] = useState<TickerSummary | undefined>();
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [indicatorStatus, setIndicatorStatus] = useState<{ trend: string; value: number; lastChecked: string } | null>(null);

  const activeStrategy = strategies.find((s) => s.id === activeStrategyId) || strategies[0] || null;

  const loadData = async () => {
    try {
      const [fetchedBrokers, fetchedStrategies, fetchedLogs, fetchedTickers] = await Promise.all([
        api.getBrokers(),
        api.getStrategies(),
        api.getLogs(),
        api.getTickers(),
      ]);
      setBrokers(fetchedBrokers);
      setStrategies(fetchedStrategies);
      if (fetchedStrategies.length > 0) {
        setActiveStrategyId((prev) => {
          if (prev && fetchedStrategies.some((s) => s.id === prev)) return prev;
          return fetchedStrategies[0].id;
        });
      }
      setTradeLogs(fetchedLogs);
      if (fetchedTickers['BTC']) setBtcTicker(fetchedTickers['BTC']);
      if (fetchedTickers['ETH']) setEthTicker(fetchedTickers['ETH']);
    } catch (err) {
      console.error('Failed to load initial data', err);
    }
  };

  useEffect(() => {
    loadData();

    // WebSocket connection
    const socket = socketService.connect();

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('market-tickers', (tickers: Record<string, TickerSummary>) => {
      if (tickers['BTC']) setBtcTicker(tickers['BTC']);
      if (tickers['ETH']) setEthTicker(tickers['ETH']);
    });

    socket.on('price-update', (data: { symbol: string; price: number; markPrice: number }) => {
      if (data.symbol === 'BTCUSD' || data.symbol === 'BTC') {
        setBtcTicker((prev) => prev ? { ...prev, markPrice: data.markPrice, lastPrice: data.price } : undefined);
      }
      if (data.symbol === 'ETHUSD' || data.symbol === 'ETH') {
        setEthTicker((prev) => prev ? { ...prev, markPrice: data.markPrice, lastPrice: data.price } : undefined);
      }
    });

    socket.on('strategy-update', (updatedStrategy: Strategy) => {
      setStrategies((prev) => {
        const idx = prev.findIndex((s) => s.id === updatedStrategy.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedStrategy;
          return next;
        }
        return [...prev, updatedStrategy];
      });
    });

    socket.on('trade-log', (newLog: TradeLog) => {
      setTradeLogs((prev) => [newLog, ...prev]);
    });

    socket.on('indicator-status', (data: { strategyId: string; trend: string; value: number; lastChecked: string }) => {
      setIndicatorStatus(data);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('market-tickers');
      socket.off('price-update');
      socket.off('strategy-update');
      socket.off('trade-log');
      socket.off('indicator-status');
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0c0e12] text-[#f7f7f7] flex flex-col font-sans selection:bg-[#9de600]/20 selection:text-[#9de600]">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        btcTicker={btcTicker}
        ethTicker={ethTicker}
        isConnected={isConnected}
        onLogout={onLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <Dashboard
            strategy={activeStrategy}
            strategies={strategies}
            activeStrategyId={activeStrategy?.id || ''}
            onSelectStrategy={(id) => setActiveStrategyId(id)}
            brokers={brokers}
            btcTicker={btcTicker}
            ethTicker={ethTicker}
            btcPrice={btcTicker?.markPrice || 0}
            indicatorStatus={indicatorStatus}
            tradeLogs={tradeLogs}
            onRefresh={loadData}
            onEditStrategy={() => setActiveTab('strategy')}
          />
        )}

        {activeTab === 'strategy' && (
          <PrebuiltStrategyPanel
            brokers={brokers}
            strategy={activeStrategy}
            strategies={strategies}
            activeStrategyId={activeStrategy?.id || ''}
            onSelectStrategy={(id) => setActiveStrategyId(id)}
            btcTicker={btcTicker}
            ethTicker={ethTicker}
            indicatorStatus={indicatorStatus}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'brokers' && (
          <BrokerList brokers={brokers} onRefresh={loadData} />
        )}
      </main>

      <footer className="border-t border-[#22262f] py-6 text-center text-xs text-[#85888e] bg-[#0c0e12]">
        <div className="flex items-center justify-center space-x-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#9de600] animate-pulse"></span>
          <span>TradePulse PRO • Institutional Algorithmic Engine • Delta Multi-Broker Platform</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  // Presence of a token is treated as "authenticated" optimistically - an expired/invalid token
  // still gets past this check, but the first API call then 401s, api.ts clears it, and the page
  // reloads back to the login screen. There is no separate "verify on boot" round trip.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!authStore.getToken());

  const handleLogout = () => {
    authStore.clearToken();
    socketService.disconnect();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onSuccess={() => setIsAuthenticated(true)} />;
  }

  return <AuthenticatedApp onLogout={handleLogout} />;
}
