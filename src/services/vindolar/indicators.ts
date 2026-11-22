/**
 * Tick indicators and Rise/Fall strategies for the Auto Strategies tool. Pure functions.
 */
import type { TStrategy, TTradeDecision } from './auto-trader';
import { TTick } from './digit-stats';

export const sma = (values: number[], period: number) => {
    if (values.length < period) return NaN;
    const slice = values.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
};

/** Exponential moving average series (same length as input; first value seeds the average). */
export const emaSeries = (values: number[], period: number) => {
    const k = 2 / (period + 1);
    const out: number[] = [];
    values.forEach((v, i) => out.push(i === 0 ? v : v * k + out[i - 1] * (1 - k)));
    return out;
};

export const ema = (values: number[], period: number) => {
    if (values.length < period) return NaN;
    const series = emaSeries(values, period);
    return series[series.length - 1];
};

/** Relative Strength Index (Wilder's smoothing). 0-100; 50 when flat. */
export const rsi = (values: number[], period = 14) => {
    if (values.length <= period) return NaN;
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= period; i++) {
        const change = values[i] - values[i - 1];
        if (change > 0) gain += change;
        else loss -= change;
    }
    gain /= period;
    loss /= period;
    for (let i = period + 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        gain = (gain * (period - 1) + Math.max(change, 0)) / period;
        loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
    }
    if (gain === 0 && loss === 0) return 50;
    if (loss === 0) return 100;
    return 100 - 100 / (1 + gain / loss);
};

export const highest = (values: number[]) => Math.max(...values);
export const lowest = (values: number[]) => Math.min(...values);

type TSignal = 'CALL' | 'PUT' | null;

export type TPriceStrategyDefinition = {
    id: string;
    name: string;
    description: string;
    tags: string[];
    /** Ticks of history needed. */
    history: number;
    signal: (quotes: number[]) => TSignal;
};

export const PRICE_STRATEGIES: TPriceStrategyDefinition[] = [
    {
        id: 'trend-rider',
        name: 'Trend Rider',
        description: 'Trades with the trend: fast average above slow average and price above both → Rise (and the mirror for Fall).',
        tags: ['EMA 10/30', 'Trend'],
        history: 40,
        signal: q => {
            const fast = ema(q, 10);
            const slow = ema(q, 30);
            const price = q[q.length - 1];
            if (fast > slow && price > fast) return 'CALL';
            if (fast < slow && price < fast) return 'PUT';
            return null;
        },
    },
    {
        id: 'pullback-hunter',
        name: 'Pullback Hunter',
        description: 'In a rising trend, waits for 3 falling ticks and trades Rise (mirror in a falling trend).',
        tags: ['EMA 30', 'Pullback'],
        history: 40,
        signal: q => {
            const trend_now = ema(q, 30);
            const trend_before = ema(q.slice(0, -5), 30);
            const last = q.slice(-4);
            const fell = last.every((v, i) => i === 0 || v < last[i - 1]);
            const rose = last.every((v, i) => i === 0 || v > last[i - 1]);
            if (trend_now > trend_before && fell) return 'CALL';
            if (trend_now < trend_before && rose) return 'PUT';
            return null;
        },
    },
    {
        id: 'momentum-breakout',
        name: 'Momentum Breakout',
        description: 'Price breaks above the highest of the previous 20 ticks → Rise; below the lowest → Fall.',
        tags: ['20-tick high/low', 'Breakout'],
        history: 25,
        signal: q => {
            const previous = q.slice(-21, -1);
            const price = q[q.length - 1];
            if (previous.length < 20) return null;
            if (price > highest(previous)) return 'CALL';
            if (price < lowest(previous)) return 'PUT';
            return null;
        },
    },
    {
        id: 'channel-breakout',
        name: 'Channel Breakout',
        description: 'Price leaves the 50-tick price channel → trade in the breakout direction.',
        tags: ['50-tick channel', 'Breakout'],
        history: 55,
        signal: q => {
            const previous = q.slice(-51, -1);
            const price = q[q.length - 1];
            if (previous.length < 50) return null;
            if (price > highest(previous)) return 'CALL';
            if (price < lowest(previous)) return 'PUT';
            return null;
        },
    },
    {
        id: 'trend-momentum',
        name: 'Trend + Momentum',
        description: 'Needs both: average rising and RSI above 55 → Rise; average falling and RSI below 45 → Fall.',
        tags: ['EMA 20', 'RSI 14'],
        history: 40,
        signal: q => {
            const now = ema(q, 20);
            const before = ema(q.slice(0, -3), 20);
            const strength = rsi(q.slice(-30), 14);
            if (now > before && strength > 55) return 'CALL';
            if (now < before && strength < 45) return 'PUT';
            return null;
        },
    },
];

/** Engine strategy from a price strategy, with a cooldown between trades. */
export const createPriceStrategy = ({
    definition,
    symbol,
    duration,
    cooldown_ticks,
}: {
    definition: TPriceStrategyDefinition;
    symbol: string;
    duration: number;
    cooldown_ticks: number;
}): TStrategy => {
    let wait = 0;
    return {
        name: definition.name,
        markets: [symbol],
        history: definition.history,
        decide: ({ ticks }: { ticks: TTick[] }): TTradeDecision | null => {
            if (wait > 0) {
                wait -= 1;
                return null;
            }
            if (ticks.length < definition.history) return null;
            const signal = definition.signal(ticks.map(t => t.quote));
            if (!signal) return null;
            wait = cooldown_ticks;
            return { symbol, contract_type: signal, duration, reason: definition.name };
        },
    };
};
