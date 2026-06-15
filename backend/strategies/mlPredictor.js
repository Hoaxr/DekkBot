// Simple statistical predictor using Linear Regression and Momentum 
export class MLPredictor {
    /**
     * @param {Array} ohlcv - Array of candles [time, open, high, low, close, volume]
     * @returns {Object} Prediction details containing 'prediction' (UP/DOWN/NEUTRAL) and 'probability' (0-100)
     */
    static predict(ohlcv) {
        if (!ohlcv || ohlcv.length < 10) {
            return { prediction: 'NEUTRAL', probability: 50 };
        }

        const closes = ohlcv.map(c => c[4]);
        const n = closes.length;
        
        // Linear Regression (y = mx + b)
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += closes[i];
            sumXY += i * closes[i];
            sumXX += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        // Calculate standard deviation of closes to normalize the slope
        const mean = sumY / n;
        const variance = closes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        // Normalized slope (Slope relative to price volatility)
        // If stdDev is 0, price is flat.
        const normalizedSlope = stdDev === 0 ? 0 : slope / stdDev;

        // Base probability starts at 50%
        let probability = 50;

        // Add weight based on regression slope
        probability += (normalizedSlope * 20); // Arbitrary weight multiplier for effect

        // Recent momentum check (last 3 candles vs previous 3)
        if (n >= 6) {
            const recentAvg = (closes[n-1] + closes[n-2] + closes[n-3]) / 3;
            const prevAvg = (closes[n-4] + closes[n-5] + closes[n-6]) / 3;
            if (recentAvg > prevAvg) {
                probability += 10;
            } else if (recentAvg < prevAvg) {
                probability -= 10;
            }
        }

        // Clamp between 10% and 90% (never 100% sure)
        probability = Math.max(10, Math.min(90, probability));

        let prediction = 'NEUTRAL';
        if (probability >= 60) prediction = 'UP';
        else if (probability <= 40) prediction = 'DOWN';

        return {
            prediction,
            probability: Number(probability.toFixed(2)),
            slope: Number(slope.toFixed(4))
        };
    }
}
