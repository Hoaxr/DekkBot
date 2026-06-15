import { MovingAverageStrategy } from './movingAverage.js';
import { RSIStrategy } from './rsi.js';
import { BollingerBandsStrategy } from './bollingerBands.js';
import { MeanReversionStrategy } from './meanReversion.js';
import { ConfluenceQuantStrategy } from './confluenceQuant.js';
import { OrderbookSniperStrategy } from './orderbookSniper.js';
import { FibonacciStrategy } from './fibonacci.js';
import { VWAPReversalStrategy } from './vwapReversal.js';
import { GeminiAgentStrategy } from './geminiAgent.js';
import { TriangleBreakoutStrategy } from './triangleBreakout.js';
import { EMA } from 'technicalindicators';

export class MetaStrategy {
    constructor(config) {
        this.config = config;
        
        // Instantiate all technical strategies (excluding Gemini due to API limits/costs)
        this.strategies = {
            'RSI': new RSIStrategy(config),
            'Bollinger Bands': new BollingerBandsStrategy(config),
            'Moving Average': new MovingAverageStrategy(config),
            'Mean Reversion': new MeanReversionStrategy(config),
            'Confluence Quant': new ConfluenceQuantStrategy(config),
            'Orderbook Sniper': new OrderbookSniperStrategy(config),
            'Fibonacci Golden Ratio': new FibonacciStrategy(config),
            'VWAP Institutional Reversal': new VWAPReversalStrategy(config),
            'Triangle Breakout': new TriangleBreakoutStrategy(config),
            'Gemini AI Agent': new GeminiAgentStrategy(config)
        };
        
        this.virtualPositions = {};
        this.virtualPnl = {};
        
        // Initialize tracking state
        for (const name in this.strategies) {
            this.virtualPositions[name] = null; // null or { entryPrice }
            this.virtualPnl[name] = 0; // Cumulative percentage
        }
        
        this.warmedUp = false;
        this.lastReasoning = 'Initializing Meta Strategy Auto-Selector...';
        this.lastSignal = 'NONE';
    }

