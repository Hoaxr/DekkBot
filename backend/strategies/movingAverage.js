export class MovingAverageStrategy {
    constructor(config) {
        this.config = config;
        this.shortPeriod = 9;
        this.longPeriod = 21;
        this.lastSignal = 'NONE';
        this.lastReasoning = 'Waiting for analysis...';
    }

    calculateSMA(data, period) {
        if (data.length < period) return null;
        const slice = data.slice(data.length - period);
        const sum = slice.reduce((acc, val) => acc + val[4], 0);
        return sum / period;
    }

    analyze(ohlcv) {
        const shortSMA = this.calculateSMA(ohlcv, this.shortPeriod);
        const longSMA = this.calculateSMA(ohlcv, this.longPeriod);

        if (!shortSMA || !longSMA) {
            this.lastReasoning = 'Not enough data for SMA calculation.';
            return 'NONE';
        }

        console.log(`SMA: Short=${shortSMA.toFixed(2)}, Long=${longSMA.toFixed(2)}`);

        if (shortSMA > longSMA) {
            this.lastReasoning = `🟢 Bullish Crossover: Short SMA (${shortSMA.toFixed(2)}) crossed above Long SMA (${longSMA.toFixed(2)}).`;
            if (this.lastSignal !== 'BUY') {
                this.lastSignal = 'BUY';
                return 'BUY';
            }
        } else if (shortSMA < longSMA) {
            this.lastReasoning = `🔴 Bearish Crossover: Short SMA (${shortSMA.toFixed(2)}) crossed below Long SMA (${longSMA.toFixed(2)}).`;
            if (this.lastSignal !== 'SELL') {
                this.lastSignal = 'SELL';
                return 'SELL';
            }
        } else {
            this.lastReasoning = `⚪ Holding: Short SMA (${shortSMA.toFixed(2)}) and Long SMA (${longSMA.toFixed(2)}) are aligned.`;
        }

        return 'NONE';
    }
}
