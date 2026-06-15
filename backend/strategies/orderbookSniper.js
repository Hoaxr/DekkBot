export class OrderbookSniperStrategy {
    constructor(config) {
        this.config = config;
        this.lastSignal = 'NONE';
        this.lastReasoning = 'Waiting for orderbook data...';
    }

    analyze(ohlcv, context) {
        if (!context || !context.orderbook || !context.orderbook.bids || context.orderbook.bids.length === 0 || context.orderbook.asks.length === 0) {
            this.lastReasoning = 'Missing or empty orderbook data.';
            return 'NONE';
        }

        const bids = context.orderbook.bids;
        const asks = context.orderbook.asks;

        // Calculate total bid volume and total ask volume in the available levels
        const totalBidVolume = bids.reduce((acc, val) => acc + val[1], 0);
        const totalAskVolume = asks.reduce((acc, val) => acc + val[1], 0);

        // Imbalance Ratio (e.g. 3.0 means 3x more buy volume than sell volume)
        const imbalance = totalBidVolume / (totalAskVolume === 0 ? 1 : totalAskVolume);

        const currentPrice = ohlcv[ohlcv.length - 1][4];
        const mlTrend = context.mlPrediction || 'NEUTRAL'; 

        // SNIPER RULES
        // If there is 3x more bid volume than ask volume, there is a massive buy wall.
        if (imbalance > 3.0 && mlTrend !== 'BEARISH') {
            this.lastReasoning = `🟢 SNIPER BUY: Massive Bid Wall detected (Imbalance: ${imbalance.toFixed(2)}x). Buy volume ${totalBidVolume.toFixed(2)} vs Ask ${totalAskVolume.toFixed(2)}.`;
            if (this.lastSignal !== 'BUY') {
                this.lastSignal = 'BUY';
                return 'BUY';
            }
        } 
        // If there is 3x more ask volume, massive sell wall.
        else if (imbalance < 0.33 && mlTrend !== 'BULLISH') {
            this.lastReasoning = `🔴 SNIPER SELL: Massive Ask Wall detected (Imbalance: ${imbalance.toFixed(2)}x). Sell volume ${totalAskVolume.toFixed(2)} vs Bid ${totalBidVolume.toFixed(2)}.`;
            if (this.lastSignal !== 'SELL') {
                this.lastSignal = 'SELL';
                return 'SELL';
            }
        } else {
            this.lastReasoning = `🟡 Holding: Orderbook balanced (Imbalance: ${imbalance.toFixed(2)}x).`;
        }

        return 'NONE';
    }
}
