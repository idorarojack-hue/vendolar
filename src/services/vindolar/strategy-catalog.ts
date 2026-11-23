/**
 * Every strategy that can run in Vindolar's automated tools, in one list, so the Strategy Tester can
 * replay any of them with exactly the same logic the live tools use.
 */
import type { TStrategy } from './auto-trader';
import { createDigitStrategy, getPreset, parityRule, PATTERN_PRESETS, rangeBounceRule } from './digit-strategies';
import { createPriceStrategy, PRICE_STRATEGIES } from './indicators';
import { DIGIT_STRATEGIES } from './stat-strategies';

export type TCatalogEntry = {
    id: string;
    group: string;
    name: string;
    description: string;
    /** Rise/Fall strategies take a duration in ticks. */
    uses_duration?: boolean;
    create: (o: { symbol: string; duration: number }) => TStrategy;
};

const always =
    (name: string, contract_type: string, digit?: number) =>
    ({ symbol, duration }: { symbol: string; duration: number }): TStrategy => ({
        name,
        markets: [symbol],
        history: 1,
        decide: () => ({
            symbol,
            contract_type,
            digit,
            duration: contract_type === 'CALL' || contract_type === 'PUT' ? duration : 1,
            reason: 'Every opportunity',
        }),
    });

export const STRATEGY_CATALOG: TCatalogEntry[] = [
    ...PATTERN_PRESETS.map(p => ({
        id: `pattern-${p.id}`,
        group: 'Pattern Bots',
        name: p.name,
        description: `${p.description} After a loss: ${getPreset(p.recovery).name}.`,
        create: ({ symbol }: { symbol: string }) =>
            createDigitStrategy({
                name: p.name,
                markets: [symbol],
                rule: p.rule(p.default_confirmation),
                recovery_rule: getPreset(p.recovery).rule(getPreset(p.recovery).default_confirmation),
            }),
    })),
    {
        id: 'recovery-over-under',
        group: 'Recovery Trader',
        name: 'Recovery Trader · Over 4 / Under 5',
        description: '3 digits in a row at 0-4 → Over 4, at 5-9 → Under 5. After a loss, waits for 6.',
        create: ({ symbol }) =>
            createDigitStrategy({
                name: 'Recovery Trader',
                markets: [symbol],
                rule: rangeBounceRule(3, 4, 5),
                recovery_rule: rangeBounceRule(6, 4, 5),
            }),
    },
    {
        id: 'recovery-even-odd',
        group: 'Recovery Trader',
        name: 'Recovery Trader · Even / Odd',
        description: '3 even digits in a row → Odd, 3 odd → Even. After a loss, waits for 6.',
        create: ({ symbol }) =>
            createDigitStrategy({
                name: 'Recovery Trader',
                markets: [symbol],
                rule: parityRule(3, 'swap'),
                recovery_rule: parityRule(6, 'swap'),
            }),
    },
    {
        id: 'scanner-default',
        group: 'Market Scanner',
        name: 'Scanner setup · Over 2 / Under 7',
        description: '3 digits in a row at 0-2 → Over 2; 3 digits at 7-9 → Under 7.',
        create: ({ symbol }) =>
            createDigitStrategy({ name: 'Market Scanner', markets: [symbol], rule: rangeBounceRule(3, 2, 7) }),
    },
    ...PRICE_STRATEGIES.map(s => ({
        id: `auto-${s.id}`,
        group: 'Auto Strategies · Rise/Fall',
        name: s.name,
        description: s.description,
        uses_duration: true,
        create: ({ symbol, duration }: { symbol: string; duration: number }) =>
            createPriceStrategy({ definition: s, symbol, duration, cooldown_ticks: 5 }),
    })),
    ...DIGIT_STRATEGIES.map(s => ({
        id: `auto-${s.id}`,
        group: 'Auto Strategies · Digits',
        name: s.name,
        description: s.description,
        create: ({ symbol }: { symbol: string }) => s.build(symbol, 100, 5),
    })),
    {
        id: 'baseline-even',
        group: 'Baselines (for comparison)',
        name: 'Always Even',
        description: 'Buys Even at every opportunity, no rule at all.',
        create: always('Always Even', 'DIGITEVEN'),
    },
    {
        id: 'baseline-over4',
        group: 'Baselines (for comparison)',
        name: 'Always Over 4',
        description: 'Buys Over 4 at every opportunity, no rule at all.',
        create: always('Always Over 4', 'DIGITOVER', 4),
    },
    {
        id: 'baseline-rise',
        group: 'Baselines (for comparison)',
        name: 'Always Rise',
        description: 'Buys Rise at every opportunity, no rule at all.',
        uses_duration: true,
        create: always('Always Rise', 'CALL'),
    },
];

export const getCatalogEntry = (id: string) => STRATEGY_CATALOG.find(e => e.id === id) ?? STRATEGY_CATALOG[0];