    async analyze(ohlcv, context) {
        if (!ohlcv || ohlcv.length === 0) return 'NONE';

        // Warmup phase: Simulate trades on historical data so we don't start at 0.00%
        if (!this.warmedUp && ohlcv.length > 50) {
            console.log("[META] Warming up algorithms on historical data...");
            for (let i = 50; i < ohlcv.length - 1; i++) {
                const slice = ohlcv.slice(0, i + 1);
                const simPrice = slice[slice.length - 1][4];

                for (const [name, strategy] of Object.entries(this.strategies)) {
                    const signal = await strategy.analyze(slice, context);
                    
                    if (this.virtualPositions[name]) {
                        if (signal === 'SELL' && this.virtualPositions[name].side === 'LONG') {
                            const profitPct = ((simPrice - this.virtualPositions[name].entryPrice) / this.virtualPositions[name].entryPrice) * 100;
                            this.virtualPnl[name] += profitPct;
                            this.virtualPositions[name] = null;
                        } else if (signal === 'BUY' && this.virtualPositions[name].side === 'SHORT') {
                            const profitPct = ((this.virtualPositions[name].entryPrice - simPrice) / this.virtualPositions[name].entryPrice) * 100;
                            this.virtualPnl[name] += profitPct;
                            this.virtualPositions[name] = null;
                        }
                    }
                    
                    if (!this.virtualPositions[name]) {
                        if (signal === 'BUY') {
                            this.virtualPositions[name] = { side: 'LONG', entryPrice: simPrice };
                        } else if (signal === 'SELL') {
                            this.virtualPositions[name] = { side: 'SHORT', entryPrice: simPrice };
                        }
                    }
                }
            }
            this.warmedUp = true;
            console.log("[META] Warmup complete.");
        }

        const currentPrice = ohlcv[ohlcv.length - 1][4];

        let signals = {};
        
        // Evaluate all sub-strategies
        for (const [name, strategy] of Object.entries(this.strategies)) {
            // Some strategies use context, some just macro. For simplicity we pass context. 
            // In bot.js, context object contains ohlcvMacro which old strategies ignore safely.
            const signal = await strategy.analyze(ohlcv, context);
            signals[name] = signal;

            // Manage Virtual Positions for PnL tracking
            if (this.virtualPositions[name]) {
                if (signal === 'SELL' && this.virtualPositions[name].side === 'LONG') {
                    const profitPct = ((currentPrice - this.virtualPositions[name].entryPrice) / this.virtualPositions[name].entryPrice) * 100;
                    this.virtualPnl[name] += profitPct;
                    this.virtualPositions[name] = null; // Close virtual position
                } else if (signal === 'BUY' && this.virtualPositions[name].side === 'SHORT') {
                    const profitPct = ((this.virtualPositions[name].entryPrice - currentPrice) / this.virtualPositions[name].entryPrice) * 100;
                    this.virtualPnl[name] += profitPct;
                    this.virtualPositions[name] = null;
                }
            } 
            
            if (!this.virtualPositions[name]) {
                if (signal === 'BUY') {
                    this.virtualPositions[name] = { side: 'LONG', entryPrice: currentPrice }; // Open virtual position
                } else if (signal === 'SELL') {
                    this.virtualPositions[name] = { side: 'SHORT', entryPrice: currentPrice };
                }
            }
        }

        // Rank strategies including unrealized PnL
        const rankings = [];
        for (const name in this.strategies) {
            let totalPnl = this.virtualPnl[name];
            if (this.virtualPositions[name]) {
                // Add unrealized PnL if currently holding
                const entryPrice = this.virtualPositions[name].entryPrice;
                if (this.virtualPositions[name].side === 'LONG') {
                    totalPnl += ((currentPrice - entryPrice) / entryPrice) * 100;
                } else {
                    totalPnl += ((entryPrice - currentPrice) / entryPrice) * 100;
                }
            }
            rankings.push({ name, pnl: totalPnl, signal: signals[name] });
        }

        // HFT OVERRIDE: Orderbook Sniper relies on live liquidity (milliseconds). 
        // Its historical PnL is irrelevant because orderbooks cannot be backtested.
        // If it spots a massive wall NOW, it gets absolute priority.
        if (signals['Orderbook Sniper'] === 'BUY' || signals['Orderbook Sniper'] === 'SELL') {
            this.lastReasoning = `🚨 HFT OVERRIDE: Massive Orderbook Imbalance detected! Intercepting normal AI logic.`;
            this.lastSignal = signals['Orderbook Sniper'];
            this.applyAutoPilot('Orderbook Sniper', context);
            return this.lastSignal;
        }

        // 1. MACRO TREND ALIGNMENT (Multi-Timeframe Analysis)
        let macroTrend = 'NEUTRAL';
        if (context && context.ohlcvMacro && context.ohlcvMacro.length >= 21) {
            const macroCloses = context.ohlcvMacro.map(c => c[4]);
            const ema9Result = EMA.calculate({ period: 9, values: macroCloses });
            const ema21Result = EMA.calculate({ period: 21, values: macroCloses });
            const ema9 = ema9Result[ema9Result.length - 1];
            const ema21 = ema21Result[ema21Result.length - 1];
            
            if (ema9 > ema21) macroTrend = 'BULLISH';
            else if (ema9 < ema21) macroTrend = 'BEARISH';
        }

        // Apply Macro-Trend filter: Suppress counter-trend signals
        // EXCEPTIONS: Orderbook Sniper (HFT), Mean Reversion (fades extremes), and Gemini AI (LLM makes its own choice)
        this.macroTrend = macroTrend;
        for (const name in signals) {
            if (!['Orderbook Sniper', 'Mean Reversion', 'Gemini AI'].includes(name)) {
                if (macroTrend === 'BULLISH' && signals[name] === 'SELL') {
                    signals[name] = 'NONE';
                    if (this.strategies[name]) this.strategies[name].lastReasoning += ' (SELL suppressed by BULLISH Macro Trend)';
                } else if (macroTrend === 'BEARISH' && signals[name] === 'BUY') {
                    signals[name] = 'NONE';
                    if (this.strategies[name]) this.strategies[name].lastReasoning += ' (BUY suppressed by BEARISH Macro Trend)';
                }
            }
        }

        // Sort descending by PnL
        rankings.sort((a, b) => b.pnl - a.pnl);
        
        // Pick the highest ranked strategy that actually HAS a signal
        const activeStrategy = rankings.find(r => r.signal === 'BUY' || r.signal === 'SELL');
        const bestStrategy = activeStrategy || rankings[0]; // Fallback to #1 for logging if no signals
        
        const top3 = rankings.slice(0, 3).map(r => `${r.name} (${r.pnl.toFixed(2)}%)`).join(', ');
        
        let finalSignal = bestStrategy.signal;
        let finalReasoning = `🏆 Meta Selector. Active: [${bestStrategy.name}] (${bestStrategy.pnl.toFixed(2)}% virtual profit). Signal: ${bestStrategy.signal}. Top 3: ${top3} (Live: €${currentPrice.toFixed(2)} | Macro: ${macroTrend})`;
        let strategyToFollow = bestStrategy.name;

        // 2. SUPER-CONFLUENCE VOTING (Democratic Override)
        let buyCount = 0;
        let sellCount = 0;
        for (const name in signals) {
            if (signals[name] === 'BUY') buyCount++;
            if (signals[name] === 'SELL') sellCount++;
        }

        if (buyCount >= 2) {
            finalSignal = 'BUY';
            finalReasoning = `🔥 CONFLUENCE OVERRIDE: ${buyCount} AI modules are screaming BUY simultaneously! Executing trade. (Macro: ${macroTrend})`;
            strategyToFollow = 'Confluence Quant'; // Borrow settings
        } else if (sellCount >= 2) {
            finalSignal = 'SELL';
            finalReasoning = `🩸 CONFLUENCE OVERRIDE: ${sellCount} AI modules are screaming SELL simultaneously! Executing trade. (Macro: ${macroTrend})`;
            strategyToFollow = 'Confluence Quant'; // Borrow settings
        }

        this.lastReasoning = finalReasoning;
        this.lastSignal = finalSignal;
        
        // Compile the thoughts of all individual AI modules
        this.detailedReasoning = [];
        for (const name in this.strategies) {
            const strat = this.strategies[name];
            const currentSig = signals[name] !== 'NONE' ? `[${signals[name]}] ` : '';
            this.detailedReasoning.push(`${name}: ${currentSig}${strat.lastReasoning}`);
        }
        
        this.applyAutoPilot(strategyToFollow, context);
        
        return finalSignal;
    }

