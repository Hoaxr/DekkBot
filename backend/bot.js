import ccxt from 'ccxt';
import dotenv from 'dotenv';
import fs from 'fs';
import { logTrade, getLastTrade } from './db.js';
import { MovingAverageStrategy } from './strategies/movingAverage.js';
import { RSIStrategy } from './strategies/rsi.js';
import { BollingerBandsStrategy } from './strategies/bollingerBands.js';
import { GeminiAgentStrategy } from './strategies/geminiAgent.js';
import { ConfluenceQuantStrategy } from './strategies/confluenceQuant.js';
import { MeanReversionStrategy } from './strategies/meanReversion.js';
import { MetaStrategy } from './strategies/metaStrategy.js';
import { OrderbookSniperStrategy } from './strategies/orderbookSniper.js';
import { ATR, EMA, RSI, VWAP } from 'technicalindicators';
import { MLPredictor } from './strategies/mlPredictor.js';
import { getHistoricalTrades } from './db.js';

dotenv.config();

export class BotEngine {
    constructor() {
        this.isRunning = false;
        this.loopInterval = null;
        this.config = {
            symbols: 'BTC/EUR',
            timeframe: '1m',
            strategy: 'meta_strategy',
            paperTrading: true,
            apiKey: process.env.KRAKEN_API_KEY || '',
            secret: process.env.KRAKEN_SECRET || '',
            geminiApiKey: process.env.GEMINI_API_KEY || '',
            tradeSizeEur: 100,
            takeProfitPercentage: 0,
            trailingStopPercentage: 0,
            useDynamicATR: true,
            dcaLevels: 0,
            dcaDropPercentage: 0,
            leverage: 1,
            compoundProfits: false,
            useKellySizing: false,
            useBreakevenStop: true,
            breakevenTriggerPercentage: 1.0,
            maxTradeHoldTimeMinutes: 60,
            maxConcurrentTrades: 3
        };
        this.paperBalance = { EUR: 1000, BTC: 0, ETH: 0, SOL: 0 };
        this.positions = {}; 
        this.strategies = {};
        this.latestIndicators = {}; // Keyed by symbol
        this.globalSentiment = { value: 50, classification: 'Neutral', timestamp: 0 };
        
        try {
            if (fs.existsSync('./config.json')) {
                const savedConfig = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
                this.config = { ...this.config, ...savedConfig };
            }
        } catch(e) {
            console.error("Failed to load config.json:", e);
        }
        
        this.initExchange();
        this.initStrategy();
        this.restoreState();
    }

