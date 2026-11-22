/**
 * Digit-pattern strategies for the Recovery Trader, Pattern Bots and Market Scanner.
 * Each looks at the last digits of a market and may return a trade. Pure logic (tested).
 *
 * Reminder shown in the UI: on volatility indices each digit is random, so a run of digits does not
 * make the next digit more or less likely. These rules decide *when* to trade, not *whether you win*.
 */
import type { TStrategy, TTradeDecision } from './auto-trader';
import { TTick } from './digit-stats';

export type TDigitTrade = Omit<TTradeDecision, 'symbol'>;

/** A rule that looks at recent digits (oldest first) and may return a trade. */
export type TDigitRule = (digits: number[]) => TDigitTrade | null;

const lastN = (digits: number[], n: number) => (digits.length >= n ? digits.slice(-n) : null);
const allIn = (digits: number[] | null, low: number, high: number) => !!digits && digits.every(d => d >= low && d <= high);

/** Run of `count` digits all ≤ `low_max` → Over `low_max`; all ≥ `high_min` → Under `high_min`. */
export const rangeBounceRule =
    (count: number, low_max: number | null, high_min: number | null): TDigitRule =>
    digits => {
        const recent = lastN(digits, count);
        if (low_max !== null && allIn(recent, 0, low_max)) {
            return { contract_type: 'DIGITOVER', digit: low_max, duration: 1, reason: `Last ${count} digits ≤ ${low_max}` };
        }
        if (high_min !== null && allIn(recent, high_min, 9)) {
            return { contract_type: 'DIGITUNDER', digit: high_min, duration: 1, reason: `Last ${count} digits ≥ ${high_min}` };
        }
        return null;
    };

/** Run of `count` digits of the same parity → trade the opposite parity ('swap') or the same ('ride'). */
export const parityRule =
    (count: number, mode: 'swap' | 'ride'): TDigitRule =>
    digits => {
        const recent = lastN(digits, count);
        if (!recent) return null;
        const all_even = recent.every(d => d % 2 === 0);
        const all_odd = recent.every(d => d % 2 !== 0);
        if (!all_even && !all_odd) return null;
        const trade_even = mode === 'swap' ? all_odd : all_even;
        return {
            contract_type: trade_even ? 'DIGITEVEN' : 'DIGITODD',
            duration: 1,
            reason: `Last ${count} digits all ${all_even ? 'even' : 'odd'}`,
        };
    };

/** Last `count` digits alternate even/odd → trade the parity that continues the zigzag. */
export const zigzagRule =
    (count: number): TDigitRule =>
    digits => {
        const recent = lastN(digits, count);
        if (!recent) return null;
        const alternates = recent.every((d, i) => i === 0 || d % 2 !== recent[i - 1] % 2);
        if (!alternates) return null;
        const last_even = recent[recent.length - 1] % 2 === 0;
        return { contract_type: last_even ? 'DIGITODD' : 'DIGITEVEN', duration: 1, reason: `Last ${count} digits alternate` };
    };

/** Same digit twice in a row → Over 4 if it is 0-4, Under 5 if it is 5-9. */
export const repeatRule: TDigitRule = digits => {
    const recent = lastN(digits, 2);
    if (!recent || recent[0] !== recent[1]) return null;
    return recent[1] <= 4
        ? { contract_type: 'DIGITOVER', digit: 4, duration: 1, reason: `Digit ${recent[1]} repeated` }
        : { contract_type: 'DIGITUNDER', digit: 5, duration: 1, reason: `Digit ${recent[1]} repeated` };
};

export type TPatternPreset = {
    id: string;
    name: string;
    description: string;
    chips: string[];
    /** Rule after a win / at start. */
    rule: (confirmation: number) => TDigitRule;
    /** Preset used for the next trade after a loss. */
    recovery: string;
    default_confirmation: number;
};

export const PATTERN_PRESETS: TPatternPreset[] = [
    {
        id: 'low-bounce',
        name: 'Low Bounce',
        description: 'A run of digits 0-2 triggers Over 2.',
        chips: ['Over 2'],
        rule: c => rangeBounceRule(c, 2, null),
        recovery: 'midline-split',
        default_confirmation: 2,
    },
    {
        id: 'high-bounce',
        name: 'High Bounce',
        description: 'A run of digits 7-9 triggers Under 7.',
        chips: ['Under 7'],
        rule: c => rangeBounceRule(c, null, 7),
        recovery: 'midline-split',
        default_confirmation: 2,
    },
    {
        id: 'midline-split',
        name: 'Midline Split',
        description: 'A run of 0-4 triggers Over 4; a run of 5-9 triggers Under 5.',
        chips: ['Over 4', 'Under 5'],
        rule: c => rangeBounceRule(c, 4, 5),
        recovery: 'parity-swap',
        default_confirmation: 3,
    },
    {
        id: 'parity-swap',
        name: 'Parity Swap',
        description: 'A run of even digits triggers Odd; a run of odd digits triggers Even.',
        chips: ['Odd', 'Even'],
        rule: c => parityRule(c, 'swap'),
        recovery: 'midline-split',
        default_confirmation: 3,
    },
    {
        id: 'parity-ride',
        name: 'Parity Ride',
        description: 'A run of even digits triggers Even; a run of odd digits triggers Odd.',
        chips: ['Even', 'Odd'],
        rule: c => parityRule(c, 'ride'),
        recovery: 'parity-swap',
        default_confirmation: 2,
    },
    {
        id: 'extremes',
        name: 'Extremes',
        description: 'A run of 0-1 triggers Over 1; a run of 8-9 triggers Under 8.',
        chips: ['Over 1', 'Under 8'],
        rule: c => rangeBounceRule(c, 1, 8),
        recovery: 'midline-split',
        default_confirmation: 1,
    },
    {
        id: 'zigzag',
        name: 'Zigzag',
        description: 'When digits alternate even/odd, trade the parity that continues the pattern.',
        chips: ['Even', 'Odd'],
        rule: c => zigzagRule(Math.max(c, 3)),
        recovery: 'parity-swap',
        default_confirmation: 4,
    },
    {
        id: 'double-digit',
        name: 'Double Digit',
        description: 'A repeated digit triggers Over 4 (if 0-4) or Under 5 (if 5-9).',
        chips: ['Over 4', 'Under 5'],
        rule: () => repeatRule,
        recovery: 'midline-split',
        default_confirmation: 2,
    },
];

export const getPreset = (id: string) => PATTERN_PRESETS.find(p => p.id === id) ?? PATTERN_PRESETS[0];

/**
 * Engine strategy that scans `markets` and trades the first market whose digits match.
 * After a loss it uses `recovery_rule` (and/or a longer confirmation); after a win it returns to `rule`.
 */
export const createDigitStrategy = ({
    name,
    markets,
    rule,
    recovery_rule,
    history = 30,
}: {
    name: string;
    markets: string[];
    rule: TDigitRule;
    recovery_rule?: TDigitRule;
    history?: number;
}): TStrategy => {
    let in_recovery = false;
    return {
        name,
        markets,
        history,
        decide: ({ symbol, ticks }: { symbol: string; ticks: TTick[] }) => {
            const active = in_recovery && recovery_rule ? recovery_rule : rule;
            const trade = active(ticks.map(t => t.digit));
            if (!trade) return null;
            return { ...trade, symbol, reason: `${in_recovery ? 'Recovery · ' : ''}${trade.reason ?? ''}` };
        },
        onResult: record => {
            in_recovery = record.result === 'lost';
        },
    };
};
