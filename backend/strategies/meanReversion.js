import { RSI, BollingerBands, VWAP } from 'technicalindicators';

export class MeanReversionStrategy {
    constructor(config) {
        this.config = config;
        this.lastSignal = 'NONE';
        this.lastReasoning = 'Waiting for analysis...';
    }

    analyze(ohlcv, ohlcvMacro = []) {
        if (ohlcv.length < 20) {
            this.lastReasoning = 'Not enough data for Mean Reversion (need 20 candles).';
            return 'NONE';
        }

        const closePrices = ohlcv.map(c => c[4]);
        
        // 1. RSI for extreme conditions
        const rsiResult = RSI.calculate({ period: 14, values: closePrices });
        const rsi = rsiResult[rsiResult.length - 1];

        // 2. Bollinger Bands to identify statistical extremes
        const bbResult = BollingerBands.calculate({ period: 20, stdDev: 2, values: closePrices });
        const bb = bbResult[bbResult.length - 1];

        // 3. VWAP as the "Mean" target
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

        if (!bb || !vwap || !rsi) {
            this.lastReasoning = 'Calculating indicators...';
            return 'NONE';
        }

        // Mean Reversion Rules
        const isDeepOversold = rsi < 30;
        const isBelowLowerBand = currentPrice < bb.lower;
        
        const isOverbought = rsi > 70;
        const isAboveVWAP = currentPrice > vwap;
        const isAboveUpperBand = currentPrice > bb.upper;

        if (isDeepOversold && isBelowLowerBand) {
            this.lastReasoning = `🟢 Mean Reversion BUY: Price (${currentPrice.toFixed(2)}) pierced Lower Band (${bb.lower.toFixed(2)}) and RSI is oversold (${rsi.toFixed(2)}).`;
            if (this.lastSignal !== 'BUY') {
                this.lastSignal = 'BUY';
                return 'BUY';
            }
        } else if (isOverbought || isAboveUpperBand) {
            this.lastReasoning = `🔴 Mean Reversion SELL: Price reverted to extreme high (RSI: ${rsi.toFixed(2)}, Upper Band: ${bb.upper.toFixed(2)}).`;
            if (this.lastSignal !== 'SELL') {
                this.lastSignal = 'SELL';
                return 'SELL';
            }
        } else {
            this.lastReasoning = `🟡 Holding: Waiting for extreme deviation from the mean. (Price: ${currentPrice.toFixed(2)}, VWAP: ${vwap.toFixed(2)}, RSI: ${rsi.toFixed(2)})`;
        }

        return 'NONE';
    }
}
