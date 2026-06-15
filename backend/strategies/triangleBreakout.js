export class TriangleBreakoutStrategy {
    constructor(config) {
        this.config = config;
        this.lastReasoning = 'Waiting for triangle breakout pattern...';
    }

    async analyze(ohlcv, context) {
        if (!ohlcv || ohlcv.length < 20) {
            this.lastReasoning = '🟡 Not enough data for Triangle Breakout';
            return 'NONE';
        }

        const data = ohlcv.map(c => ({
            time: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5]
        }));

        const n = data.length;
        const searchEnd = Math.max(1, n - 5); // Anchor in the past
        
        // --- RESISTANCE (Upper Bounding Line) ---
        let max1 = -Infinity, idx_max1 = 0;
        for (let i = 0; i < searchEnd; i++) {
            if (data[i].high > max1) { max1 = data[i].high; idx_max1 = i; }
        }
        
        let max_slope = -Infinity;
        for (let i = idx_max1 + 1; i < n; i++) {
            const slope = (data[i].high - max1) / (i - idx_max1);
            if (slope > max_slope) max_slope = slope;
        }
        
        // --- SUPPORT (Lower Bounding Line) ---
        let min1 = Infinity, idx_min1 = 0;
        for (let i = 0; i < searchEnd; i++) {
            if (data[i].low < min1) { min1 = data[i].low; idx_min1 = i; }
        }
        
        let min_slope = Infinity;
        for (let i = idx_min1 + 1; i < n; i++) {
            const slope = (data[i].low - min1) / (i - idx_min1);
            if (slope < min_slope) min_slope = slope;
        }
        
        // Current index is n - 1
        const currentIndex = n - 1;
        const currentClose = data[currentIndex].close;
        const previousClose = data[currentIndex - 1].close;

        // Current projected resistance and support values at n-1
        const currentResistance = max1 + max_slope * (currentIndex - idx_max1);
        const currentSupport = min1 + min_slope * (currentIndex - idx_min1);
        
        // Previous projected resistance and support values at n-2
        const prevResistance = max1 + max_slope * ((currentIndex - 1) - idx_max1);
        const prevSupport = min1 + min_slope * ((currentIndex - 1) - idx_min1);

        // Breakout Logic: 
        // We use a confirmed close over resistance or under support to trigger.
        
        if (currentClose > currentResistance && previousClose <= prevResistance) {
            this.lastReasoning = `🟢 BUY: Price (${currentClose.toFixed(2)}) broke ABOVE resistance (${currentResistance.toFixed(2)})`;
            return 'BUY';
        } else if (currentClose < currentSupport && previousClose >= prevSupport) {
            this.lastReasoning = `🔴 SELL: Price (${currentClose.toFixed(2)}) broke BELOW support (${currentSupport.toFixed(2)})`;
            return 'SELL';
        }

        // Check if approaching breakout
        const distToResistance = ((currentResistance - currentClose) / currentClose) * 100;
        const distToSupport = ((currentClose - currentSupport) / currentClose) * 100;

        if (distToResistance > 0 && distToResistance < 0.2) {
            this.lastReasoning = `🟡 Approaching Resistance Breakout (${currentResistance.toFixed(2)})`;
        } else if (distToSupport > 0 && distToSupport < 0.2) {
            this.lastReasoning = `🟡 Approaching Support Breakdown (${currentSupport.toFixed(2)})`;
        } else {
            this.lastReasoning = `🟡 Price inside Triangle. Res: ${currentResistance.toFixed(2)} | Sup: ${currentSupport.toFixed(2)}`;
        }

        return 'NONE';
    }
}
