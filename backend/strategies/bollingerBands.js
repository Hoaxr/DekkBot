import { bollingerbands } from 'technicalindicators';

export class BollingerBandsStrategy {
    constructor(config) {
        this.config = config;
        this.period = 20;
        this.stdDev = 2;
        this.lastSignal = 'NONE';
        this.lastReasoning = 'Waiting for analysis...';
    }

    analyze(ohlcv) {
        if (ohlcv.length < this.period) return 'NONE';
        
        const closePrices = ohlcv.map(candle => candle[4]);
        const bbValues = bollingerbands({ period: this.period, stdDev: this.stdDev, values: closePrices });
        
        if (bbValues.length === 0) {
            this.lastReasoning = 'Not enough data for Bollinger Bands.';
            return 'NONE';
        }

        const currentBB = bbValues[bbValues.length - 1];
        const currentPrice = closePrices[closePrices.length - 1];

        console.log(`BB: Upper=${currentBB.upper.toFixed(2)}, Lower=${currentBB.lower.toFixed(2)}`);

        if (currentPrice < currentBB.lower) {
            this.lastReasoning = `🟢 Price (${currentPrice.toFixed(2)}) is below Lower Bollinger Band (${currentBB.lower.toFixed(2)}). Mean reversion BUY signal.`;
            if (this.lastSignal !== 'BUY') {
                this.lastSignal = 'BUY';
                return 'BUY';
            }
        } else if (currentPrice > currentBB.upper) {
            this.lastReasoning = `🔴 Price (${currentPrice.toFixed(2)}) is above Upper Bollinger Band (${currentBB.upper.toFixed(2)}). Mean reversion SELL signal.`;
            if (this.lastSignal !== 'SELL') {
                this.lastSignal = 'SELL';
                return 'SELL';
            }
        } else {
            this.lastReasoning = `🟡 Price (${currentPrice.toFixed(2)}) is within the bands [${currentBB.lower.toFixed(2)} - ${currentBB.upper.toFixed(2)}]. Holding.`;
        }

        return 'NONE';
    }
}
