/**
 * Entry rules ("if <condition> then trade <contract>") shared by Vindolar's automated tools.
 * Pure functions: no network, no React.
 */
import type { TStrategy } from './auto-trader';
import { computeDigitStats, TTick } from './digit-stats';

export type TDigitTest = 'even' | 'odd' | 'over' | 'under' | 'equal';

/** Every one of the last `count` digits passes `test` (e.g. all even, all over 5). */
export type TLastDigitsCondition = { kind: 'last_digits'; count: number; test: TDigitTest; value?: number };

export type TPercentMetric = 'even' | 'odd' | 'over' | 'under' | 'rise' | 'fall' | 'digit';

/** A share over the last `window` ticks compared to a threshold (e.g. Even% ≥ 60). */
export type TPercentCondition = {
    kind: 'percent';
    window: number;
    metric: TPercentMetric;
    /** Barrier for over/under (Over 4 = digits 5-9), digit for 'digit'. */
    value?: number;
    op: '>=' | '<=';
    threshold: number;
};

export type TCondition = TLastDigitsCondition | TPercentCondition;

export type TEvaluation = { met: boolean; detail: string; ready: boolean };

export const passesDigitTest = (digit: number, test: TDigitTest, value = 0) => {
    switch (test) {
        case 'even':
            return digit % 2 === 0;
        case 'odd':
            return digit % 2 !== 0;
        case 'over':
            return digit > value;
        case 'under':
            return digit < value;
        case 'equal':
            return digit === value;
        default:
            return false;
    }
};

const TEST_LABEL: Record<TDigitTest, (v?: number) => string> = {
    even: () => 'even',
    odd: () => 'odd',
    over: v => `over ${v}`,
    under: v => `under ${v}`,
    equal: v => `equal to ${v}`,
};

export const describeCondition = (c: TCondition) => {
    if (c.kind === 'last_digits') return `Last ${c.count} digits all ${TEST_LABEL[c.test](c.value)}`;
    const metric =
        c.metric === 'over' ? `Over ${c.value}` : c.metric === 'under' ? `Under ${(c.value ?? 0) + 1}` : c.metric === 'digit' ? `Digit ${c.value}` : c.metric[0].toUpperCase() + c.metric.slice(1);
    return `${metric} ${c.op === '>=' ? '≥' : '≤'} ${c.threshold}% over ${c.window} ticks`;
};

export const percentFor = (ticks: TTick[], metric: TPercentMetric, value = 4) => {
    const stats = computeDigitStats(ticks, value);
    switch (metric) {
        case 'even':
            return stats.even;
        case 'odd':
            return stats.odd;
        case 'over':
            return stats.over;
        case 'under':
            return stats.under;
        case 'rise':
            return stats.rise;
        case 'fall':
            return stats.fall;
        case 'digit':
            return stats.percentages[value] ?? 0;
        default:
            return 0;
    }
};

/** Check a condition against ticks (oldest first). */
export const evaluateCondition = (ticks: TTick[], c: TCondition): TEvaluation => {
    if (c.kind === 'last_digits') {
        if (ticks.length < c.count) return { met: false, ready: false, detail: 'Waiting for ticks…' };
        const last = ticks.slice(-c.count).map(t => t.digit);
        const met = last.every(d => passesDigitTest(d, c.test, c.value));
        return { met, ready: true, detail: `Last ${c.count}: ${last.join(' ')}` };
    }
    if (ticks.length < Math.min(c.window, 10)) return { met: false, ready: false, detail: 'Waiting for ticks…' };
    const window = ticks.slice(-c.window);
    const value = percentFor(window, c.metric, c.value);
    const met = c.op === '>=' ? value >= c.threshold : value <= c.threshold;
    return { met, ready: window.length >= c.window, detail: `${value.toFixed(1)}% over ${window.length} ticks` };
};

export type TRuleTrade = { contract_type: string; digit?: number; duration?: number };

/**
 * Strategy for the auto-trade engine from a condition: on each new tick of a watched market,
 * trade `trade` when `condition` is met. `pause_ticks` skips that many ticks after each trade.
 */
export const createRuleStrategy = ({
    name,
    markets,
    condition,
    trade,
    pause_ticks = 0,
}: {
    name: string;
    markets: string[];
    condition: TCondition;
    trade: TRuleTrade;
    pause_ticks?: number;
}) => {
    let pause_left = 0;
    const history = condition.kind === 'percent' ? Math.max(condition.window, 20) : Math.max(condition.count, 20);
    const strategy: TStrategy = {
        name,
        markets,
        history,
        decide: ({ symbol, ticks }) => {
            if (pause_left > 0) {
                pause_left -= 1;
                return null;
            }
            const evaluation = evaluateCondition(ticks, condition);
            if (!evaluation.met || !evaluation.ready) return null;
            pause_left = pause_ticks;
            return { symbol, ...trade, reason: `${describeCondition(condition)} (${evaluation.detail})` };
        },
    };
    return strategy;
};
