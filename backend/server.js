import express from 'express';
import cors from 'cors';
import { BotEngine } from './bot.js';
import { initDB, getRecentTrades, clearDB } from './db.js';
import { Backtester } from './backtester.js';
import { Optimizer } from './optimizer.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize DB and Bot
initDB();
const bot = new BotEngine();

// API Routes
app.get('/api/status', (req, res) => {
    const primarySymbol = bot.symbolsList[0] || 'BTC/EUR';
    const status = {
        isRunning: bot.isRunning,
        config: bot.config,
        reasoning: 'Waiting for AI analysis...',
        detailedReasoning: [],
        lastSignal: 'NONE',
        entryPrice: bot.positions[primarySymbol]?.entryPrice || 0,
        highestPriceSinceEntry: bot.positions[primarySymbol]?.highestPriceSinceEntry || 0,
        latestIndicators: bot.latestIndicators[primarySymbol] || {},
        positions: bot.positions
    };

    const strategy = bot.strategies[primarySymbol];
    if (strategy) {
        status.reasoning = strategy.lastReasoning;
        status.detailedReasoning = strategy.detailedReasoning || [];
        status.lastSignal = strategy.lastSignal;
        status.macroTrend = strategy.macroTrend || 'UNKNOWN';
    }

    res.json(status);
});

app.post('/api/start', async (req, res) => {
    try {
        await bot.start();
        res.json({ success: true, message: 'Bot started' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/stop', (req, res) => {
    bot.stop();
    res.json({ success: true, message: 'Bot stopped' });
});

app.get('/api/balance', async (req, res) => {
    try {
        const balance = await bot.getBalance();
        res.json({ success: true, balance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/trades', (req, res) => {
    try {
        const trades = getRecentTrades(50);
        res.json({ success: true, trades });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/clear-db', (req, res) => {
    try {
        clearDB();
        bot.positions = {};
        bot.paperBalance = { EUR: 1000 };
        res.json({ success: true, message: 'Database and state cleared' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/config', (req, res) => {
    bot.updateConfig(req.body);
    res.json({ success: true, config: bot.config });
});

app.post('/api/backtest', async (req, res) => {
    try {
        const backtester = new Backtester(req.body);
        const result = await backtester.run();
        res.json(result);
    } catch (error) {
        console.error("Backtest error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/optimize', async (req, res) => {
    try {
        const optimizer = new Optimizer(req.body);
        const bestResult = await optimizer.run();
        res.json({ success: true, bestResult });
    } catch (error) {
        console.error("Optimize error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/chart-data', async (req, res) => {
    try {
        const symbol = req.query.symbol || bot.symbolsList[0];
        const timeframe = req.query.timeframe || bot.config.timeframe || '15m';
        let ohlcv;
        try {
            ohlcv = await bot.exchange.fetchOHLCV(symbol, timeframe, undefined, 200);
        } catch (e) {
            // Fallback if exchange is not initialized yet
            ohlcv = [];
        }
        
        // ccxt returns [ [timestamp, open, high, low, close, volume], ... ]
        // lightweight-charts needs { time, open, high, low, close, volume }
        const formatted = ohlcv.map(c => ({
            time: Math.floor(c[0] / 1000),
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            value: c[5] // use 'value' for histogram series
        }));
        res.json({ success: true, data: formatted });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
});
