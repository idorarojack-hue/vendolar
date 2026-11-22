import { TStrategy } from '../auto-trader';
import { payoutKey, runBacktest, wins } from '../backtest';
import { TTick } from '../digit-stats';

/** Deterministic pseudo-random numbers (mulberry32) so tests are repeatable. */
const rng = (seed: number) => () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ticksFromDigits = (digits: number[]): TTick[] => digits.map((digit, i) => ({ epoch: i, quote: 100 + i * 0.01, digit }));

const always = (contract_type: string, digit?: number): (() => TStrategy) => () => ({
    name: 'always',
    markets: ['R_100'],
    history: 1,
    decide: ({ symbol }) => ({ symbol, contract_type, digit, duration: 1 }),
});

const base = { stake: 1, take_profit: 1000, stop_loss: 1000, martingale: false, multiplier: 2, max_stake: 1000 };

describe('wins', () => {
    const t = (digit: number, quote = 1): TTick => ({ epoch: 0, digit, quote });
    it('settles every contract type', () => {
        expect(wins('DIGITEVEN', undefined, t(1), t(4))).toBe(true);
        expect(wins('DIGITODD', undefined, t(1), t(4))).toBe(false);
        expect(wins('DIGITOVER', 4, t(1), t(5))).toBe(true);
        expect(wins('DIGITOVER', 4, t(1), t(4))).toBe(false);
        expect(wins('DIGITUNDER', 5, t(1), t(4))).toBe(true);
        expect(wins('DIGITMATCH', 7, t(1), t(7))).toBe(true);
        expect(wins('DIGITDIFF', 7, t(1), t(7))).toBe(false);
        expect(wins('CALL', undefined, t(0, 1), t(0, 2))).toBe(true);
        expect(wins('PUT', undefined, t(0, 1), t(0, 1))).toBe(false); // equal = loss
    });
});

describe('runBacktest', () => {
    it('settles each trade on the exit tick and steps one trade at a time', () => {
        // decision at i → entry i+1 → exit i+2 (duration 1) → next decision i+3
        // decisions at 0, 3, 6, 9 → exits at 2, 5, 8, 11 → digits 2 (win), 1 (loss), 4 (win), 3 (loss)
        const ticks = ticksFromDigits([0, 0, 2, 0, 0, 1, 0, 0, 4, 0, 0, 3]);
        const payouts = new Map([[payoutKey({ contract_type: 'DIGITEVEN', duration: 1 }), 1.9]]);
        const r = runBacktest({ ticks, symbol: 'R_100', createStrategy: always('DIGITEVEN'), settings: base, payouts, warmup: 0 });
        expect(r.trades.map(t => t.won)).toEqual([true, false, true, false]);
        expect(r.net_profit).toBeCloseTo(0.9 - 1 + 0.9 - 1);
        expect(r.breakeven_win_rate).toBeCloseTo((1 / 1.9) * 100);
    });

    it('applies martingale and ends sessions at the stop loss without exceeding it', () => {
        const ticks = ticksFromDigits(new Array(40).fill(1)); // odd forever → Even always loses
        const payouts = new Map([[payoutKey({ contract_type: 'DIGITEVEN', duration: 1 }), 1.92]]);
        const r = runBacktest({
            ticks,
            symbol: 'R_100',
            createStrategy: always('DIGITEVEN'),
            settings: { ...base, martingale: true, stop_loss: 10, max_stake: 100 },
            payouts,
            warmup: 0,
            repeat_sessions: false,
        });
        // stakes 1, 2, 4 → loss 7; next stake 8 would make 15 > 10 → stop
        expect(r.trades.map(t => t.stake)).toEqual([1, 2, 4]);
        expect(r.net_profit).toBe(-7);
        expect(r.sessions[0].ended).toBe('Stop loss');
        expect(r.longest_losing_streak).toBe(3);
    });

    it('reproduces the house edge on fair random digits', () => {
        const random = rng(42);
        const ticks = ticksFromDigits(Array.from({ length: 40000 }, () => Math.floor(random() * 10)));
        const payouts = new Map([[payoutKey({ contract_type: 'DIGITEVEN', duration: 1 }), 1.92]]);
        const r = runBacktest({ ticks, symbol: 'R_100', createStrategy: always('DIGITEVEN'), settings: base, payouts, warmup: 0 });
        // Expected return: 0.5 × 1.92 − 1 = −4% of everything staked.
        expect(r.trades.length).toBe(13333); // one trade per 3 ticks (decide, entry, exit)
        expect(r.return_on_staked).toBeGreaterThan(-7);
        expect(r.return_on_staked).toBeLessThan(-1);
        expect(r.win_rate).toBeGreaterThan(48);
        expect(r.win_rate).toBeLessThan(52);
    });
});
