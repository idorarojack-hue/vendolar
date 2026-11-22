import {
    createDigitStrategy,
    parityRule,
    PATTERN_PRESETS,
    rangeBounceRule,
    repeatRule,
    zigzagRule,
} from '../digit-strategies';

describe('digit rules', () => {
    it('rangeBounceRule triggers on runs at either end', () => {
        const rule = rangeBounceRule(3, 4, 5);
        expect(rule([9, 1, 2, 3])).toMatchObject({ contract_type: 'DIGITOVER', digit: 4 });
        expect(rule([0, 7, 8, 9])).toMatchObject({ contract_type: 'DIGITUNDER', digit: 5 });
        expect(rule([1, 2, 7])).toBeNull();
        expect(rule([1, 2])).toBeNull();
    });

    it('parityRule swaps or rides', () => {
        expect(parityRule(3, 'swap')([2, 4, 6])).toMatchObject({ contract_type: 'DIGITODD' });
        expect(parityRule(3, 'ride')([2, 4, 6])).toMatchObject({ contract_type: 'DIGITEVEN' });
        expect(parityRule(3, 'swap')([2, 4, 5])).toBeNull();
    });

    it('zigzagRule continues an alternation', () => {
        expect(zigzagRule(4)([1, 2, 3, 4])).toMatchObject({ contract_type: 'DIGITODD' });
        expect(zigzagRule(4)([1, 2, 4, 5])).toBeNull();
    });

    it('repeatRule reacts to a repeated digit', () => {
        expect(repeatRule([3, 3])).toMatchObject({ contract_type: 'DIGITOVER', digit: 4 });
        expect(repeatRule([7, 7])).toMatchObject({ contract_type: 'DIGITUNDER', digit: 5 });
        expect(repeatRule([7, 6])).toBeNull();
    });

    it('every preset has a valid recovery preset and never trades an impossible digit', () => {
        const ids = PATTERN_PRESETS.map(p => p.id);
        PATTERN_PRESETS.forEach(p => {
            expect(ids).toContain(p.recovery);
            for (let a = 0; a < 10; a++)
                for (let b = 0; b < 10; b++) {
                    const trade = p.rule(p.default_confirmation)([a, b, a, b, a, b]);
                    if (trade?.contract_type === 'DIGITOVER') expect(trade.digit).toBeLessThanOrEqual(8);
                    if (trade?.contract_type === 'DIGITUNDER') expect(trade.digit).toBeGreaterThanOrEqual(1);
                }
        });
    });
});

describe('createDigitStrategy', () => {
    it('switches to the recovery rule after a loss and back after a win', () => {
        const strategy = createDigitStrategy({
            name: 'test',
            markets: ['R_100'],
            rule: () => ({ contract_type: 'DIGITEVEN', duration: 1 }),
            recovery_rule: () => ({ contract_type: 'DIGITODD', duration: 1 }),
        });
        const ctx = (digits: number[]) => ({
            symbol: 'R_100',
            ticks: digits.map((digit, i) => ({ epoch: i, quote: 1, digit })),
            markets: new Map(),
            session: {} as any,
        });
        expect(strategy.decide(ctx([1]))?.contract_type).toBe('DIGITEVEN');
        strategy.onResult?.({ result: 'lost' } as any, {} as any);
        expect(strategy.decide(ctx([1]))?.contract_type).toBe('DIGITODD');
        strategy.onResult?.({ result: 'won' } as any, {} as any);
        expect(strategy.decide(ctx([1]))?.contract_type).toBe('DIGITEVEN');
    });
});
