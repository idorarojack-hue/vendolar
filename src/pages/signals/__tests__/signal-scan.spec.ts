import { rankSignals, scanMarket } from '../signal-scan';

const market = { symbol: 'R_10', name: 'Volatility 10 Index' };
const fromDigits = (digits: number[]) => digits.map((digit, i) => ({ epoch: i, quote: 100 + i + digit / 100, digit }));

describe('scanMarket', () => {
    it('picks the over/under contract with the biggest edge over fair odds', () => {
        // Digits 0-6 only: "Under 7" wins every time (fair 70%) — a 30-point edge.
        const ticks = fromDigits(Array.from({ length: 700 }, (_, i) => i % 7));
        const signal = scanMarket('over_under', market, ticks, 60);
        expect(signal?.trade).toBe('Under 7');
        expect(signal?.contract).toBe('DIGITUNDER');
        expect(signal?.prediction).toBe(7);
        expect(signal?.hit).toBeCloseTo(100);
        expect(signal?.edge).toBeCloseTo(30);
    });

    it('returns null when nothing reaches the minimum confidence', () => {
        const ticks = fromDigits(Array.from({ length: 1000 }, (_, i) => i % 10));
        expect(scanMarket('even_odd', market, ticks, 60)).toBeNull();
    });

    it('reports the three most frequent digits', () => {
        const ticks = fromDigits([
            ...Array(50).fill(7),
            ...Array(40).fill(3),
            ...Array(30).fill(1),
            ...Array(10).fill(9),
        ]);
        expect(scanMarket('differs', market, ticks, 50)?.hot_digits).toEqual([7, 3, 1]);
    });
});

describe('rankSignals', () => {
    it('orders by edge, then hit rate', () => {
        const base = {
            symbol: 'x',
            market: 'x',
            trade: 'x',
            contract: 'x',
            tradetype: 'evenodd' as const,
            sample: 1,
            hot_digits: [],
        };
        const ranked = rankSignals([
            { ...base, symbol: 'a', hit: 60, fair: 50, edge: 10 },
            { ...base, symbol: 'b', hit: 95, fair: 90, edge: 5 },
            { ...base, symbol: 'c', hit: 62, fair: 50, edge: 12 },
        ]);
        expect(ranked.map(s => s.symbol)).toEqual(['c', 'a', 'b']);
    });
});
