import { SMA, EMA, RSI, MACD, VWAP } from 'technicalindicators';

export class ConfluenceQuantStrategy {
    constructor(config) {
        this.config = config;
        this.lastSignal = 'NONE';
        this.lastReasoning = 'Waiting for analysis...';
    }

    analyze(ohlcv, ohlcvMacro = []) {
        if (ohlcv.length < 30) {
            this.lastReasoning = 'Not enough data for Confluence Strategy (need 30 candles).';
            return 'NONE';
        }

        const closePrices = ohlcv.map(c => c[4]);
        
        // 1. Trend Direction via EMA
        const ema9Result = EMA.calculate({ period: 9, values: closePrices });
        const ema21Result = EMA.calculate({ period: 21, values: closePrices });
        const ema9 = ema9Result[ema9Result.length - 1];
        const ema21 = ema21Result[ema21Result.length - 1];
        
        // 2. Momentum via MACD
        const macdResult = MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: closePrices, SimpleMAOscillator: false, SimpleMASignal: false });
        const macd = macdResult[macdResult.length - 1];

        // 3. Overbought/Oversold via RSI
        const rsiResult = RSI.calculate({ period: 14, values: closePrices });
        const rsi = rsiResult[rsiResult.length - 1];

        // 4. Volume Confirmation via VWAP
        // technicalindicators VWAP expects an array of objects
        const vwapInput = ohlcv.map(c => ({
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5]
        }));
        const vwapResult = VWAP.calculate({
            high: vwapInput.map(v => v.high),
            low: vwapInput.map(v => v.low),
            close: vwapInput.map(v => v.close),
            volume: vwapInput.map(v => v.volume)
        });
        const vwap = vwapResult[vwapResult.length - 1];
        
        const currentPrice = closePrices[closePrices.length - 1];

        // Confluence Rules
        const isBullishTrend = ema9 > ema21;
        const isBullishMomentum = macd.histogram > 0 && macd.MACD > macd.signal;
        const isNotOverbought = rsi < 70;
        const isAboveVWAP = currentPrice > vwap;

        const isBearishTrend = ema9 < ema21;
        const isBearishMomentum = macd.histogram < 0 && macd.MACD < macd.signal;
        const isNotOversold = rsi > 30;
        const isBelowVWAP = currentPrice < vwap;

        if (isBullishTrend && isBullishMomentum && isNotOverbought && isAboveVWAP) {
            this.lastReasoning = `🟢 Confluence BUY: Trend UP (EMA9 > EMA21), Momentum UP (MACD > Signal), RSI (${rsi.toFixed(2)}) not overbought, Price > VWAP.`;
            if (this.lastSignal !== 'BUY') {
                this.lastSignal = 'BUY';
                return 'BUY';
            }
        } else if (isBearishTrend && isBearishMomentum && isNotOversold && isBelowVWAP) {
            this.lastReasoning = `🔴 Confluence SELL: Trend DOWN (EMA9 < EMA21), Momentum DOWN (MACD < Signal), RSI (${rsi.toFixed(2)}) not oversold, Price < VWAP.`;
            if (this.lastSignal !== 'SELL') {
                this.lastSignal = 'SELL';
                return 'SELL';
            }
        } else {
            this.lastReasoning = `🟡 Holding: Waiting for confluence. (Trend: ${isBullishTrend ? 'UP' : 'DOWN'}, MACD Hist: ${macd.histogram.toFixed(2)}, RSI: ${rsi.toFixed(2)})`;
        }

        return 'NONE';
    }
}
