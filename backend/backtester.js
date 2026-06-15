import ccxt from 'ccxt';
import { MovingAverageStrategy } from './strategies/movingAverage.js';
import { RSIStrategy } from './strategies/rsi.js';
import { BollingerBandsStrategy } from './strategies/bollingerBands.js';
import { ConfluenceQuantStrategy } from './strategies/confluenceQuant.js';
import { MeanReversionStrategy } from './strategies/meanReversion.js';
import { MetaStrategy } from './strategies/metaStrategy.js';
import { OrderbookSniperStrategy } from './strategies/orderbookSniper.js';
import { ATR } from 'technicalindicators';

export class Backtester {
    constructor(config) {
        this.config = config;
        this.exchange = config.exchangeInstance || new ccxt.kraken({ enableRateLimit: true });
    }

    createStrategy() {
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

    async run() {
        console.log(`Starting backtest for ${this.config.symbol} on ${this.config.timeframe}...`);
        
        // Fetch 10,000 historical candles by paginating CCXT
        let ohlcv = [];
        try {
            if (this.config.prefetchedOhlcv) {
                ohlcv = this.config.prefetchedOhlcv;
            } else {
                const timeframeMs = this.exchange.parseTimeframe(this.config.timeframe) * 1000;
                let since = Date.now() - (10000 * timeframeMs);
                
                while (ohlcv.length < 10000) {
                    const limit = Math.min(720, 10000 - ohlcv.length);
                    const chunk = await this.exchange.fetchOHLCV(this.config.symbol, this.config.timeframe, since, limit);
                    if (chunk.length === 0) break;
                    ohlcv = ohlcv.concat(chunk);
                    since = chunk[chunk.length - 1][0] + timeframeMs;
                    await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit prevention
                }
            }
        } catch (e) {
            throw new Error(`Failed to fetch historical data: ${e.message}`);
        }

        if (ohlcv.length < 50) throw new Error("Not enough historical data to backtest.");

        let ohlcvMacro = [];
        if (this.config.timeframe !== '15m' && this.config.timeframe !== '1h' && this.config.timeframe !== '1d') {
            try {
                if (this.config.prefetchedOhlcvMacro) {
                    ohlcvMacro = this.config.prefetchedOhlcvMacro;
                } else {
                    const macroTimeframeMs = this.exchange.parseTimeframe('15m') * 1000;
                    let sinceMacro = ohlcv[0][0];
                    const numMacroCandles = Math.ceil((ohlcv[ohlcv.length-1][0] - ohlcv[0][0]) / macroTimeframeMs) + 100;
                    
                    while (ohlcvMacro.length < numMacroCandles) {
                        const limit = Math.min(720, numMacroCandles - ohlcvMacro.length);
                        const chunk = await this.exchange.fetchOHLCV(this.config.symbol, '15m', sinceMacro, limit);
                        if (chunk.length === 0) break;
                        ohlcvMacro = ohlcvMacro.concat(chunk);
                        sinceMacro = chunk[chunk.length - 1][0] + macroTimeframeMs;
                        await new Promise(resolve => setTimeout(resolve, 300)); // Rate limit prevention
                    }
                }
            } catch (e) {
                // Ignore macro errors
            }
        }

        const strategy = this.createStrategy();
        const trades = [];
        let paperBalanceEur = 1000;
        
        let pos = { entryPrice: 0, amount: 0, highestPriceSinceEntry: 0, dcaLevel: 0, marginCollateral: 0, liquidationPrice: 0 };
        const feeRate = 0.0026;
        const leverage = this.config.leverage || 1;

        // Simulate step-by-step
        for (let i = 50; i < ohlcv.length; i++) {
            // Only take the last 200 candles to prevent OOM and huge CPU usage
            const sliceStart = Math.max(0, i - 200);
            const currentSlice = ohlcv.slice(sliceStart, i + 1);
            const currentCandle = currentSlice[currentSlice.length - 1];
            const currentPrice = currentCandle[4];
            const timestamp = currentCandle[0];

            let macroSlice = [];
            if (ohlcvMacro.length > 0) {
                const macroCandles = ohlcvMacro.filter(c => c[0] <= timestamp);
                // Only take the last 200 macro candles
                macroSlice = macroCandles.slice(Math.max(0, macroCandles.length - 200));
            }

            let currentAtr = 0;
            if (currentSlice.length >= 15) {
                const atrResult = ATR.calculate({ 
                    high: currentSlice.map(c => c[2]), 
                    low: currentSlice.map(c => c[3]), 
                    close: currentSlice.map(c => c[4]), 
                    period: 14 
                });
                currentAtr = atrResult.length > 0 ? atrResult[atrResult.length - 1] : 0;
            }

            let actionTaken = false;

            // Manage Open Position
            if (pos.amount > 0 && pos.entryPrice > 0) {
                if (currentPrice > pos.highestPriceSinceEntry) {
                    pos.highestPriceSinceEntry = currentPrice;
                }

                // Check Liquidation
                if (currentPrice <= pos.liquidationPrice) {
                    const profit = -pos.marginCollateral; // Lose all collateral
                    trades.push({ timestamp, side: 'sell', price: currentPrice, reason: 'Liquidation', profit });
                    pos = { entryPrice: 0, amount: 0, highestPriceSinceEntry: 0, dcaLevel: 0, marginCollateral: 0, liquidationPrice: 0 };
                    actionTaken = true;
                }

                let stopPrice = 0;
                if (!actionTaken) {
                    if (this.config.trailingStopPercentage > 0) {
                        stopPrice = pos.highestPriceSinceEntry * (1 - (this.config.trailingStopPercentage / 100));
                    } else if (this.config.useDynamicATR && currentAtr > 0) {
                        stopPrice = pos.highestPriceSinceEntry - (currentAtr * 2.5);
                    }
                }

                // Stop Loss
                if (!actionTaken && stopPrice > 0 && currentPrice <= stopPrice) {
                    const sellVolume = pos.amount * currentPrice;
                    const fee = sellVolume * feeRate;
                    const pnl = (currentPrice - pos.entryPrice) * pos.amount - fee;
                    paperBalanceEur += (pos.marginCollateral + pnl);
                    trades.push({ timestamp, side: 'sell', price: currentPrice, reason: 'Stop Loss', profit: pnl });
                    pos = { entryPrice: 0, amount: 0, highestPriceSinceEntry: 0, dcaLevel: 0, marginCollateral: 0, liquidationPrice: 0 };
                    actionTaken = true;
                }

                // Take Profit
                if (!actionTaken && this.config.takeProfitPercentage > 0) {
                    const tpPrice = pos.entryPrice * (1 + (this.config.takeProfitPercentage / 100));
                    if (currentPrice >= tpPrice) {
                        const sellVolume = pos.amount * currentPrice;
                        const fee = sellVolume * feeRate;
                        const pnl = (currentPrice - pos.entryPrice) * pos.amount - fee;
                        paperBalanceEur += (pos.marginCollateral + pnl);
                        trades.push({ timestamp, side: 'sell', price: currentPrice, reason: 'Take Profit', profit: pnl });
                        pos = { entryPrice: 0, amount: 0, highestPriceSinceEntry: 0, dcaLevel: 0, marginCollateral: 0, liquidationPrice: 0 };
                        actionTaken = true;
                    }
                }

                // DCA
                if (!actionTaken && this.config.dcaLevels > 0 && pos.dcaLevel < this.config.dcaLevels) {
                    const dcaTargetPrice = pos.entryPrice * (1 - (this.config.dcaDropPercentage / 100));
                    if (currentPrice <= dcaTargetPrice) {
                        let baseTradeSize = this.config.tradeSizeEur;
                        if (this.config.compoundProfits) {
                            // Since we have an open position, we estimate total portfolio value roughly to calculate next DCA
                            const currentPnl = (currentPrice - pos.entryPrice) * pos.amount;
                            const estimatedPortfolio = paperBalanceEur + pos.marginCollateral + currentPnl;
                            baseTradeSize = estimatedPortfolio * (this.config.tradeSizeEur / 1000);
                        }
                        const tradeSizeEur = baseTradeSize / (1 + this.config.dcaLevels);
                        
                        const volumeEur = tradeSizeEur * leverage;
                        const fee = volumeEur * feeRate;

                        if (paperBalanceEur >= tradeSizeEur + fee) {
                            const amountToBuy = volumeEur / currentPrice;
                            paperBalanceEur -= (tradeSizeEur + fee);
                            
                            const totalAmount = pos.amount + amountToBuy;
                            const totalCost = (pos.amount * pos.entryPrice) + (amountToBuy * currentPrice);
                            
                            pos.entryPrice = totalCost / totalAmount;
                            pos.amount = totalAmount;
                            pos.marginCollateral += tradeSizeEur;
                            pos.highestPriceSinceEntry = Math.max(pos.highestPriceSinceEntry, currentPrice);
                            pos.dcaLevel += 1;
                            
                            // Recalculate Liquidation
                            pos.liquidationPrice = pos.entryPrice * (1 - (1 / leverage)) * 1.01;

                            trades.push({ timestamp, side: 'buy', price: currentPrice, reason: 'DCA', profit: null });
                            actionTaken = true;
                        }
                    }
                }
            }

            if (!actionTaken) {
                const signal = strategy.analyze(currentSlice, macroSlice);
                if (signal === 'BUY' && pos.entryPrice === 0) {
                    let baseTradeSize = this.config.tradeSizeEur;
                    if (this.config.compoundProfits) {
                        baseTradeSize = paperBalanceEur * (this.config.tradeSizeEur / 1000);
                    }
                    
                    let tradeSizeEur = baseTradeSize;
                    if (this.config.dcaLevels > 0) tradeSizeEur = tradeSizeEur / (1 + this.config.dcaLevels);
                    
                    const volumeEur = tradeSizeEur * leverage;
                    const fee = volumeEur * feeRate;
                    
                    if (paperBalanceEur >= tradeSizeEur + fee) {
                        const amountToBuy = volumeEur / currentPrice;
                        paperBalanceEur -= (tradeSizeEur + fee);
                        
                        pos.entryPrice = currentPrice;
                        pos.amount = amountToBuy;
                        pos.marginCollateral = tradeSizeEur;
                        pos.highestPriceSinceEntry = currentPrice;
                        pos.liquidationPrice = currentPrice * (1 - (1 / leverage)) * 1.01;

                        trades.push({ timestamp, side: 'buy', price: currentPrice, reason: 'Strategy', profit: null });
                    }
                } else if (signal === 'SELL' && pos.amount > 0) {
                    const sellVolume = pos.amount * currentPrice;
                    const fee = sellVolume * feeRate;
                    const pnl = (currentPrice - pos.entryPrice) * pos.amount - fee;
                    paperBalanceEur += (pos.marginCollateral + pnl);
                    trades.push({ timestamp, side: 'sell', price: currentPrice, reason: 'Strategy', profit: pnl });
                    pos = { entryPrice: 0, amount: 0, highestPriceSinceEntry: 0, dcaLevel: 0, marginCollateral: 0, liquidationPrice: 0 };
                }
            }
        }

        // Calculate Stats
        const closedTrades = trades.filter(t => t.side === 'sell');
        const profitableTrades = closedTrades.filter(t => t.profit > 0);
        const winRate = closedTrades.length > 0 ? (profitableTrades.length / closedTrades.length) * 100 : 0;
        
        // Final portfolio value
        let finalPortfolioValue = paperBalanceEur;
        if (pos.amount > 0) {
            const currentPrice = ohlcv[ohlcv.length - 1][4];
            const pnl = (currentPrice - pos.entryPrice) * pos.amount;
            finalPortfolioValue += (pos.marginCollateral + pnl);
        }
        
        const totalProfit = finalPortfolioValue - 1000;

        return {
            success: true,
            trades,
            stats: {
                totalTrades: trades.length,
                closedTrades: closedTrades.length,
                winRate: winRate.toFixed(2),
                finalPortfolioValue: finalPortfolioValue.toFixed(2),
                totalProfit: totalProfit.toFixed(2),
                periodStart: new Date(ohlcv[50][0]).toISOString(),
                periodEnd: new Date(ohlcv[ohlcv.length - 1][0]).toISOString()
            }
        };
    }
}