    get symbolsList() {
        return this.config.symbols.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    restoreState() {
        try {
            for (const symbol of this.symbolsList) {
                this.positions[symbol] = [];
                if (this.strategies[symbol]) {
                    this.strategies[symbol].lastSignal = 'NONE';
                }
            }
        } catch (e) {
            console.error("Failed to restore state:", e.message);
        }
    }

    initExchange() {
        this.exchange = new ccxt.kraken({
            apiKey: this.config.apiKey || 'MOCK_KEY',
            secret: this.config.secret || 'MOCK_SECRET',
            enableRateLimit: true,
        });
    }

    createStrategyInstance() {
        switch (this.config.strategy) {
            case 'rsi': return new RSIStrategy(this.config);
            case 'bollinger_bands': return new BollingerBandsStrategy(this.config);
            case 'confluence_quant': return new ConfluenceQuantStrategy(this.config);
            case 'mean_reversion': return new MeanReversionStrategy(this.config);
            case 'gemini_agent': return new GeminiAgentStrategy(this.config);
            case 'meta_strategy': return new MetaStrategy(this.config);
            case 'orderbook_sniper': return new OrderbookSniperStrategy(this.config);
            case 'moving_average':
            default: return new MovingAverageStrategy(this.config);
        }
    }

    initStrategy() {
        this.strategies = {};
        for (const symbol of this.symbolsList) {
            this.strategies[symbol] = this.createStrategyInstance();
        }
    }

    updateConfig(newConfig) {
        const restartNeeded = this.isRunning && 
            (newConfig.symbols !== this.config.symbols || 
             newConfig.timeframe !== this.config.timeframe);

        if (restartNeeded) this.stop();

        this.config = { ...this.config, ...newConfig };
        
        try {
            fs.writeFileSync('./config.json', JSON.stringify(this.config, null, 2));
        } catch(e) {
            console.error("Failed to save config.json:", e);
        }
        
        if (newConfig.apiKey !== undefined || newConfig.secret !== undefined) {
            this.initExchange();
        }
        if (newConfig.strategy !== undefined || newConfig.symbols !== undefined) {
            this.initStrategy();
            this.restoreState();
        }

        if (restartNeeded) this.start();
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('Bot started.');
        this.runLoop();
    }

    stop() {
        this.isRunning = false;
        if (this.loopInterval) {
            clearTimeout(this.loopInterval);
            this.loopInterval = null;
        }
        console.log('Bot stopped.');
    }

    async getBalance() {
        if (this.config.paperTrading) {
            return {
                free: this.paperBalance,
                total: this.paperBalance
            };
        }
        try {
            return await this.exchange.fetchBalance();
        } catch (error) {
            console.error('Error fetching balance:', error.message);
            throw error;
        }
    }

    async fetchMarketData(symbol) {
        try {
            const ohlcv = await this.exchange.fetchOHLCV(symbol, this.config.timeframe, undefined, 100);
            return ohlcv;
        } catch (error) {
            console.error(`Error fetching data for ${symbol}:`, error.message);
            return [];
        }
    }

    async fetchAnalysisData(symbol) {
        try {
            const ohlcv = await this.fetchMarketData(symbol);
            
            const timeframesToFetch = ['1m', '5m', '15m', '1h', '4h', '1d'];
            const multiTimeframeData = {};
            
            await Promise.all(timeframesToFetch.map(async (tf) => {
                try {
                    if (tf === this.config.timeframe) {
                        multiTimeframeData[tf] = ohlcv;
                    } else {
                        multiTimeframeData[tf] = await this.exchange.fetchOHLCV(symbol, tf, undefined, 50);
                    }
                } catch (e) {
                    console.warn(`Could not fetch ${tf} for ${symbol}`);
                    multiTimeframeData[tf] = [];
                }
            }));
            
            // Fetch orderbook
            let orderbook = { bids: [], asks: [] };
            try {
                const ob = await this.exchange.fetchOrderBook(symbol, 10);
                orderbook = { bids: ob.bids, asks: ob.asks };
            } catch (e) {
                console.warn(`Could not fetch orderbook for ${symbol}`);
            }

            // Fetch sentiment if older than 5 mins
            const now = Date.now();
            if (now - this.globalSentiment.timestamp > 300000) {
                try {
                    const res = await fetch('https://api.alternative.me/fng/?limit=1');
                    const data = await res.json();
                    if (data && data.data && data.data.length > 0) {
                        this.globalSentiment = {
                            value: parseInt(data.data[0].value),
                            classification: data.data[0].value_classification,
                            timestamp: now
                        };
                    }
                } catch (e) {
                    console.warn('Could not fetch Fear & Greed index');
                }
            }

            return { ohlcv, multiTimeframeData, orderbook, sentiment: this.globalSentiment };
        } catch (error) {
            console.error(`Error fetching analysis data for ${symbol}:`, error.message);
            return { ohlcv: [], multiTimeframeData: {}, orderbook: {bids:[], asks:[]}, sentiment: this.globalSentiment };
        }
    }

    async runLoop() {
        if (!this.isRunning) return;

        try {
            for (const symbol of this.symbolsList) {
                if (!this.isRunning) break;
                console.log(`[${new Date().toISOString()}] Fetching data and analyzing ${symbol}...`);
                const { ohlcv, multiTimeframeData, orderbook, sentiment } = await this.fetchAnalysisData(symbol);
                
                if (ohlcv.length > 0) {
                    const currentPrice = ohlcv[ohlcv.length - 1][4];
                    const highPrices = ohlcv.map(c => c[2]);
                    const lowPrices = ohlcv.map(c => c[3]);
                    const closePrices = ohlcv.map(c => c[4]);
                    
                    let currentAtr = 0;
                    if (ohlcv.length >= 15) {
                        const atrResult = ATR.calculate({ high: highPrices, low: lowPrices, close: closePrices, period: 14 });
                        currentAtr = atrResult.length > 0 ? atrResult[atrResult.length - 1] : 0;
                    }

                    if (ohlcv.length >= 21) {
                        const ema9Result = EMA.calculate({ period: 9, values: closePrices });
                        const ema21Result = EMA.calculate({ period: 21, values: closePrices });
                        const rsiResult = RSI.calculate({ period: 14, values: closePrices });
                        const vwapInput = ohlcv.map(c => ({ open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] }));
                        const vwapResult = VWAP.calculate({
                            high: vwapInput.map(v => v.high), low: vwapInput.map(v => v.low),
                            close: vwapInput.map(v => v.close), volume: vwapInput.map(v => v.volume)
                        });

                        this.latestIndicators[symbol] = {
                            ema9: ema9Result.length > 0 ? ema9Result[ema9Result.length - 1] : null,
                            ema21: ema21Result.length > 0 ? ema21Result[ema21Result.length - 1] : null,
                            rsi: rsiResult.length > 0 ? rsiResult[rsiResult.length - 1] : null,
                            vwap: vwapResult.length > 0 ? vwapResult[vwapResult.length - 1] : null,
                            atr: currentAtr > 0 ? currentAtr : null
                        };
                    }

                    if (!this.positions[symbol]) {
                        this.positions[symbol] = [];
                    }
                    const positions = this.positions[symbol];

                    // Process risk management for all open positions
                    for (let i = positions.length - 1; i >= 0; i--) {
                        const pos = positions[i];
                        let actionTaken = false;
                        const isLong = pos.side === 'LONG';
                        
                        if (isLong) {
                            pos.highestPriceSinceEntry = Math.max(pos.highestPriceSinceEntry || pos.entryPrice, currentPrice);
                        } else {
                            pos.lowestPriceSinceEntry = Math.min(pos.lowestPriceSinceEntry || pos.entryPrice, currentPrice);
                        }

                        let stopPrice = 0;
                        if (this.config.trailingStopPercentage > 0) {
                            if (isLong) stopPrice = pos.highestPriceSinceEntry * (1 - (this.config.trailingStopPercentage / 100));
                            else stopPrice = pos.lowestPriceSinceEntry * (1 + (this.config.trailingStopPercentage / 100));
                        } else if (this.config.useDynamicATR && currentAtr > 0) {
                            if (isLong) stopPrice = pos.highestPriceSinceEntry - (currentAtr * 2.5);
                            else stopPrice = pos.lowestPriceSinceEntry + (currentAtr * 2.5);
                        }

                        // BREAKEVEN STOP CHECK
                        if (this.config.useBreakevenStop) {
                            const feeMargin = pos.entryPrice * 0.0055;
                            if (isLong && pos.highestPriceSinceEntry >= pos.entryPrice * (1 + (this.config.breakevenTriggerPercentage / 100))) {
                                if (stopPrice < pos.entryPrice + feeMargin) stopPrice = pos.entryPrice + feeMargin;
                            } else if (!isLong && pos.lowestPriceSinceEntry <= pos.entryPrice * (1 - (this.config.breakevenTriggerPercentage / 100))) {
                                if (stopPrice > pos.entryPrice - feeMargin || stopPrice === 0) stopPrice = pos.entryPrice - feeMargin;
                            }
                        }

                        // TIME STOP CHECK
                        if (this.config.maxTradeHoldTimeMinutes > 0 && pos.entryTime > 0 && !actionTaken) {
                            const minutesHeld = (Date.now() - pos.entryTime) / 60000;
                            if (minutesHeld >= this.config.maxTradeHoldTimeMinutes) {
                                const inProfit = isLong ? currentPrice > pos.entryPrice * 1.005 : currentPrice < pos.entryPrice * 0.995;
                                if (!inProfit) {
                                    if (this.strategies[symbol]) this.strategies[symbol].lastReasoning = `⏳ TIME STOP: Closed ${pos.side} after >${this.config.maxTradeHoldTimeMinutes}m.`;
                                    await this.executeOrder(isLong ? 'close long' : 'close short', symbol, currentPrice, false, pos);
                                    positions.splice(i, 1);
                                    actionTaken = true;
                                }
                            }
                        }

                        // STOP LOSS CHECK
                        if (!actionTaken && stopPrice > 0) {
                            const stopTriggered = isLong ? (currentPrice <= stopPrice) : (currentPrice >= stopPrice);
                            if (stopTriggered) {
                                if (this.strategies[symbol]) this.strategies[symbol].lastReasoning = `🔴 STOP TRIGGERED at ${currentPrice} (Avg Entry: ${pos.entryPrice.toFixed(2)})`;
                                await this.executeOrder(isLong ? 'close long' : 'close short', symbol, currentPrice, false, pos);
                                positions.splice(i, 1);
                                actionTaken = true;
                            }
                        }

                        // TAKE PROFIT CHECK
                        if (!actionTaken && this.config.takeProfitPercentage > 0) {
                            const tpPrice = isLong ? pos.entryPrice * (1 + (this.config.takeProfitPercentage / 100)) : pos.entryPrice * (1 - (this.config.takeProfitPercentage / 100));
                            const tpTriggered = isLong ? (currentPrice >= tpPrice) : (currentPrice <= tpPrice);
                            if (tpTriggered) {
                                if (this.strategies[symbol]) this.strategies[symbol].lastReasoning = `🟢 TAKE PROFIT TRIGGERED at ${currentPrice} (Avg Entry: ${pos.entryPrice.toFixed(2)})`;
                                await this.executeOrder(isLong ? 'close long' : 'close short', symbol, currentPrice, false, pos);
                                positions.splice(i, 1);
                                actionTaken = true;
                            }
                        }

                        // DCA GRID CHECK
                        if (!actionTaken && this.config.dcaLevels > 0 && pos.dcaLevel < this.config.dcaLevels) {
                            const dcaTarget = isLong ? pos.entryPrice * (1 - (this.config.dcaDropPercentage / 100)) : pos.entryPrice * (1 + (this.config.dcaDropPercentage / 100));
                            const dcaTriggered = isLong ? (currentPrice <= dcaTarget) : (currentPrice >= dcaTarget);
                            if (dcaTriggered) {
                                if (this.strategies[symbol]) this.strategies[symbol].lastReasoning = `🔵 DCA LEVEL ${pos.dcaLevel + 1} at ${currentPrice}`;
                                await this.executeOrder(isLong ? 'open long' : 'open short', symbol, currentPrice, true, pos);
                                actionTaken = true;
                            }
                        }
                    }

                    // Process new signals
                    const strategy = this.strategies[symbol];
                    if (strategy) {
                        const mlPrediction = MLPredictor.predict(ohlcv);
                        const context = { multiTimeframeData, orderbook, sentiment, mlPrediction };
                        const signal = await strategy.analyze(ohlcv, context);
                        
                        if (signal === 'BUY') {
                            // Close shorts
                            for (let i = positions.length - 1; i >= 0; i--) {
                                if (positions[i].side === 'SHORT') {
                                    await this.executeOrder('close short', symbol, currentPrice, false, positions[i]);
                                    positions.splice(i, 1);
                                }
                            }
                            // Open long
                            // Open long if we don't already have one for this symbol
                            const longCount = positions.filter(p => p.side === 'LONG').length;
                            if (longCount === 0) {
                                await this.executeOrder('open long', symbol, currentPrice);
                            }
                        } else if (signal === 'SELL') {
                            // Close longs
                            for (let i = positions.length - 1; i >= 0; i--) {
                                if (positions[i].side === 'LONG') {
                                    await this.executeOrder('close long', symbol, currentPrice, false, positions[i]);
                                    positions.splice(i, 1);
                                }
                            }
                            // Open short
                            // Open short if we don't already have one for this symbol
                            const shortCount = positions.filter(p => p.side === 'SHORT').length;
                            if (shortCount === 0) {
                                await this.executeOrder('open short', symbol, currentPrice);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Loop error:', error);
        }

        if (this.isRunning) {
            this.loopInterval = setTimeout(() => this.runLoop(), 10000);
        }
    }

    resetPosition(symbol) {
        this.positions[symbol] = { entryPrice: 0, highestPriceSinceEntry: 0, amount: 0, dcaLevel: 0, entryTime: 0 };
    }

    async executeOrder(action, symbol, currentPrice, isDca = false, targetPos = null) {
        console.log(`Executing ${action} order for ${symbol}...`);
        
        let tradeSizeEur = this.config.tradeSizeEur || 100;

        if (this.config.useKellySizing && action.startsWith('open') && !isDca) {
            const historicalTrades = getHistoricalTrades();
            if (historicalTrades.length > 5) {
                const wins = historicalTrades.filter(t => t.profit > 0);
                const losses = historicalTrades.filter(t => t.profit <= 0);
                const winRate = wins.length / historicalTrades.length;
                const avgWin = wins.length > 0 ? (wins.reduce((sum, t) => sum + t.profit, 0) / wins.length) : 0;
                const avgLoss = losses.length > 0 ? (Math.abs(losses.reduce((sum, t) => sum + t.profit, 0)) / losses.length) : 1;
                
                const winLossRatio = avgWin / (avgLoss === 0 ? 1 : avgLoss);
                const kellyFraction = winRate - ((1 - winRate) / (winLossRatio === 0 ? 1 : winLossRatio));
                const safeKelly = Math.max(0.01, Math.min(0.15, kellyFraction / 2));
                tradeSizeEur = this.paperBalance.EUR * safeKelly;
                console.log(`[KELLY SIZING] WinRate: ${(winRate*100).toFixed(1)}%, -> Trade Size: €${tradeSizeEur.toFixed(2)}`);
            }
        }

        if (this.config.dcaLevels > 0) {
            tradeSizeEur = tradeSizeEur / (1 + this.config.dcaLevels);
        }
        
        let amountToTrade = (action.startsWith('open') || isDca) ? Number((tradeSizeEur / currentPrice).toFixed(6)) : (targetPos ? targetPos.amount : 0);
        if (amountToTrade <= 0) return;

        const feeRate = 0.0026;
        let profitEur = null;
        const exchangeSide = (action === 'open long' || action === 'close short') ? 'buy' : 'sell';
        
        if (action.startsWith('close') && targetPos) {
            if (action === 'close long') {
                const sellRevenue = amountToTrade * currentPrice * (1 - feeRate);
                const buyCost = amountToTrade * targetPos.entryPrice;
                profitEur = sellRevenue - buyCost;
            } else if (action === 'close short') {
                const buyCost = amountToTrade * currentPrice * (1 + feeRate);
                const sellRevenue = amountToTrade * targetPos.entryPrice;
                profitEur = sellRevenue - buyCost;
            }
        }
        
        let actualPrice = currentPrice;

        if (this.config.paperTrading) {
            const base = symbol.split('/')[0];
            const quote = symbol.split('/')[1];
            const cost = amountToTrade * currentPrice;
            const feeCost = cost * feeRate;
            
            if (action === 'open long' || action === 'open short') {
                // Lock up margin collateral + pay fee
                this.paperBalance[quote] -= (cost + feeCost);
                if (action === 'open long') {
                    this.paperBalance[base] = (this.paperBalance[base] || 0) + amountToTrade;
                } else {
                    this.paperBalance[base] = (this.paperBalance[base] || 0) - amountToTrade;
                }
            } else if (action === 'close long' || action === 'close short') {
                // Unlock margin collateral + add profit - pay fee
                const collateral = targetPos.entryPrice * amountToTrade;
                this.paperBalance[quote] += (collateral + profitEur - feeCost);
                
                if (action === 'close long') {
                    this.paperBalance[base] -= amountToTrade;
                } else {
                    this.paperBalance[base] += amountToTrade;
                }
            }
        } else {
            try {
                const orderBook = await this.exchange.fetchOrderBook(symbol, 5);
                const targetPrice = exchangeSide === 'buy' ? orderBook.bids[0][0] : orderBook.asks[0][0];
                
                console.log(`[LIVE TRADE] Placing ${exchangeSide} LIMIT order at ${targetPrice}`);
                const order = await this.exchange.createLimitOrder(symbol, exchangeSide, amountToTrade, targetPrice);
                actualPrice = order.price || targetPrice;
                
                if (action.startsWith('close') && targetPos) {
                    if (action === 'close long') profitEur = (amountToTrade * actualPrice * (1 - feeRate)) - (amountToTrade * targetPos.entryPrice);
                    else if (action === 'close short') profitEur = (amountToTrade * targetPos.entryPrice) - (amountToTrade * actualPrice * (1 + feeRate));
                }
            } catch (error) {
                console.error('Order execution failed:', error.message);
                return;
            }
        }

        if (action.startsWith('open') && !isDca) {
            const entryP = action === 'open long' ? actualPrice * (1 + feeRate) : actualPrice * (1 - feeRate);
            if (!this.positions[symbol]) this.positions[symbol] = [];
            this.positions[symbol].push({
                id: Date.now() + Math.random(),
                side: action === 'open long' ? 'LONG' : 'SHORT',
                entryPrice: entryP,
                highestPriceSinceEntry: actualPrice,
                lowestPriceSinceEntry: actualPrice,
                amount: amountToTrade,
                dcaLevel: 0,
                entryTime: Date.now()
            });
        } else if (isDca && targetPos) {
            const entryP = targetPos.side === 'LONG' ? actualPrice * (1 + feeRate) : actualPrice * (1 - feeRate);
            const totalCostEur = (targetPos.amount * targetPos.entryPrice) + (amountToTrade * entryP);
            const newTotalAmount = targetPos.amount + amountToTrade;
            targetPos.entryPrice = totalCostEur / newTotalAmount;
            targetPos.amount = newTotalAmount;
            targetPos.dcaLevel += 1;
        }

        const actionStr = isDca ? action.toUpperCase() + ' (DCA)' : action.toUpperCase();
        logTrade(symbol, actionStr, amountToTrade, actualPrice, this.config.strategy, profitEur);
    }
}
