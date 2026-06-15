import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import { RSI, EMA, BollingerBands } from 'technicalindicators';

export function Chart({ data, trades, status }) {
    const chartContainerRef = useRef(null);
    const rsiContainerRef = useRef(null);
    const chartRef = useRef(null);
    const rsiChartRef = useRef(null);
    const seriesRef = useRef(null);
    const rsiSeriesRef = useRef(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
            rightPriceScale: {
                minimumWidth: 80,
            },
            localization: {
                timeFormatter: (businessDayOrTimestamp) => {
                    const date = new Date(businessDayOrTimestamp * 1000);
                    return date.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' });
                }
            },
            width: chartContainerRef.current.clientWidth,
            height: 300,
        });

        const rsiChart = createChart(rsiContainerRef.current, {
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
            rightPriceScale: {
                minimumWidth: 80,
            },
            localization: {
                timeFormatter: (businessDayOrTimestamp) => {
                    const date = new Date(businessDayOrTimestamp * 1000);
                    return date.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' });
                }
            },
            width: rsiContainerRef.current.clientWidth,
            height: 150,
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#10b981',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });

        const smaSeries = chart.addLineSeries({
            color: 'rgba(255, 165, 0, 0.8)',
            lineWidth: 2,
            title: 'SMA 10',
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
        });

        const emaSeries = chart.addLineSeries({
            color: '#3b82f6', // blue
            lineWidth: 2,
            title: 'EMA 21',
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
        });

        const bbUpperSeries = chart.addLineSeries({
            color: 'rgba(167, 139, 250, 0.5)',
            lineWidth: 1,
            title: 'BB Upper',
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
        });

        const bbLowerSeries = chart.addLineSeries({
            color: 'rgba(167, 139, 250, 0.5)',
            lineWidth: 1,
            title: 'BB Lower',
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
        });

        const volumeSeries = chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '', // set as an overlay by setting a blank priceScaleId
        });
        
        volumeSeries.priceScale().applyOptions({
            scaleMargins: {
                top: 0.8, // highest point of the series will be at 80% from the top
                bottom: 0,
            },
        });

        const rsiSeries = rsiChart.addLineSeries({
            color: '#c084fc', // purple
            lineWidth: 2,
            title: 'RSI 14',
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
        });
        
        rsiSeries.createPriceLine({
            price: 70,
            color: 'rgba(239, 68, 68, 0.5)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
        });
        rsiSeries.createPriceLine({
            price: 30,
            color: 'rgba(16, 185, 129, 0.5)',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
        });

        // Sync crosshairs and scrolling
        chart.timeScale().subscribeVisibleLogicalRangeChange(timeRange => {
            if (timeRange) rsiChart.timeScale().setVisibleLogicalRange(timeRange);
        });
        rsiChart.timeScale().subscribeVisibleLogicalRangeChange(timeRange => {
            if (timeRange) chart.timeScale().setVisibleLogicalRange(timeRange);
        });

        chartRef.current = chart;
        rsiChartRef.current = rsiChart;

        seriesRef.current = candlestickSeries;
        rsiSeriesRef.current = rsiSeries;
        chartRef.current.smaSeries = smaSeries;
        chartRef.current.emaSeries = emaSeries;
        chartRef.current.bbUpperSeries = bbUpperSeries;
        chartRef.current.bbLowerSeries = bbLowerSeries;
        chartRef.current.volumeSeries = volumeSeries;

        const upperTrendlineSeries = chart.addLineSeries({
            color: 'rgba(239, 68, 68, 0.8)', // red for resistance
            lineWidth: 2,
            lineStyle: 0, // Solid
            title: 'Resistance',
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
        });
        chartRef.current.upperTrendlineSeries = upperTrendlineSeries;

        const lowerTrendlineSeries = chart.addLineSeries({
            color: 'rgba(16, 185, 129, 0.8)', // green for support
            lineWidth: 2,
            lineStyle: 0, // Solid
            title: 'Support',
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
        });
        chartRef.current.lowerTrendlineSeries = lowerTrendlineSeries;

        const handleResize = () => {
            if (chartContainerRef.current && rsiContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
                rsiChart.applyOptions({ width: rsiContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            rsiChart.remove();
        };
    }, []);

    useEffect(() => {
        if (seriesRef.current && data.length > 0) {
            seriesRef.current.setData(data);

            if (chartRef.current && chartRef.current.volumeSeries) {
                const volumeData = data.map(d => ({
                    time: d.time,
                    value: d.value,
                    color: d.close >= d.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
                }));
                chartRef.current.volumeSeries.setData(volumeData);
            }

            const smaData = [];
            for (let i = 0; i < data.length; i++) {
                if (i < 9) continue;
                let sum = 0;
                for (let j = 0; j < 10; j++) {
                    sum += data[i - j].close;
                }
                smaData.push({ time: data[i].time, value: sum / 10 });
            }
            if (chartRef.current && chartRef.current.smaSeries) {
                chartRef.current.smaSeries.setData(smaData);
            }

            const closes = data.map(d => d.close);
            
            if (chartRef.current.emaSeries) {
                const emaValues = EMA.calculate({ period: 21, values: closes });
                const emaData = [];
                const offset = data.length - emaValues.length;
                for (let i = 0; i < data.length; i++) {
                    if (i >= offset) {
                        emaData.push({ time: data[i].time, value: emaValues[i - offset] });
                    }
                }
                chartRef.current.emaSeries.setData(emaData);
            }

            if (chartRef.current.bbUpperSeries && chartRef.current.bbLowerSeries) {
                const bbValues = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
                const bbUpperData = [];
                const bbLowerData = [];
                const offset = data.length - bbValues.length;
                for (let i = 0; i < data.length; i++) {
                    if (i >= offset) {
                        bbUpperData.push({ time: data[i].time, value: bbValues[i - offset].upper });
                        bbLowerData.push({ time: data[i].time, value: bbValues[i - offset].lower });
                    }
                }
                chartRef.current.bbUpperSeries.setData(bbUpperData);
                chartRef.current.bbLowerSeries.setData(bbLowerData);
            }

            if (rsiSeriesRef.current) {
                const rsiValues = RSI.calculate({ values: closes, period: 14 });
                
                const rsiData = [];
                // RSI output length is input length - period
                const offset = data.length - rsiValues.length;
                for (let i = 0; i < data.length; i++) {
                    if (i < offset) {
                        rsiData.push({ time: data[i].time }); // Whitespace data to align time scale
                    } else {
                        rsiData.push({ time: data[i].time, value: rsiValues[i - offset] });
                    }
                }
                rsiSeriesRef.current.setData(rsiData);
            }

            // Add volume data
            if (chartRef.current && chartRef.current.volumeSeries) {
                const volumeData = data.map(d => ({
                    time: d.time,
                    value: d.value || 0, // backend c[5] is volume
                    color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                }));
                chartRef.current.volumeSeries.setData(volumeData);
            }

            // Calculate and add ZigZag Structural Trendlines (True Triangles/Wedges)
            if (chartRef.current && chartRef.current.upperTrendlineSeries && data.length > 20) {
                const n = data.length;
                
                // 1. Calculate dynamic deviation threshold based on visible chart range
                let chartMax = -Infinity, chartMin = Infinity;
                for (let i = 0; i < n; i++) {
                    if (data[i].high > chartMax) chartMax = data[i].high;
                    if (data[i].low < chartMin) chartMin = data[i].low;
                }
                // 10% of visible range as the minimum retrace to confirm a structural pivot
                const dev = (chartMax - chartMin) * 0.10; 

                // 2. ZigZag Algorithm to find confirmed structural pivots
                const pivots = [];
                let state = 0; // 1 for seeking low, -1 for seeking high
                let lastExtreme = { index: 0, val: data[0].close, type: 0 };

                for (let i = 1; i < n; i++) {
                    const h = data[i].high;
                    const l = data[i].low;

                    if (state === 0) {
                        if (h > lastExtreme.val + dev) {
                            state = -1; 
                            lastExtreme = { index: i, val: h, type: 1 };
                        } else if (l < lastExtreme.val - dev) {
                            state = 1; 
                            lastExtreme = { index: i, val: l, type: -1 };
                        }
                    } else if (state === -1) { // seeking high
                        if (h > lastExtreme.val) {
                            lastExtreme = { index: i, val: h, type: 1 };
                        } else if (h < lastExtreme.val - dev) {
                            // Price retraced downwards by dev threshold! High is confirmed.
                            pivots.push(lastExtreme);
                            state = 1;
                            lastExtreme = { index: i, val: l, type: -1 };
                        }
                    } else if (state === 1) { // seeking low
                        if (l < lastExtreme.val) {
                            lastExtreme = { index: i, val: l, type: -1 };
                        } else if (l > lastExtreme.val + dev) {
                            // Price retraced upwards by dev threshold! Low is confirmed.
                            pivots.push(lastExtreme);
                            state = -1;
                            lastExtreme = { index: i, val: h, type: 1 };
                        }
                    }
                }

                const pivotHighs = pivots.filter(p => p.type === 1);
                const pivotLows = pivots.filter(p => p.type === -1);

                // --- RESISTANCE (Connect last 2 Confirmed Pivot Highs) ---
                const upperData = [];
                if (pivotHighs.length >= 2) {
                    const p1 = pivotHighs[pivotHighs.length - 2];
                    const p2 = pivotHighs[pivotHighs.length - 1];
                    const slope = (p2.val - p1.val) / (p2.index - p1.index);
                    for (let i = p1.index; i < n; i++) {
                        upperData.push({ time: data[i].time, value: p1.val + slope * (i - p1.index) });
                    }
                } else if (pivotHighs.length === 1) {
                    for (let i = pivotHighs[0].index; i < n; i++) {
                        upperData.push({ time: data[i].time, value: pivotHighs[0].val });
                    }
                }

                // --- SUPPORT (Connect last 2 Confirmed Pivot Lows) ---
                const lowerData = [];
                if (pivotLows.length >= 2) {
                    const p1 = pivotLows[pivotLows.length - 2];
                    const p2 = pivotLows[pivotLows.length - 1];
                    const slope = (p2.val - p1.val) / (p2.index - p1.index);
                    for (let i = p1.index; i < n; i++) {
                        lowerData.push({ time: data[i].time, value: p1.val + slope * (i - p1.index) });
                    }
                } else if (pivotLows.length === 1) {
                    for (let i = pivotLows[0].index; i < n; i++) {
                        lowerData.push({ time: data[i].time, value: pivotLows[0].val });
                    }
                }

                chartRef.current.upperTrendlineSeries.setData(upperData);
                chartRef.current.lowerTrendlineSeries.setData(lowerData);
            }

            // Add trade markers
            if (trades && data.length > 0) {
                if (trades.length === 0) {
                    seriesRef.current.setMarkers([]);
                } else {
                    const startTime = data[0].time;
                    const endTime = data[data.length - 1].time;
                    // Average candle interval
                    const interval = data.length > 1 ? data[1].time - data[0].time : 60;

                    const markers = trades
                        .filter(t => t.timestamp)
                        .map(t => {
                            // Parse SQLite CURRENT_TIMESTAMP strictly as UTC
                            const tradeTime = Math.floor(new Date(t.timestamp.replace(' ', 'T') + 'Z').getTime() / 1000);
                            return { ...t, tradeTime };
                        })
                        // Filter out trades that are outside the chart's time range (plus a small buffer)
                        .filter(t => t.tradeTime >= startTime - interval && t.tradeTime <= endTime + interval)
                        .map(t => {
                            // Find the closest candle time to snap the marker
                            let closestTime = data[0].time;
                            let minDiff = Infinity;
                            for (const c of data) {
                                const diff = Math.abs(c.time - t.tradeTime);
                                if (diff < minDiff) {
                                    minDiff = diff;
                                    closestTime = c.time;
                                }
                            }

                            return {
                                time: closestTime,
                                position: t.side.toLowerCase() === 'buy' ? 'belowBar' : 'aboveBar',
                                color: t.side.toLowerCase() === 'buy' ? '#10b981' : '#ef4444',
                                shape: t.side.toLowerCase() === 'buy' ? 'arrowUp' : 'arrowDown',
                                text: t.side.toUpperCase(),
                            };
                        })
                        .sort((a, b) => a.time - b.time);

                    seriesRef.current.setMarkers(markers);
                }
            }
            // Manage Price Lines
            if (chartRef.current.takeProfitLine) {
                seriesRef.current.removePriceLine(chartRef.current.takeProfitLine);
                chartRef.current.takeProfitLine = null;
            }
            if (chartRef.current.stopLossLine) {
                seriesRef.current.removePriceLine(chartRef.current.stopLossLine);
                chartRef.current.stopLossLine = null;
            }
            if (chartRef.current.entryLine) {
                seriesRef.current.removePriceLine(chartRef.current.entryLine);
                chartRef.current.entryLine = null;
            }
            if (chartRef.current.dcaLines) {
                chartRef.current.dcaLines.forEach(line => {
                    try { seriesRef.current.removePriceLine(line); } catch(e){}
                });
            }
            chartRef.current.dcaLines = [];

            if (chartRef.current.fibLines) {
                chartRef.current.fibLines.forEach(line => {
                    try { seriesRef.current.removePriceLine(line); } catch(e){}
                });
            }
            chartRef.current.fibLines = [];

            // Draw Fibonacci Levels
            if (data.length > 0) {
                const lookback = data.slice(-50);
                let localHigh = -Infinity;
                let localLow = Infinity;

                for (let i = 0; i < lookback.length; i++) {
                    if (lookback[i].high > localHigh) localHigh = lookback[i].high;
                    if (lookback[i].low < localLow) localLow = lookback[i].low;
                }

                if (localHigh > localLow) {
                    const diff = localHigh - localLow;
                    const levels = [
                        { ratio: 1, title: 'Fib 1.000', color: 'rgba(255, 255, 255, 0.2)' },
                        { ratio: 0.618, title: 'Fib 0.618', color: 'rgba(234, 179, 8, 0.6)' }, // Golden Ratio
                        { ratio: 0.5, title: 'Fib 0.500', color: 'rgba(156, 163, 175, 0.4)' },
                        { ratio: 0.382, title: 'Fib 0.382', color: 'rgba(156, 163, 175, 0.4)' },
                        { ratio: 0, title: 'Fib 0.000', color: 'rgba(255, 255, 255, 0.2)' },
                    ];

                    levels.forEach(lvl => {
                        const price = localLow + (diff * lvl.ratio);
                        const line = seriesRef.current.createPriceLine({
                            price: price,
                            color: lvl.color,
                            lineWidth: 1,
                            lineStyle: 3, // Dotted
                            axisLabelVisible: true,
                            title: lvl.title,
                        });
                        chartRef.current.fibLines.push(line);
                    });
                }
            }

            if (status && status.entryPrice > 0 && status.config) {
                chartRef.current.entryLine = seriesRef.current.createPriceLine({
                    price: status.entryPrice,
                    color: '#3b82f6', // blue
                    lineWidth: 2,
                    lineStyle: 0, // Solid
                    axisLabelVisible: true,
                    title: 'Avg Entry',
                });
                if (status.config.takeProfitPercentage > 0) {
                    const tpPrice = status.entryPrice * (1 + (status.config.takeProfitPercentage / 100));
                    chartRef.current.takeProfitLine = seriesRef.current.createPriceLine({
                        price: tpPrice,
                        color: '#10b981',
                        lineWidth: 2,
                        lineStyle: 2, // Dashed
                        axisLabelVisible: true,
                        title: 'Take-Profit',
                    });
                }
                
                if (status.config.trailingStopPercentage > 0 && status.highestPriceSinceEntry > 0) {
                    const slPrice = status.highestPriceSinceEntry * (1 - (status.config.trailingStopPercentage / 100));
                    chartRef.current.stopLossLine = seriesRef.current.createPriceLine({
                        price: slPrice,
                        color: '#ef4444',
                        lineWidth: 2,
                        lineStyle: 2, // Dashed
                        axisLabelVisible: true,
                        title: 'Trailing Stop',
                    });
                }
                
                if (status.config.dcaLevels > 0 && status.positions) {
                    const primarySymbol = status.config.symbols.split(',')[0].trim();
                    const pos = status.positions[primarySymbol];
                    if (pos) {
                        for (let i = pos.dcaLevel + 1; i <= status.config.dcaLevels; i++) {
                            const drop = status.config.dcaDropPercentage * (i - pos.dcaLevel);
                            const dcaPrice = status.entryPrice * (1 - (drop / 100));
                            const dcaLine = seriesRef.current.createPriceLine({
                                price: dcaPrice,
                                color: '#60a5fa', // light blue
                                lineWidth: 1,
                                lineStyle: 3, // Dotted
                                axisLabelVisible: true,
                                title: `DCA ${i}`,
                            });
                            chartRef.current.dcaLines.push(dcaLine);
                        }
                    }
                }
            }
        }
    }, [data, trades, status]);

    return (
        <div style={{ width: '100%' }}>
            <div ref={chartContainerRef} style={{ width: '100%', height: '300px' }} />
            <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
            <div ref={rsiContainerRef} style={{ width: '100%', height: '150px' }} />
        </div>
    );
}
