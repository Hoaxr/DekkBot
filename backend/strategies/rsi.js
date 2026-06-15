import { rsi } from 'technicalindicators';

export class RSIStrategy {
    constructor(config) {
        this.config = config;
        this.period = 14;
        this.overbought = 70;
        this.oversold = 30;
        this.lastSignal = 'NONE';
        this.lastReasoning = 'Waiting for analysis...';
    }

    analyze(ohlcv) {
        if (ohlcv.length < this.period + 1) return 'NONE';
        
        const closePrices = ohlcv.map(candle => candle[4]);
        const rsiValues = rsi({ period: this.period, values: closePrices });
        
        if (rsiValues.length === 0) {
            this.lastReasoning = 'Not enough data to calculate RSI.';
            return 'NONE';
        }
        
        const currentRSI = rsiValues[rsiValues.length - 1];
        console.log(`RSI: ${currentRSI.toFixed(2)}`);

        if (currentRSI < this.oversold) {
            this.lastReasoning = `🟢 Oversold conditions detected (RSI: ${currentRSI.toFixed(2)}). Bullish reversal likely.`;
            if (this.lastSignal !== 'BUY') {
                this.lastSignal = 'BUY';
                return 'BUY';
            }
        } else if (currentRSI > this.overbought) {
            this.lastReasoning = `🔴 Overbought conditions detected (RSI: ${currentRSI.toFixed(2)}). Bearish reversal likely.`;
            if (this.lastSignal !== 'SELL') {
                this.lastSignal = 'SELL';
                return 'SELL';
            }
        } else {
            this.lastReasoning = `🟡 RSI (${currentRSI.toFixed(2)}) is in neutral territory. Waiting for extreme conditions.`;
        }

        return 'NONE';
    }
}
