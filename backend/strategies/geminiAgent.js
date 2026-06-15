import { GoogleGenerativeAI } from "@google/generative-ai";
import { SMA, EMA, RSI, MACD, BollingerBands, StochasticRSI, ATR, ADX } from 'technicalindicators';

export class GeminiAgentStrategy {
    constructor(config) {
        this.config = config;
        this.genAI = null;
        if (config.geminiApiKey) {
            this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
        }
        this.lastSignal = 'NONE';
        this.lastReasoning = 'Waiting for AI analysis...';
        this.lastApiCall = 0;
    }

    static globalLastApiCall = 0;

    async analyze(ohlcv, context = {}) {
        const { multiTimeframeData = {}, orderbook = {bids:[], asks:[]}, sentiment = null, mlPrediction = null } = context;
        if (!this.genAI) {
            console.warn("Gemini API Key missing! Returning hold.");
            this.lastReasoning = "Error: Gemini API Key is missing! Please paste it in the configuration panel and click Apply.";
            return 'NONE';
        }

        if (ohlcv.length < 10) {
            this.lastReasoning = "Error: Not enough market data yet to analyze (need at least 10 candles).";
            return 'NONE';
        }

        // Gemini has free tier rate limits (15 RPM / 1500 RPD). Let's be very conservative.
        // 1. Per-coin cooldown: Only call every 15 minutes (900,000 ms) max per coin.
        const now = Date.now();
        if (now - this.lastApiCall < 900000) {
            return 'NONE'; // Wait before querying again
        }

        // 2. Global cooldown: Stagger calls across different coins by 10 seconds.
        if (now - GeminiAgentStrategy.globalLastApiCall < 10000) {
            return 'NONE'; 
        }

        this.lastApiCall = now;
        GeminiAgentStrategy.globalLastApiCall = now;

        // Extract last 10 candles
        const recentCandles = ohlcv.slice(-10).map(c => ({
            time: new Date(c[0]).toISOString(),
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5]
        }));

        // Calculate technical indicators
        const closePrices = ohlcv.map(c => c[4]);
        const highPrices = ohlcv.map(c => c[2]);
        const lowPrices = ohlcv.map(c => c[3]);

        const currentSma = closePrices.length >= 10 ? SMA.calculate({ period: 10, values: closePrices }).pop() : 'N/A';
        const currentEma9 = closePrices.length >= 9 ? EMA.calculate({ period: 9, values: closePrices }).pop() : 'N/A';
        const currentEma21 = closePrices.length >= 21 ? EMA.calculate({ period: 21, values: closePrices }).pop() : 'N/A';
        
        const currentRsi = closePrices.length >= 15 ? RSI.calculate({ period: 14, values: closePrices }).pop() : 'N/A';
        const macdResult = closePrices.length >= 30 ? MACD.calculate({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, values: closePrices, SimpleMAOscillator: false, SimpleMASignal: false }).pop() : 'N/A';
        
        const bbResult = closePrices.length >= 20 ? BollingerBands.calculate({ period: 20, values: closePrices, stdDev: 2 }).pop() : 'N/A';
        const stochRsiResult = closePrices.length >= 20 ? StochasticRSI.calculate({ values: closePrices, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 }).pop() : 'N/A';
        const atrResult = closePrices.length >= 15 ? ATR.calculate({ high: highPrices, low: lowPrices, close: closePrices, period: 14 }).pop() : 'N/A';
        const adxResult = closePrices.length >= 30 ? ADX.calculate({ high: highPrices, low: lowPrices, close: closePrices, period: 14 }).pop() : 'N/A';

        let multiTimeframeContext = "";
        const mtfKeys = Object.keys(multiTimeframeData);
        if (mtfKeys.length > 0) {
            multiTimeframeContext = "MULTI-TIMEFRAME CONFLUENCE MATRIX:\n";
            for (const tf of mtfKeys) {
                const tfData = multiTimeframeData[tf];
                if (tfData && tfData.length >= 15) {
                    const tfClose = tfData.map(c => c[4]);
                    const tfSma = SMA.calculate({ period: 10, values: tfClose }).pop() || 'N/A';
                    const tfRsi = RSI.calculate({ period: 14, values: tfClose }).pop() || 'N/A';
                    const lastPrice = tfClose[tfClose.length - 1];
                    let trend = "NEUTRAL";
                    if (tfSma !== 'N/A') {
                        trend = lastPrice > tfSma ? "BULLISH" : "BEARISH";
                    }
                    multiTimeframeContext += `- ${tf}: Trend=${trend} (SMA10: ${typeof tfSma === 'number' ? tfSma.toFixed(2) : tfSma}), RSI=${typeof tfRsi === 'number' ? tfRsi.toFixed(2) : tfRsi}\n`;
                }
            }
            multiTimeframeContext += "Analyze the confluence across these timeframes. Strong trends appear on higher timeframes (1h, 4h, 1d) while entries should be timed on lower timeframes (1m, 5m, 15m).\n";
        }

        let orderbookContext = "";
        if (orderbook.bids && orderbook.bids.length > 0) {
            orderbookContext = `
ORDERBOOK DEPTH (Support/Resistance Walls):
- Top 3 Bids (Support): ${orderbook.bids.slice(0,3).map(b => `${b[0]} (vol:${b[1]})`).join(', ')}
- Top 3 Asks (Resistance): ${orderbook.asks.slice(0,3).map(a => `${a[0]} (vol:${a[1]})`).join(', ')}
`;
        }

