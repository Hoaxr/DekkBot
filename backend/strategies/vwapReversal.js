import { VWAP } from 'technicalindicators';

export class VWAPReversalStrategy {
    constructor(config) {
        this.config = config;
        this.lastReasoning = 'Initializing VWAP Institutional Reversal...';
    }

    async analyze(ohlcv, context) {
        if (ohlcv.length < 20) return 'NONE';

        const closes = ohlcv.map(c => c[4]);
        const currentPrice = closes[closes.length - 1];
        
        // VWAP needs Open, High, Low, Close, Volume
        const vwapInput = {
            open: ohlcv.map(c => c[1]),
            high: ohlcv.map(c => c[2]),
            low: ohlcv.map(c => c[3]),
            close: ohlcv.map(c => c[4]),
            volume: ohlcv.map(c => c[5])
        };

        const vwapResult = VWAP.calculate(vwapInput);
        if (vwapResult.length < 2) return 'NONE';

        const currentVwap = vwapResult[vwapResult.length - 1];
        const prevVwap = vwapResult[vwapResult.length - 2];
        const prevPrice = closes[closes.length - 2];

        // Deviation from VWAP (in percentage)
        const currentDeviation = ((currentPrice - currentVwap) / currentVwap) * 100;
        const prevDeviation = ((prevPrice - prevVwap) / prevVwap) * 100;

        // BUY: Price was significantly below VWAP (oversold) and is now recovering
        // Let's say a drop of > 0.5% below VWAP on a 1m chart is significant, and now it curled up.
        if (prevDeviation < -0.4 && currentPrice > prevPrice && currentDeviation > prevDeviation) {
            this.lastReasoning = `🟢 VWAP Buy the Dip: Price deviated ${prevDeviation.toFixed(2)}% below VWAP and is reversing up.`;
            return 'BUY';
        }

        // SELL: Price was significantly above VWAP (overbought) and is now losing momentum
        if (prevDeviation > 0.4 && currentPrice < prevPrice && currentDeviation < prevDeviation) {
            this.lastReasoning = `🔴 VWAP Reversion: Price deviated ${prevDeviation.toFixed(2)}% above VWAP and is losing momentum.`;
            return 'SELL';
        }

        this.lastReasoning = `🟡 VWAP at ${currentVwap.toFixed(2)}. Deviation: ${currentDeviation.toFixed(2)}%. No extreme institutional imbalance.`;
        return 'WAITING';
    }
}
