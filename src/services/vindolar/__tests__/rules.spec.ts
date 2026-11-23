import { TTick } from '../digit-stats';
import { describeCondition, evaluateCondition, passesDigitTest } from '../rules';

const ticks = (digits: number[], quotes?: number[]): TTick[] =>
    digits.map((digit, i) => ({ epoch: i, digit, quote: quotes ? quotes[i] : 100 + i }));

describe('passesDigitTest', () => {
    it('handles each test', () => {
        expect(passesDigitTest(4, 'even')).toBe(true);
        expect(passesDigitTest(3, 'odd')).toBe(true);
        expect(passesDigitTest(6, 'over', 5)).toBe(true);
        expect(passesDigitTest(5, 'over', 5)).toBe(false);
        expect(passesDigitTest(4, 'under', 5)).toBe(true);
        expect(passesDigitTest(7, 'equal', 7)).toBe(true);
    });
});

describe('evaluateCondition: last digits', () => {
    it('is met only when every recent digit passes', () => {
        expect(evaluateCondition(ticks([1, 2, 4, 6]), { kind: 'last_digits', count: 3, test: 'even' }).met).toBe(true);
        expect(evaluateCondition(ticks([2, 4, 5]), { kind: 'last_digits', count: 3, test: 'even' }).met).toBe(false);
        expect(evaluateCondition(ticks([7, 8, 9]), { kind: 'last_digits', count: 3, test: 'over', value: 6 }).met).toBe(
            true
        );
    });

    it('waits until there are enough ticks', () => {
        const result = evaluateCondition(ticks([2]), { kind: 'last_digits', count: 3, test: 'even' });
        expect(result.met).toBe(false);
        expect(result.ready).toBe(false);
    });
});

describe('evaluateCondition: percent', () => {
    const digits = [0, 2, 4, 6, 8, 1, 3, 2, 4, 6]; // 7 even / 10
    it('compares a share to the threshold', () => {
        expect(
            evaluateCondition(ticks(digits), { kind: 'percent', window: 10, metric: 'even', op: '>=', threshold: 70 })
                .met
        ).toBe(true);
        expect(
            evaluateCondition(ticks(digits), { kind: 'percent', window: 10, metric: 'odd', op: '>=', threshold: 40 })
                .met
        ).toBe(false);
        expect(
            evaluateCondition(ticks(digits), {
                kind: 'percent',
                window: 10,
                metric: 'digit',
                value: 9,
                op: '<=',
                threshold: 0,
            }).met
        ).toBe(true);
    });

    it('uses price moves for rise/fall', () => {
        const rising = ticks(new Array(10).fill(1), [1, 2, 3, 4, 5, 6, 7, 8, 9, 8]);
        expect(
            evaluateCondition(rising, { kind: 'percent', window: 10, metric: 'rise', op: '>=', threshold: 80 }).met
        ).toBe(true);
    });
});

describe('describeCondition', () => {
    it('reads like a sentence', () => {
        expect(describeCondition({ kind: 'last_digits', count: 3, test: 'over', value: 5 })).toBe(
            'Last 3 digits all over 5'
        );
        expect(describeCondition({ kind: 'percent', window: 100, metric: 'even', op: '>=', threshold: 60 })).toBe(
            'Even ≥ 60% over 100 ticks'
        );
    });
});
