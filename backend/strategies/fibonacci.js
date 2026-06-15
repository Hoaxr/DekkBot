export class FibonacciStrategy {
    constructor(config) {
        this.config = config;
        this.lastReasoning = 'Initializing Fibonacci Golden Ratio...';
    }

    async analyze(ohlcv, context) {
        if (ohlcv.length < 50) return 'NONE';

        // Look back 50 periods to find the local high and local low
        const lookback = ohlcv.slice(-50);
        let localHigh = -Infinity;
        let localLow = Infinity;
        let highIndex = 0;
        let lowIndex = 0;

        for (let i = 0; i < lookback.length; i++) {
            const high = lookback[i][2];
            const low = lookback[i][3];
            if (high > localHigh) {
                localHigh = high;
                highIndex = i;
            }
            if (low < localLow) {
                localLow = low;
                lowIndex = i;
            }
        }

        const currentPrice = ohlcv[ohlcv.length - 1][4];
        
        // We only care about retracements if the trend was established
        // If high is after low, we are in an UPTREND. Retracement goes DOWN.
        if (highIndex > lowIndex) {
            const moveUp = localHigh - localLow;
            const fib618 = localHigh - (moveUp * 0.618);
            const fib382 = localHigh - (moveUp * 0.382);

            // If price just touched the 61.8% level and is bouncing
            // Threshold of 0.2%
            if (Math.abs(currentPrice - fib618) / fib618 < 0.002) {
                this.lastReasoning = `📐 Fibonacci 0.618 Golden Pocket Buy at ${currentPrice.toFixed(2)} (High: ${localHigh.toFixed(2)}, Low: ${localLow.toFixed(2)})`;
                return 'BUY';
            }
            this.lastReasoning = `🟡 Fib Uptrend. Support levels: 38.2% = ${fib382.toFixed(2)}, 61.8% = ${fib618.toFixed(2)}. Price: ${currentPrice.toFixed(2)}`;
            return 'WAITING';
        } 
        // If low is after high, we are in a DOWNTREND. Retracement goes UP.
        else {
            const moveDown = localHigh - localLow;
            const fib618 = localLow + (moveDown * 0.618); // Rallying to 61.8% of the drop
            const fib382 = localLow + (moveDown * 0.382);

            // If price rallies to the 61.8% and is rejected (good short/sell)
            if (Math.abs(currentPrice - fib618) / fib618 < 0.002) {
                this.lastReasoning = `📐 Fibonacci 0.618 Golden Pocket Sell at ${currentPrice.toFixed(2)} (High: ${localHigh.toFixed(2)}, Low: ${localLow.toFixed(2)})`;
                return 'SELL';
            }
            this.lastReasoning = `🟡 Fib Downtrend. Resistance levels: 38.2% = ${fib382.toFixed(2)}, 61.8% = ${fib618.toFixed(2)}. Price: ${currentPrice.toFixed(2)}`;
            return 'WAITING';
        }
    }
}