    applyAutoPilot(bestStrategyName, context) {
        // Full Auto-Pilot logic
        const greed = context?.sentiment?.value || 50;

        let tp = 2.0;
        let ts = 1.0;
        let dca = 1;
        let drop = 2.0;
        let lev = 1;

        // Base profile on winning strategy
        if (bestStrategyName === 'Mean Reversion') {
            dca = 3;
            drop = 2.5;
            tp = 1.5;
            ts = 0;
        } else if (bestStrategyName === 'RSI') {
            dca = 2;
            drop = 2.0;
            tp = 2.0;
            ts = 1.0;
        } else if (bestStrategyName === 'Orderbook Sniper') {
            dca = 0; // Don't DCA on a scalp
            drop = 0;
            tp = 1.0; // Scalp tiny profits
            ts = 0.5; // Very tight stop
            lev = 3; // Increase leverage for high probability scalps
        } else if (bestStrategyName === 'Fibonacci Golden Ratio') {
            dca = 1;
            drop = 1.0;
            tp = 2.0;
            ts = 1.0;
            lev = 2; // High probability bounce
        } else if (bestStrategyName === 'VWAP Institutional Reversal') {
            dca = 0;
            drop = 0;
            tp = 3.0; // Wait for reversion to mean
            ts = 1.5;
            lev = 2;
        } else {
            // Trend following
            dca = 0; 
            tp = 4.0;
            ts = 2.0;
        }

        // Adjust for extreme market conditions
        if (greed > 75) {
            tp = Math.max(0.5, tp / 2); // Take profits quickly in extreme greed
            lev = 1;
        } else if (greed < 25) {
            tp = tp * 1.5; // Expect larger bounce
            lev = 2; // Be bold
        }

        // Mutate the central configuration!
        this.config.takeProfitPercentage = Number(tp.toFixed(1));
        this.config.trailingStopPercentage = Number(ts.toFixed(1));
        this.config.dcaLevels = dca;
        this.config.dcaDropPercentage = Number(drop.toFixed(1));
        this.config.leverage = lev;

        // Auto-manage Advanced Toggles
        // Always reinvest profits and use smart sizing for mathematically optimal portfolio growth
        this.config.compoundProfits = true;
        this.config.useKellySizing = true;
        
        // Dynamic ATR is only necessary when market volatility is extremely high
        // Or if we're not scalping. The bot decides to use it for trend-following strategies.
        if (bestStrategyName === 'Orderbook Sniper' || bestStrategyName === 'Fibonacci Golden Ratio') {
            this.config.useDynamicATR = false; // Scalps need tight, static stops
        } else {
            this.config.useDynamicATR = true; // Trends need breathing room
        }
    }
}
