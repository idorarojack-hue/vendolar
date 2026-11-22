/**
 * Statistics-based digit strategies (used by Auto Strategies and the Strategy Tester).
 * They trade what was more frequent recently — described honestly as past shares, not predictions.
 */
import type { TStrategy } from './auto-trader';
import { computeDigitStats } from './digit-stats';

export type TDigitDefinition = {
    id: string;
    name: string;
    description: string;
    tags: string[];
    build: (symbol: string, window: number, cooldown: number) => TStrategy;
};

/** Digit strategies based on recent statistics (described honestly: past shares, not predictions). */
export const DIGIT_STRATEGIES: TDigitDefinition[] = [
    {
        id: 'parity-majority',
        name: 'Parity Majority',
        description: 'Trades the parity (Even or Odd) that appeared more often over the window, when it leads by at least 5 points.',
        tags: ['Even/Odd', 'Statistics'],
        build: (symbol, window, cooldown) => {
            let wait = 0;
            return {
                name: 'Parity Majority',
                markets: [symbol],
                history: window,
                decide: ({ ticks }) => {
                    if (wait-- > 0 || ticks.length < window) return null;
                    const s = computeDigitStats(ticks.slice(-window));
                    if (Math.abs(s.even - s.odd) < 5) return null;
                    wait = cooldown;
                    return { symbol, contract_type: s.even > s.odd ? 'DIGITEVEN' : 'DIGITODD', duration: 1, reason: `Even ${s.even.toFixed(0)}% / Odd ${s.odd.toFixed(0)}%` };
                },
            };
        },
    },
    {
        id: 'half-majority',
        name: 'Half Majority',
        description: 'Trades Over 4 or Under 5 — whichever half (5-9 or 0-4) appeared more often, when it leads by at least 5 points.',
        tags: ['Over/Under', 'Statistics'],
        build: (symbol, window, cooldown) => {
            let wait = 0;
            return {
                name: 'Half Majority',
                markets: [symbol],
                history: window,
                decide: ({ ticks }) => {
                    if (wait-- > 0 || ticks.length < window) return null;
                    const s = computeDigitStats(ticks.slice(-window), 4);
                    if (Math.abs(s.over - s.under) < 5) return null;
                    wait = cooldown;
                    return s.over > s.under
                        ? { symbol, contract_type: 'DIGITOVER', digit: 4, duration: 1, reason: `Over 4 at ${s.over.toFixed(0)}%` }
                        : { symbol, contract_type: 'DIGITUNDER', digit: 5, duration: 1, reason: `Under 5 at ${s.under.toFixed(0)}%` };
                },
            };
        },
    },
    {
        id: 'rare-digit-differs',
        name: 'Rare Digit Differs',
        description: 'Trades Differs on the digit that appeared least often over the window.',
        tags: ['Differs', 'Statistics'],
        build: (symbol, window, cooldown) => {
            let wait = 0;
            return {
                name: 'Rare Digit Differs',
                markets: [symbol],
                history: window,
                decide: ({ ticks }) => {
                    if (wait-- > 0 || ticks.length < window) return null;
                    const s = computeDigitStats(ticks.slice(-window));
                    const digit = s.least[0];
                    if (digit === undefined) return null;
                    wait = cooldown;
                    return { symbol, contract_type: 'DIGITDIFF', digit, duration: 1, reason: `Digit ${digit} at ${s.percentages[digit].toFixed(0)}%` };
                },
            };
        },
    },
];