        let sentimentContext = "";
        if (sentiment) {
            sentimentContext = `
GLOBAL MARKET SENTIMENT (Fear & Greed):
- Score: ${sentiment.value}/100 (${sentiment.classification})
Avoid buying into extreme greed, look for entries during fear.
`;
        }

        let mlContext = "";
        if (mlPrediction) {
            mlContext = `
ML STATISTICAL PREDICTION:
- Prediction: ${mlPrediction.prediction} (Probability: ${mlPrediction.probability}%)
- Slope momentum: ${mlPrediction.slope}
`;
        }

        const prompt = `You are an Alpha Quant, an elite institutional cryptocurrency algorithmic trading AI.
Your sole objective is to maximize profit and rigorously protect capital by analyzing short-term price action and a vast array of technical indicators.
Here are the last 10 OHLCV (Open, High, Low, Close, Volume) candles for ${this.config.symbol} on a ${this.config.timeframe} timeframe:

${JSON.stringify(recentCandles, null, 2)}

Current Technical Indicators (${this.config.timeframe}):
- Trend/Momentum: 10-SMA: ${currentSma !== 'N/A' ? currentSma.toFixed(2) : 'N/A'}, 9-EMA: ${currentEma9 !== 'N/A' ? currentEma9.toFixed(2) : 'N/A'}, 21-EMA: ${currentEma21 !== 'N/A' ? currentEma21.toFixed(2) : 'N/A'}
- Oscillators: 14-RSI: ${currentRsi !== 'N/A' ? currentRsi.toFixed(2) : 'N/A'}, StochRSI: ${stochRsiResult !== 'N/A' ? JSON.stringify(stochRsiResult) : 'N/A'}, MACD: ${macdResult !== 'N/A' ? JSON.stringify(macdResult) : 'N/A'}
- Volatility/Bands: Bollinger Bands (20,2): ${bbResult !== 'N/A' ? JSON.stringify(bbResult) : 'N/A'}, ATR (14): ${atrResult !== 'N/A' ? atrResult.toFixed(2) : 'N/A'}
- Trend Strength: ADX (14): ${adxResult !== 'N/A' ? JSON.stringify(adxResult) : 'N/A'}
${multiTimeframeContext}
${orderbookContext}
${sentimentContext}
${mlContext}

CRITICAL INSTITUTIONAL TRADING RULES:
1. CONFLUENCE REQUIRED: Never trade based on a single indicator. Require at least 3 indicators to align (e.g., Price at Lower BB + StochRSI Oversold + Bullish MACD Divergence).
2. MARKET STRUCTURE: Identify Higher Highs (HH) and Higher Lows (HL) for uptrends before buying. Identify Lower Highs (LH) and Lower Lows (LL) for downtrends before selling.
3. CHOP-AVOIDANCE: If the ADX indicates the market is moving sideways with low volatility (ADX < 20 or narrow Bollinger Bands), you MUST output HOLD to prevent whip-saw losses.
4. Capital preservation is priority #1. If there is no clear, high-probability setup, output HOLD.

Analyze the market structure, volatility, and momentum using these rules.
You MUST respond with a JSON object exactly like this:
{
  "decision": "BUY", // or "SELL" or "HOLD"
  "reasoning": "A concise 1-2 sentence quantitative explanation of your confluence logic, market structure analysis, and why this is a high-probability decision."
}
Do not include any markdown formatting around the JSON, just output the raw JSON object.`;

        try {
            console.log("[GeminiAgent] Asking Gemini for decision...");
            const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();
            
            // Clean up any potential markdown formatting the AI might add
            const cleanJson = responseText.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const parsed = JSON.parse(cleanJson);
            
            this.lastReasoning = parsed.reasoning || 'No reasoning provided.';
            const decision = (parsed.decision || 'HOLD').toUpperCase();
            
            console.log(`[GeminiAgent] Gemini decided: ${decision}`);
            
            if (decision === 'BUY') {
                this.lastSignal = 'BUY';
                return 'BUY';
            }
            if (decision === 'SELL') {
                this.lastSignal = 'SELL';
                return 'SELL';
            }
            return 'NONE';
        } catch (error) {
            console.error("Gemini API Error:", error.message);
            
            if (error.message.includes('429')) {
                this.lastReasoning = `Error 429: Quota exceeded. The bot will automatically retry in 15 minutes to respect rate limits.`;
                // Force a cooldown so we don't spam the API with failing requests
                this.lastApiCall = Date.now(); 
            } else if (error.message.includes('404')) {
                try {
                    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.geminiApiKey}`);
                    const data = await res.json();
                    if (data.models) {
                        const availableModels = data.models.map(m => m.name.replace('models/', '')).filter(n => n.includes('gemini')).join(', ');
                        this.lastReasoning = `Error: Model not found. But your key HAS access to: ${availableModels}`;
                    } else {
                        this.lastReasoning = `Error: 404, and could not list models. Is the API key valid? ${JSON.stringify(data)}`;
                    }
                } catch (e) {
                    this.lastReasoning = `Error: ${error.message}`;
                }
            } else {
                this.lastReasoning = `Error: ${error.message}`;
            }
            return 'NONE';
        }
    }
}
