import ccxt from 'ccxt';
async function test() {
    const exchange = new ccxt.kraken();
    let ohlcv = [];
    const timeframe = '1h';
    // 1h in ms = 60 * 60 * 1000 = 3600000
    let since = exchange.milliseconds() - (10000 * 3600000);
    console.log("Fetching since:", new Date(since));
    try {
        const candles = await exchange.fetchOHLCV('BTC/EUR', timeframe, since, 720);
        console.log("Fetched", candles.length, "candles.");
        if (candles.length > 0) {
            console.log("First:", new Date(candles[0][0]));
            console.log("Last:", new Date(candles[candles.length-1][0]));
        }
    } catch(e) { console.error(e); }
}
test();
