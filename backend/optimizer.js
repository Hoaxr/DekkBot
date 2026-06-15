import ccxt from 'ccxt';
import { Backtester } from './backtester.js';

export class Optimizer {
    constructor(baseConfig) {
        this.baseConfig = baseConfig;
        this.exchange = new ccxt.kraken({ enableRateLimit: true });
        
        // Grid Search Parameters
        this.grid = {
            strategy: ['rsi', 'mean_reversion', 'confluence_quant'],
            takeProfitPercentage: [0, 1.5, 3, 5],
            trailingStopPercentage: [0, 1.5, 3, 5],
            dcaLevels: [0, 2],
            dcaDropPercentage: [1.5, 3]
        };
    }

    async run() {
        console.log(`Starting Optimizer for ${this.baseConfig.symbol} on ${this.baseConfig.timeframe}...`);
        
        // 1. Fetch data ONCE
        let ohlcv = [];
        const timeframeMs = this.exchange.parseTimeframe(this.baseConfig.timeframe) * 1000;
        let since = Date.now() - (10000 * timeframeMs);
        
        while (ohlcv.length < 10000) {
            const limit = Math.min(720, 10000 - ohlcv.length);
            const chunk = await this.exchange.fetchOHLCV(this.baseConfig.symbol, this.baseConfig.timeframe, since, limit);
            if (chunk.length === 0) break;
            ohlcv = ohlcv.concat(chunk);
            since = chunk[chunk.length - 1][0] + timeframeMs;
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (ohlcv.length < 50) throw new Error("Not enough historical data to optimize.");

        let ohlcvMacro = [];
        if (this.baseConfig.timeframe !== '15m' && this.baseConfig.timeframe !== '1h' && this.baseConfig.timeframe !== '1d') {
            const macroTimeframeMs = this.exchange.parseTimeframe('15m') * 1000;
            let sinceMacro = ohlcv[0][0];
            const numMacroCandles = Math.ceil((ohlcv[ohlcv.length-1][0] - ohlcv[0][0]) / macroTimeframeMs) + 100;
            
            while (ohlcvMacro.length < numMacroCandles) {
                const limit = Math.min(720, numMacroCandles - ohlcvMacro.length);
                const chunk = await this.exchange.fetchOHLCV(this.baseConfig.symbol, '15m', sinceMacro, limit);
                if (chunk.length === 0) break;
                ohlcvMacro = ohlcvMacro.concat(chunk);
                sinceMacro = chunk[chunk.length - 1][0] + macroTimeframeMs;
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        console.log(`Fetched 10,000 candles. Generating combinations...`);

        // 2. Generate combinations
        const combinations = [];
        for (const strategy of this.grid.strategy) {
            for (const tp of this.grid.takeProfitPercentage) {
                for (const ts of this.grid.trailingStopPercentage) {
                    for (const dca of this.grid.dcaLevels) {
                        for (const drop of this.grid.dcaDropPercentage) {
                            if (dca === 0 && drop !== this.grid.dcaDropPercentage[0]) continue; // avoid duplicates if dca is 0
                            combinations.push({
                                ...this.baseConfig,
                                strategy,
                                takeProfitPercentage: tp,
                                trailingStopPercentage: ts,
                                dcaLevels: dca,
                                dcaDropPercentage: drop,
                                prefetchedOhlcv: ohlcv,
                                prefetchedOhlcvMacro: ohlcvMacro,
                                exchangeInstance: this.exchange
                            });
                        }
                    }
                }
            }
        }

        console.log(`Evaluating ${combinations.length} configurations offline...`);

        // 3. Evaluate all
        let bestResult = null;
        let bestProfit = -Infinity;

        // Process sequentially to not block event loop entirely
        for (let i = 0; i < combinations.length; i++) {
            const config = combinations[i];
            const backtester = new Backtester(config);
            try {
                const result = await backtester.run();
                const totalProfit = parseFloat(result.stats.totalProfit);
                
                if (totalProfit > bestProfit) {
                    bestProfit = totalProfit;
                    bestResult = { config, result };
                }
            } catch (e) {
                console.error("Optimization iteration failed:", e.message);
            }
        }

        // Clean up prefetched data before returning to avoid massive payload
        if (bestResult) {
            delete bestResult.config.prefetchedOhlcv;
            delete bestResult.config.prefetchedOhlcvMacro;
            delete bestResult.config.exchangeInstance;
        }

        return bestResult;
    }
}
