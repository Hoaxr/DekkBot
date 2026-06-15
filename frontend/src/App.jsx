import { useState, useEffect, useRef } from 'react';
import './index.css';
import { Chart } from './components/Chart';

const API_BASE = 'http://localhost:3000/api';

function App() {
  const [status, setStatus] = useState({ isRunning: false, config: {}, positions: {} });
  const [balance, setBalance] = useState(null);
  const [trades, setTrades] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fng, setFng] = useState(null);

  // Form state
  const [symbols, setSymbols] = useState('BTC/EUR');
  const [chartSymbol, setChartSymbol] = useState('BTC/EUR');
  const [chartTimeframe, setChartTimeframe] = useState('15m');
  const [timeframe, setTimeframe] = useState('1m');
  const [strategy, setStrategy] = useState('meta_strategy');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [paperTrading, setPaperTrading] = useState(true);
  const [tradeSizeEur, setTradeSizeEur] = useState(100);
  const [takeProfitPercentage, setTakeProfitPercentage] = useState(0);
  const [trailingStopPercentage, setTrailingStopPercentage] = useState(0);
  const [dcaLevels, setDcaLevels] = useState(0);
  const [dcaDropPercentage, setDcaDropPercentage] = useState(2.0);
  const [leverage, setLeverage] = useState(1);
  const [compoundProfits, setCompoundProfits] = useState(false);
  const [useKellySizing, setUseKellySizing] = useState(false);
  const [useDynamicATR, setUseDynamicATR] = useState(true);
  const [allowShorts, setAllowShorts] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Backtest State
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [backtestResults, setBacktestResults] = useState(null);
  const [showBacktestModal, setShowBacktestModal] = useState(false);
  // Toast State
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const chartSymbolRef = useRef('BTC/EUR');
  const chartTimeframeRef = useRef('15m');
  useEffect(() => { chartSymbolRef.current = chartSymbol; }, [chartSymbol]);
  useEffect(() => { chartTimeframeRef.current = chartTimeframe; fetchChartData(); }, [chartTimeframe, chartSymbol]);

  const fetchStatus = async (updateConfigFields = false) => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data = await res.json();
      setStatus(data);
      if (data.config && updateConfigFields) {
        setSymbols(data.config.symbols || 'BTC/EUR');
        setTimeframe(data.config.timeframe);
        setStrategy(data.config.strategy);
        setPaperTrading(data.config.paperTrading !== false);
        if (data.config.apiKey && data.config.apiKey !== 'MOCK_KEY') setApiKey(data.config.apiKey);
        if (data.config.secret && data.config.secret !== 'MOCK_SECRET') setApiSecret(data.config.secret);
        if (data.config.geminiApiKey) setGeminiApiKey(data.config.geminiApiKey);
        if (data.config.tradeSizeEur !== undefined) setTradeSizeEur(data.config.tradeSizeEur);
        if (data.config.takeProfitPercentage !== undefined) setTakeProfitPercentage(data.config.takeProfitPercentage);
        if (data.config.trailingStopPercentage !== undefined) setTrailingStopPercentage(data.config.trailingStopPercentage);
        if (data.config.dcaLevels !== undefined) setDcaLevels(data.config.dcaLevels);
        if (data.config.dcaDropPercentage !== undefined) setDcaDropPercentage(data.config.dcaDropPercentage);
        if (data.config.leverage !== undefined) setLeverage(data.config.leverage);
        if (data.config.compoundProfits !== undefined) setCompoundProfits(data.config.compoundProfits);
        if (data.config.useKellySizing !== undefined) setUseKellySizing(data.config.useKellySizing);
        if (data.config.useDynamicATR !== undefined) setUseDynamicATR(data.config.useDynamicATR);
        if (data.config.allowShorts !== undefined) setAllowShorts(data.config.allowShorts);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchBalance = async () => {
    try {
      const res = await fetch(`${API_BASE}/balance`);
      const data = await res.json();
      if (data.success) setBalance(data.balance.total);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTrades = async () => {
    try {
      const res = await fetch(`${API_BASE}/trades`);
      const data = await res.json();
      if (data.success) {
        setTrades(prevTrades => {
          if (prevTrades.length > 0 && data.trades.length > 0) {
            const oldTradeIds = new Set(prevTrades.map(t => t.id));
            const newTrades = data.trades.filter(t => !oldTradeIds.has(t.id));
            
            if (newTrades.length > 0) {
              newTrades.forEach(trade => {
                 const isBuy = trade.side.toLowerCase() === 'buy';
                 addToast(`${isBuy ? '🟢 BUY' : '🔴 SELL'} Executed: ${trade.amount} ${trade.symbol} @ €${trade.price}`, isBuy ? 'success' : 'error');
              });
            }
          }
          return data.trades;
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchChartData = async () => {
    try {
      const res = await fetch(`${API_BASE}/chart-data?symbol=${encodeURIComponent(chartSymbolRef.current)}&timeframe=${encodeURIComponent(chartTimeframeRef.current)}`);
      const data = await res.json();
      if (data.success) setChartData(data.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFng = async () => {
    try {
      const res = await fetch('https://api.alternative.me/fng/');
      const data = await res.json();
      if (data && data.data && data.data.length > 0) {
        setFng(data.data[0]);
      }
    } catch (e) {
      console.error('Failed to fetch FNG', e);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchStatus(true);
      await fetchBalance();
      await fetchTrades();
      await fetchChartData();
      await fetchFng();
      setLoading(false);
    };
    init();

    const interval = setInterval(() => {
      fetchStatus(false);
      fetchBalance();
      fetchTrades();
      fetchChartData();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const toggleBot = async () => {
    const endpoint = status.isRunning ? '/stop' : '/start';
    try {
      await fetch(`${API_BASE}${endpoint}`, { method: 'POST' });
      await fetchStatus(false);
    } catch (e) {
      console.error(e);
    }
  };

  const updateConfig = async () => {
    try {
      await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, timeframe, strategy, apiKey, secret: apiSecret, geminiApiKey, paperTrading, tradeSizeEur: parseFloat(tradeSizeEur), takeProfitPercentage: parseFloat(takeProfitPercentage), trailingStopPercentage: parseFloat(trailingStopPercentage), dcaLevels: parseInt(dcaLevels), dcaDropPercentage: parseFloat(dcaDropPercentage), leverage: parseInt(leverage), compoundProfits, useKellySizing, useDynamicATR, allowShorts })
      });
      await fetchStatus(true);
      await fetchChartData();
      
      setSaveMessage('✅ Configuration applied successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
      
      addToast('✅ Configuration applied securely.', 'success');
    } catch (e) {
      console.error(e);
      setSaveMessage('❌ Failed to apply configuration');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  const runBacktest = async () => {
    setBacktestLoading(true);
    setIsOptimizing(false);
    setShowBacktestModal(true);
    setBacktestResults(null);
    try {
      // Just test the first symbol in the array for simplicity
      const testSymbol = symbols.split(',')[0].trim();
      const res = await fetch(`${API_BASE}/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: testSymbol, timeframe, strategy, tradeSizeEur: parseFloat(tradeSizeEur), takeProfitPercentage: parseFloat(takeProfitPercentage), trailingStopPercentage: parseFloat(trailingStopPercentage), dcaLevels: parseInt(dcaLevels), dcaDropPercentage: parseFloat(dcaDropPercentage), leverage: parseInt(leverage), compoundProfits, useDynamicATR, useKellySizing, allowShorts })
      });
      const data = await res.json();
      if (data.success) {
        setBacktestResults(data);
      } else {
        alert('Backtest failed: ' + data.error);
        setShowBacktestModal(false);
      }
    } catch (e) {
      console.error(e);
      alert('Backtest error');
      setShowBacktestModal(false);
    }
    setBacktestLoading(false);
  };

  const runOptimize = async () => {
    setBacktestLoading(true);
    setIsOptimizing(true);
    setShowBacktestModal(true);
    setBacktestResults(null);
    try {
      const testSymbol = symbols.split(',')[0].trim();
      const res = await fetch(`${API_BASE}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: testSymbol, timeframe, tradeSizeEur: parseFloat(tradeSizeEur), leverage: parseInt(leverage), compoundProfits, useDynamicATR: status.config.useDynamicATR })
      });
      const data = await res.json();
      if (data.success && data.bestResult) {
        setBacktestResults(data.bestResult.result);
        
        // Auto-fill optimal settings back to state
        const bestConfig = data.bestResult.config;
        if (bestConfig.strategy) setStrategy(bestConfig.strategy);
        if (bestConfig.takeProfitPercentage !== undefined) setTakeProfitPercentage(bestConfig.takeProfitPercentage);
        if (bestConfig.trailingStopPercentage !== undefined) setTrailingStopPercentage(bestConfig.trailingStopPercentage);
        if (bestConfig.dcaLevels !== undefined) setDcaLevels(bestConfig.dcaLevels);
        if (bestConfig.dcaDropPercentage !== undefined) setDcaDropPercentage(bestConfig.dcaDropPercentage);
        
        setSaveMessage('✨ Best configuration found and applied!');
        setTimeout(() => setSaveMessage(''), 5000);
      } else {
        alert('Optimize failed: ' + (data.error || 'No results found'));
        setShowBacktestModal(false);
      }
    } catch (e) {
      console.error(e);
      alert('Optimize error');
      setShowBacktestModal(false);
    }
    setBacktestLoading(false);
  };

  const handleClearDb = async () => {
    if (!window.confirm("Are you sure you want to clear all history, active trades, and reset your balance to €1000?")) return;
    try {
      const res = await fetch(`${API_BASE}/clear-db`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchStatus(true);
        fetchBalance();
        fetchTrades();
      } else {
        alert("Failed to clear DB");
      }
    } catch (e) {
      console.error(e);
      alert("Error clearing DB");
    }
  };

  if (loading) return (
    <div className="loader-container">
      <div className="spinner"></div>
      <div className="loader-text">Loading dashboard...</div>
    </div>
  );

  const currentPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : 0;
  const baseCurrency = chartSymbol.split('/')[0];
  const cryptoAmount = balance && balance[baseCurrency] ? balance[baseCurrency] : 0;
  const fiatAmount = balance && balance.EUR ? balance.EUR : 0;
  
  let totalValue = fiatAmount;
  if (status.positions) {
      Object.keys(status.positions).forEach(sym => {
          const positions = status.positions[sym] || [];
          positions.forEach(pos => {
              const currentPosPrice = sym === chartSymbol ? currentPrice : pos.entryPrice;
              const collateral = pos.amount * pos.entryPrice;
              const unrealizedPnl = pos.side === 'LONG' 
                  ? (currentPosPrice - pos.entryPrice) * pos.amount
                  : (pos.entryPrice - currentPosPrice) * pos.amount;
              totalValue += (collateral + unrealizedPnl);
          });
      });
  }

  const profit = totalValue - 1000;
  const profitPercentage = ((profit / 1000) * 100).toFixed(2);
  const isProfit = profit >= 0;

  // Analytics
  const closedTrades = trades.filter(t => t.side.toLowerCase() === 'sell');
  const profitableTrades = closedTrades.filter(t => t.profit && t.profit > 0);
  const winRate = closedTrades.length > 0 ? ((profitableTrades.length / closedTrades.length) * 100).toFixed(1) : 0;
  
  let totalRealizedProfit = 0;
  closedTrades.forEach(t => {
    if (t.profit) totalRealizedProfit += t.profit;
  });
  const avgProfit = closedTrades.length > 0 ? (totalRealizedProfit / closedTrades.length).toFixed(2) : 0;

  return (
    <div className="app-container">
      {/* Toast Container */}
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{
            background: 'rgba(15, 23, 42, 0.95)',
            borderLeft: `4px solid ${toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#3b82f6'}`,
            padding: '16px 20px',
            borderRadius: '8px',
            color: 'white',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.3s ease',
            minWidth: '300px',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            {toast.message}
          </div>
        ))}
      </div>

      <header className="header">
        <div>
          <h1>DekkBot Dashboard</h1>
          <p className="metric-label" style={{ marginTop: '4px' }}>Kraken Integration • {paperTrading ? 'Paper Trading' : 'Live Trading'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span className={`status-badge ${status.isRunning ? 'status-active' : 'status-inactive'}`}>
            {status.isRunning ? 'Running' : 'Stopped'}
          </span>
          <button 
            className={`btn ${status.isRunning ? 'btn-danger' : 'btn-success'}`}
            onClick={toggleBot}
          >
            {status.isRunning ? 'Stop Bot' : 'Start Bot'}
          </button>
        </div>
      </header>

      <div className="app-layout">
        <aside className="sidebar-content">
        {/* Balance Panel */}
        <div className="glass-panel">
          <h2 className="metric-label">Total Portfolio Value (EUR)</h2>
          <div className="metric-value">
            €{totalValue > 0 ? totalValue.toLocaleString(undefined, {minimumFractionDigits: 2}) : '0.00'}
          </div>
          <div style={{ color: isProfit ? 'var(--text-success)' : 'var(--text-danger)', fontWeight: 'bold', fontSize: '1.2em', marginTop: '4px' }}>
            {isProfit ? '+' : ''}€{profit.toLocaleString(undefined, {minimumFractionDigits: 2})} ({isProfit ? '+' : ''}{profitPercentage}%)
          </div>
          <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span className="metric-label">Margin In Use</span>
              <span>€{(totalValue - fiatAmount).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="metric-label">EUR Available</span>
              <span>€{fiatAmount ? fiatAmount.toFixed(2) : '0.00'}</span>
            </div>
          </div>
        </div>

        {/* Active Positions Panel */}
        <div className="glass-panel" style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="metric-label" style={{ margin: 0 }}>Active Positions</h2>
            <button onClick={handleClearDb} style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}>
              Clear Database
            </button>
          </div>
          
          {Object.keys(status.positions || {}).flatMap(sym => status.positions[sym] ? status.positions[sym].map(p => ({ sym, ...p })) : []).length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '0.9em', marginTop: '8px' }}>No open trades at the moment.</div>
          ) : (
              Object.keys(status.positions || {}).flatMap(sym => status.positions[sym] ? status.positions[sym].map(p => ({ sym, ...p })) : []).map(pos => {
                  const currentPosPrice = pos.sym === chartSymbol ? currentPrice : pos.entryPrice;
                  const unrealizedPnl = pos.side === 'LONG' 
                      ? ((currentPosPrice - pos.entryPrice) / pos.entryPrice) * 100
                      : ((pos.entryPrice - currentPosPrice) / pos.entryPrice) * 100;
                  return (
                      <div key={pos.id} style={{ marginTop: '12px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <strong style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {pos.sym} 
                                  <span style={{fontSize: '0.75em', padding: '2px 6px', borderRadius: '4px', background: pos.side === 'LONG' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: pos.side === 'LONG' ? '#10b981' : '#ef4444'}}>
                                      {pos.side === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}
                                  </span>
                              </strong>
                              <span style={{ color: unrealizedPnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                                  {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}%
                              </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: '#94a3b8' }}>
                              <span>Amt: {pos.amount}</span>
                              <span>Entry: €{pos.entryPrice.toFixed(2)}</span>
                          </div>
                      </div>
                  );
              })
          )}
        </div>

        {/* Config Panel */}
        <div className="glass-panel">
          <h2 className="metric-label" style={{ marginBottom: '16px' }}>Bot Configuration</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="metric-label" style={{ display: 'block', marginBottom: '8px' }}>Trading Pairs (Comma Separated)</label>
              <input 
                type="text" 
                value={symbols} 
                onChange={(e) => setSymbols(e.target.value)}
                placeholder="BTC/EUR, ETH/EUR"
                className="form-input"
              />
            </div>
            <div style={{ gridColumn: 'span 1' }}>
              <label className="metric-label" style={{ display: 'block', marginBottom: '8px' }}>Paper Trading</label>
              <select className="form-input" value={paperTrading ? 'true' : 'false'} onChange={e => setPaperTrading(e.target.value === 'true')}>
                <option value="true">Enabled (Safe)</option>
                <option value="false">Disabled (LIVE FUNDS)</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 1' }}>
              <label className="metric-label" style={{ display: 'block', marginBottom: '8px' }}>Trading Mode</label>
              <select className="form-input" value={allowShorts ? 'true' : 'false'} onChange={e => setAllowShorts(e.target.value === 'true')}>
                <option value="true">Margin (Long & Short)</option>
                <option value="false">Spot (Long Only)</option>
              </select>
            </div>
            <div style={{ gridColumn: 'span 1' }}>
              <label className="metric-label" style={{ display: 'block', marginBottom: '8px' }}>
                Trade Size (€)
              </label>
              <input type="number" className="form-input" value={tradeSizeEur} min="10" onChange={e => setTradeSizeEur(e.target.value)} />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
                <label className="metric-label" style={{ display: 'block', marginBottom: '8px' }}>Kraken API Credentials (Live Funds only)</label>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <input 
                        type="password"
                        placeholder="API Key"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="form-input"
                        style={{ flex: 1 }}
                    />
                    <input 
                        type="password"
                        placeholder="API Secret"
                        value={apiSecret}
                        onChange={(e) => setApiSecret(e.target.value)}
                        className="form-input"
                        style={{ flex: 1 }}
                    />
                </div>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
                <label className="metric-label" style={{ display: 'block', marginBottom: '8px' }}>Google Gemini API Key (For LLM AI Analysis)</label>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <input 
                        type="password"
                        placeholder="AI Studio / Gemini API Key"
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        className="form-input"
                        style={{ flex: 1 }}
                    />
                </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <button className="btn btn-primary" style={{ width: '100%', position: 'relative' }} onClick={updateConfig}>
              Apply Configuration
            </button>
            <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={runBacktest}>
                🧪 Backtest
                </button>
                <button className="btn btn-success" style={{ flex: 1 }} onClick={runOptimize}>
                ✨ Optimize
                </button>
            </div>
          </div>
          {saveMessage && (
            <div style={{ marginTop: '12px', textAlign: 'center', color: saveMessage.includes('✅') ? 'var(--text-success)' : 'var(--text-danger)', fontWeight: 'bold' }}>
              {saveMessage}
            </div>
          )}
        </div>

        </aside>

        <main className="main-content">
        
        {/* Auto-Pilot Banner */}
        <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)', padding: '20px', borderRadius: '12px', display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ fontSize: '3em' }}>🤖</div>
            <div>
              <h2 style={{ margin: '0 0 8px 0', color: 'var(--warning)', fontSize: '1.5em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-badge" style={{ background: 'var(--warning)', color: 'black' }}>ACTIVE</span>
                Ultimate Auto-Pilot
              </h2>
              <p style={{ margin: 0, fontSize: '1.05em', color: 'rgba(255,255,255,0.85)', lineHeight: '1.5' }}>
                The bot continuously analyzes 10 different AI, HFT, and Trend strategies internally and adjusts risk management fully automatically.
              </p>
            </div>
        </div>

        {/* Advanced Performance Analytics */}
        <div>
            <div className="analytics-grid">
                <div className="analytics-card">
                    <div className="metric-label">Total Trades</div>
                    <div className="metric-value" style={{ fontSize: '28px' }}>{trades.length}</div>
                </div>
                <div className="analytics-card">
                    <div className="metric-label">Win Rate</div>
                    <div className="metric-value" style={{ fontSize: '28px', color: winRate > 50 ? 'var(--success)' : 'white' }}>{winRate}%</div>
                </div>
                <div className="analytics-card">
                    <div className="metric-label">Avg Profit / Trade</div>
                    <div className="metric-value" style={{ fontSize: '28px' }}>€{avgProfit}</div>
                </div>
                <div className="analytics-card">
                    <div className="metric-label">Total Realized Profit</div>
                    <div className="metric-value" style={{ fontSize: '28px', color: totalRealizedProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {totalRealizedProfit >= 0 ? '+' : ''}€{totalRealizedProfit.toFixed(2)}
                    </div>
                </div>
            </div>
        </div>

        {/* Strategy Reasoning Panel */}
        <div className="glass-panel" style={{ border: '1px solid rgba(99, 102, 241, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="metric-label" style={{ color: '#818cf8', margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '20px', fontWeight: 'bold' }}>
                  🧠 Strategy Reasoning
                  {status.macroTrend && (
                      <span style={{ 
                          fontSize: '11px', 
                          padding: '4px 10px', 
                          borderRadius: '4px', 
                          backgroundColor: status.macroTrend === 'BULLISH' ? 'rgba(16, 185, 129, 0.2)' : status.macroTrend === 'BEARISH' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                          color: status.macroTrend === 'BULLISH' ? '#10b981' : status.macroTrend === 'BEARISH' ? '#ef4444' : '#94a3b8',
                          border: `1px solid ${status.macroTrend === 'BULLISH' ? 'rgba(16, 185, 129, 0.5)' : status.macroTrend === 'BEARISH' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
                          textTransform: 'uppercase'
                      }}>
                          {status.macroTrend === 'BULLISH' ? '🐂 BULLISH MACRO' : status.macroTrend === 'BEARISH' ? '🐻 BEARISH MACRO' : '⚖️ NEUTRAL MACRO'}
                      </span>
                  )}
                  {fng && (
                      <span style={{ 
                          fontSize: '11px', 
                          padding: '4px 10px', 
                          borderRadius: '4px', 
                          backgroundColor: parseInt(fng.value) > 55 ? 'rgba(16, 185, 129, 0.2)' : parseInt(fng.value) < 45 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                          color: parseInt(fng.value) > 55 ? '#10b981' : parseInt(fng.value) < 45 ? '#ef4444' : '#94a3b8',
                          border: `1px solid ${parseInt(fng.value) > 55 ? 'rgba(16, 185, 129, 0.5)' : parseInt(fng.value) < 45 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
                          textTransform: 'uppercase'
                      }}>
                          {parseInt(fng.value) > 55 ? '🤑' : parseInt(fng.value) < 45 ? '😨' : '😐'} F&G INDEX: {fng.value} ({fng.value_classification})
                      </span>
                  )}
                </h2>
                {status.lastSignal && (
                    <div className={`signal-badge ${status.lastSignal === 'BUY' ? 'signal-buy' : status.lastSignal === 'SELL' ? 'signal-sell' : 'signal-hold'}`}>
                        {status.lastSignal === 'NONE' ? 'WAITING' : status.lastSignal}
                    </div>
                )}
            </div>
            <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', borderLeft: '4px solid var(--accent)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: '0.95em', lineHeight: '1.5' }}>
                {status.reasoning || 'Waiting for analysis...'}
              </div>
              {status.detailedReasoning && status.detailedReasoning.length > 0 && (
                <div style={{ marginTop: '10px', backgroundColor: 'rgba(0,0,0,0.15)', padding: '15px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0', opacity: 0.8, fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '1px' }}>🧠 Internal Neural Feed</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {status.detailedReasoning.map((log, i) => {
                        const isBuy = log.includes('BUY');
                        const isSell = log.includes('SELL');
                        const color = isBuy ? '#10b981' : isSell ? '#ef4444' : '#94a3b8';
                        return (
                            <div key={i} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: '0.85em', lineHeight: '1.4', color, opacity: isBuy || isSell ? 1 : 0.7, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                                {log}
                            </div>
                        );
                    })}
                  </div>
                </div>
              )}
        </div>

        {/* Chart Panel with HUD */}
        <div className="glass-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <h2 className="metric-label" style={{ margin: 0 }}>Live Price Chart</h2>
                    <select 
                        value={chartSymbol} 
                        onChange={(e) => { setChartSymbol(e.target.value); }} 
                        style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid var(--panel-border)', fontWeight: 'bold' }}
                    >
                        {symbols.split(',').map(s => <option key={s.trim()} value={s.trim()}>{s.trim()}</option>)}
                    </select>
                    
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--panel-border)' }}>
                        {['1m', '5m', '15m', '1h', '4h', '1d'].map(tf => (
                            <button
                                key={tf}
                                onClick={() => setChartTimeframe(tf)}
                                style={{
                                    background: chartTimeframe === tf ? 'var(--accent-color)' : 'transparent',
                                    color: chartTimeframe === tf ? 'white' : 'var(--text-secondary)',
                                    border: 'none',
                                    padding: '6px 12px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s ease',
                                    fontSize: '0.85em'
                                }}
                            >
                                {tf.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
                {status.latestIndicators && (
                    <div className="hud-ribbon" style={{ marginBottom: 0 }}>
                        <div className="hud-item">
                            <div className="hud-label">RSI (14)</div>
                            <div className="hud-value" style={{ color: status.latestIndicators.rsi > 70 ? 'var(--danger)' : status.latestIndicators.rsi < 30 ? 'var(--success)' : 'white' }}>
                                {status.latestIndicators.rsi ? status.latestIndicators.rsi.toFixed(2) : '--'}
                            </div>
                        </div>
                        <div className="hud-item">
                            <div className="hud-label">EMA (9)</div>
                            <div className="hud-value" style={{ color: status.latestIndicators.ema9 > status.latestIndicators.ema21 ? 'var(--success)' : 'var(--danger)' }}>
                                {status.latestIndicators.ema9 ? status.latestIndicators.ema9.toFixed(2) : '--'}
                            </div>
                        </div>
                        <div className="hud-item">
                            <div className="hud-label">EMA (21)</div>
                            <div className="hud-value">
                                {status.latestIndicators.ema21 ? status.latestIndicators.ema21.toFixed(2) : '--'}
                            </div>
                        </div>
                        <div className="hud-item">
                            <div className="hud-label">VWAP</div>
                            <div className="hud-value">
                                {status.latestIndicators.vwap ? status.latestIndicators.vwap.toFixed(2) : '--'}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <Chart data={chartData} trades={trades.filter(t => t.symbol === chartSymbol)} status={status} />
        </div>

        {/* Recent Trades Panel */}
        <div className="glass-panel">
          <h2 className="metric-label">Recent Trades</h2>
          {trades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              No trades executed yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="trades-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Price</th>
                    <th>Amount</th>
                    <th>Profit</th>
                    <th>Strategy</th>
                  </tr>
                </thead>
                    <tbody>
                      {trades.map(trade => (
                        <tr key={trade.id}>
                          <td>{new Date(typeof trade.timestamp === 'string' ? trade.timestamp.replace(' ', 'T') + 'Z' : trade.timestamp).toLocaleString(undefined, { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                          <td style={{ fontWeight: '500' }}>{trade.symbol}</td>
                      <td>
                        <span className={`trade-badge ${trade.side.includes('LONG') ? 'badge-long' : trade.side.includes('SHORT') ? 'badge-short' : (trade.side.toLowerCase() === 'buy' ? 'badge-legacy-buy' : 'badge-legacy-sell')} ${trade.side.includes('OPEN') ? 'badge-open' : trade.side.includes('CLOSE') ? 'badge-close' : ''}`}>
                          {trade.side}
                        </span>
                      </td>
                      <td>€{trade.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td>{trade.amount}</td>
                      <td>
                        {trade.profit !== null && trade.profit !== undefined ? (
                          <span className={trade.profit >= 0 ? 'text-success' : 'text-danger'} style={{ fontWeight: 'bold' }}>
                            {trade.profit >= 0 ? '+' : ''}€{trade.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                          </span>
                        ) : '-'}
                      </td>
                      <td><span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{trade.strategy}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </main>
      </div>

      {/* Backtest Modal */}
      {showBacktestModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: '80%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ margin: 0 }}>{isOptimizing ? '✨ Hyper-Parameter Optimizer' : '🧪 Backtest Simulator'}</h2>
              <button className="btn" style={{ background: 'var(--danger)', padding: '4px 12px' }} onClick={() => setShowBacktestModal(false)}>Close</button>
            </div>
            
            {backtestLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div className="spinner" style={{ width: '30px', height: '30px', marginBottom: '16px' }}></div>
                <h3 style={{ margin: '0' }}>{isOptimizing ? 'Running Brute-Force Optimization' : 'Running Quant Simulation'}</h3>
                <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
                  {isOptimizing 
                    ? 'Crunching 144 configurations against 10,000 historical candles... This may take up to 10 seconds.' 
                    : 'Downloading and analyzing 10,000 candles from Kraken...'}
                </p>
              </div>
            ) : backtestResults ? (
              <div>
                {isOptimizing && (
                  <div style={{ background: 'rgba(0,255,100,0.1)', border: '1px solid var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: 'var(--success)' }}>Optimal Configuration Found!</h3>
                    <p style={{ margin: 0, color: 'white' }}>The dashboard has been automatically updated with the most profitable settings.</p>
                  </div>
                )}
                <div className="analytics-grid" style={{ marginBottom: '24px' }}>
                    <div className="analytics-card">
                        <div className="metric-label">Win Rate</div>
                        <div className="metric-value" style={{ fontSize: '24px', color: backtestResults.stats.winRate > 50 ? 'var(--success)' : 'white' }}>{backtestResults.stats.winRate}%</div>
                    </div>
                    <div className="analytics-card">
                        <div className="metric-label">Total Simulated Profit</div>
                        <div className="metric-value" style={{ fontSize: '24px', color: backtestResults.stats.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {backtestResults.stats.totalProfit >= 0 ? '+' : ''}€{backtestResults.stats.totalProfit}
                        </div>
                    </div>
                    <div className="analytics-card">
                        <div className="metric-label">Simulated Trades</div>
                        <div className="metric-value" style={{ fontSize: '24px' }}>{backtestResults.stats.totalTrades}</div>
                    </div>
                </div>
                
                <h3 className="metric-label" style={{ marginBottom: '16px' }}>Simulated Trade Log</h3>
                <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                  <table className="trades-table" style={{ fontSize: '0.9em' }}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Side</th>
                        <th>Price</th>
                        <th>Reason</th>
                        <th>Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backtestResults.trades.slice().reverse().map((trade, i) => (
                        <tr key={i}>
                          <td>{new Date(typeof trade.timestamp === 'string' ? trade.timestamp.replace(' ', 'T') + 'Z' : trade.timestamp).toLocaleString()}</td>
                          <td className={trade.side === 'buy' ? 'text-success' : 'text-danger'} style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{trade.side}</td>
                          <td>€{trade.price.toFixed(2)}</td>
                          <td>{trade.reason}</td>
                          <td>
                            {trade.profit !== null ? (
                               <span className={trade.profit >= 0 ? 'text-success' : 'text-danger'}>
                                {trade.profit >= 0 ? '+' : ''}€{trade.profit.toFixed(2)}
                               </span>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
