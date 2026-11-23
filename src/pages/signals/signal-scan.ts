/**
 * Signal AI scan: reads past ticks per market and finds the contract whose recent hit rate is furthest
 * above its fair odds. Pure functions — no network, no React.
 *
 * "Confidence" shown on the page is the hit rate over the ticks read. Volatility indices are random,
 * so a past hit rate does not change the odds of the next tick; the page says so next to the results.
 */
import { TBotTradeType } from '@/services/vindolar/bot-loader';
import { TTick } from '@/services/vindolar/digit-stats';

export type TSignalStrategy = 'over_under' | 'even_odd' | 'rise_fall' | 'differs';

export const STRATEGY_NAMES: Record<TSignalStrategy, string> = {
    over_under: 'Over & Under',
    even_odd: 'Even & Odd',
    rise_fall: 'Rise & Fall',
    differs: 'Differs',
};

export type TSignal = {
    symbol: string;
    market: string;
    /** e.g. "Under 7", "Even", "Rise", "Differs 3" */
    trade: string;
    contract: string;
    tradetype: TBotTradeType;
    prediction?: number;
    /** Share of the ticks read on which this trade would have won, 0-100. */
    hit: number;
    /** Share it wins with a fair, uniform digit (or 50/50 moves), 0-100. */
    fair: number;
    /** hit - fair, in percentage points. */
    edge: number;
    sample: number;
    /** The three most frequent last digits, most frequent first. */
    hot_digits: number[];
};

type TCandidate = Pick<TSignal, 'trade' | 'contract' | 'tradetype' | 'prediction' | 'hit' | 'fair'>;

const share = (count: number, total: number) => (total ? (count / total) * 100 : 0);

const candidatesFor = (strategy: TSignalStrategy, ticks: TTick[]): TCandidate[] => {
    const digits = ticks.map(t => t.digit);
    const n = digits.length;
    const counts = new Array(10).fill(0);
    digits.forEach(d => counts[d]++);
    const below = (d: number) => counts.slice(0, d).reduce((a, b) => a + b, 0);

    switch (strategy) {
        case 'over_under': {
            const list: TCandidate[] = [];
            for (let d = 0; d <= 8; d++) {
                list.push({
                    trade: `Over ${d}`,
                    contract: 'DIGITOVER',
                    tradetype: 'overunder',
                    prediction: d,
                    hit: share(n - below(d + 1), n),
                    fair: (9 - d) * 10,
                });
            }
            for (let d = 1; d <= 9; d++) {
                list.push({
                    trade: `Under ${d}`,
                    contract: 'DIGITUNDER',
                    tradetype: 'overunder',
                    prediction: d,
                    hit: share(below(d), n),
                    fair: d * 10,
                });
            }
            return list;
        }
        case 'even_odd': {
            const even = counts.filter((_, d) => d % 2 === 0).reduce((a, b) => a + b, 0);
            return [
                { trade: 'Even', contract: 'DIGITEVEN', tradetype: 'evenodd', hit: share(even, n), fair: 50 },
                { trade: 'Odd', contract: 'DIGITODD', tradetype: 'evenodd', hit: share(n - even, n), fair: 50 },
            ];
        }
        case 'rise_fall': {
            let up = 0;
            let down = 0;
            for (let i = 1; i < ticks.length; i++) {
                if (ticks[i].quote > ticks[i - 1].quote) up++;
                else if (ticks[i].quote < ticks[i - 1].quote) down++;
            }
            const moves = Math.max(ticks.length - 1, 0);
            return [
                { trade: 'Rise', contract: 'CALL', tradetype: 'callput', hit: share(up, moves), fair: 50 },
                { trade: 'Fall', contract: 'PUT', tradetype: 'callput', hit: share(down, moves), fair: 50 },
            ];
        }
        case 'differs':
        default:
            return counts.map((count, d) => ({
                trade: `Differs ${d}`,
                contract: 'DIGITDIFF',
                tradetype: 'matchesdiffers' as const,
                prediction: d,
                hit: share(n - count, n),
                fair: 90,
            }));
    }
};

/** Best contract for one market, or null when none reaches `min_confidence` (0-100). */
export const scanMarket = (
    strategy: TSignalStrategy,
    market: { symbol: string; name: string },
    ticks: TTick[],
    min_confidence: number
): TSignal | null => {
    if (ticks.length < 20) return null;
    const counts = new Array(10).fill(0);
    ticks.forEach(t => counts[t.digit]++);
    const hot_digits = counts
        .map((count, digit) => ({ count, digit }))
        .sort((a, b) => b.count - a.count || a.digit - b.digit)
        .slice(0, 3)
        .map(c => c.digit);

    const best = candidatesFor(strategy, ticks)
        .filter(c => c.hit >= min_confidence)
        .map(c => ({ ...c, edge: c.hit - c.fair }))
        .sort((a, b) => b.edge - a.edge || b.hit - a.hit)[0];
    if (!best) return null;

    return { ...best, symbol: market.symbol, market: market.name, sample: ticks.length, hot_digits };
};

/** Strongest first: biggest edge over fair odds, then highest hit rate. */
export const rankSignals = (signals: TSignal[]) => [...signals].sort((a, b) => b.edge - a.edge || b.hit - a.hit);
