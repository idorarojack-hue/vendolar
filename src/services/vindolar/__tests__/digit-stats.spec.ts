import {
    computeDigitStats,
    getCurrentStreak,
    getLastDigit,
    mostUnusual,
    sortVolatilitySymbols,
    TTick,
} from '../digit-stats';

describe('getCurrentStreak', () => {
    it('measures the run at the end', () => {
        expect(getCurrentStreak([2, 3, 4, 6, 8], d => d % 2 === 0)).toEqual({ value: true, length: 3 });
        expect(getCurrentStreak([2, 4, 7], d => d % 2 === 0)).toEqual({ value: false, length: 1 });
        expect(getCurrentStreak([], () => true)).toEqual({ value: false, length: 0 });
    });
});

const ticksFrom = (quotes: number[], pip_size = 2): TTick[] =>
    quotes.map((quote, i) => ({ epoch: i, quote, digit: getLastDigit(quote, pip_size) }));

describe('getLastDigit', () => {
    it('pads trailing zeros to the market precision', () => {
        expect(getLastDigit(1627.4, 2)).toBe(0);
        expect(getLastDigit(1627, 2)).toBe(0);
        expect(getLastDigit(1627.41, 2)).toBe(1);
    });

    it('works for 3 and 4 decimal markets', () => {
        expect(getLastDigit(9693.29, 3)).toBe(0);
        expect(getLastDigit(217912.9301, 4)).toBe(1);
        expect(getLastDigit(3871.48, 4)).toBe(0);
    });

    it('rounds floating point noise instead of reading it', () => {
        expect(getLastDigit(0.1 + 0.2, 2)).toBe(0); // 0.30000000000000004 -> "0.30"
    });
});

describe('computeDigitStats', () => {
    it('counts digits and percentages', () => {
        const stats = computeDigitStats(ticksFrom([1.01, 1.02, 1.02, 1.09]));
        expect(stats.sample).toBe(4);
        expect(stats.counts[2]).toBe(2);
        expect(stats.percentages[2]).toBe(50);
        expect(stats.most).toEqual([2]);
        expect(stats.least).toContain(0);
    });

    it('splits even/odd and over/under so they add up to 100', () => {
        const stats = computeDigitStats(ticksFrom([1.0, 1.01, 1.05, 1.08]), 4);
        expect(stats.even).toBe(50); // 0, 8
        expect(stats.odd).toBe(50); // 1, 5
        expect(stats.over).toBe(50); // 5, 8
        expect(stats.under).toBe(50); // 0, 1
    });

    it('ignores unchanged ticks for rise/fall', () => {
        const stats = computeDigitStats(ticksFrom([1.0, 1.1, 1.1, 1.05]));
        expect(stats.rise).toBe(50);
        expect(stats.fall).toBe(50);
    });

    it('returns zeros for no ticks', () => {
        const stats = computeDigitStats([]);
        expect(stats.sample).toBe(0);
        expect(stats.even).toBe(0);
        expect(stats.odd).toBe(0);
        expect(stats.most).toEqual([]);
    });
});

describe('sortVolatilitySymbols', () => {
    it('puts 1-second indices first, then by volatility number', () => {
        const sorted = sortVolatilitySymbols([
            { symbol: 'R_100', name: 'Volatility 100 Index' },
            { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index' },
            { symbol: 'R_10', name: 'Volatility 10 Index' },
            { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index' },
        ]);
        expect(sorted.map(s => s.symbol)).toEqual(['1HZ10V', '1HZ100V', 'R_10', 'R_100']);
    });
});

describe('mostUnusual', () => {
    const make = (digits: number[]) => digits.map((digit: number, i: number) => ({ epoch: i, quote: 1, digit }));

    it('needs enough ticks', () => {
        expect(mostUnusual(make([1, 2, 3])).score).toBe(0);
    });

    it('finds a strong parity imbalance', () => {
        const digits = Array.from({ length: 100 }, (_, i) => (i % 10 < 8 ? (i % 5) * 2 : 1)); // ~80% even
        const result = mostUnusual(make(digits));
        expect(result.kind).toBe('even');
        expect(result.score).toBeGreaterThan(4);
    });

    it('scores a perfectly balanced sample near zero for parity', () => {
        const digits = Array.from({ length: 100 }, (_, i) => i % 10);
        const result = mostUnusual(make(digits));
        expect(result.score).toBeCloseTo(0);
    });
});
