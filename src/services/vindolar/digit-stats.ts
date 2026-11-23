/**
 * Pure helpers for tick / digit statistics. No network, no React — easy to unit test.
 */

export type TTick = {
    epoch: number;
    quote: number;
    /** Last digit of the quote, read at the market's decimal precision (pip size). */
    digit: number;
};

export type TDigitStats = {
    /** Number of ticks the stats are based on. */
    sample: number;
    /** How often each digit 0-9 appeared. */
    counts: number[];
    /** Percentage for each digit 0-9 (0-100). */
    percentages: number[];
    /** Digit(s) that appeared most / least often. */
    most: number[];
    least: number[];
    even: number;
    odd: number;
    /** Share of tick-to-tick moves that went up / down (unchanged ticks are ignored). */
    rise: number;
    fall: number;
    /** Share of digits above `barrier` and at or below it (e.g. barrier 4: Over 4 = 5-9, Under 5 = 0-4). */
    over: number;
    under: number;
    barrier: number;
};

/**
 * Last digit of a quote at the market's decimal precision.
 * `1627.4` with pip size 2 is shown as `1627.40`, so its last digit is 0, not 4.
 */
export const getLastDigit = (quote: number, pip_size: number): number => {
    const decimals = Math.max(0, Math.round(pip_size));
    const text = quote.toFixed(decimals);
    return Number(text.charAt(text.length - 1));
};

const percent = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

export const computeDigitStats = (ticks: TTick[], barrier = 4): TDigitStats => {
    const counts = new Array(10).fill(0);
    let even = 0;
    let over = 0;
    let rise = 0;
    let fall = 0;

    ticks.forEach((tick, i) => {
        counts[tick.digit] += 1;
        if (tick.digit % 2 === 0) even += 1;
        if (tick.digit > barrier) over += 1;
        if (i > 0) {
            const previous = ticks[i - 1].quote;
            if (tick.quote > previous) rise += 1;
            else if (tick.quote < previous) fall += 1;
        }
    });

    const sample = ticks.length;
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const moves = rise + fall;

    return {
        sample,
        counts,
        percentages: counts.map(count => percent(count, sample)),
        most: sample ? counts.flatMap((count, digit) => (count === max ? [digit] : [])) : [],
        least: sample ? counts.flatMap((count, digit) => (count === min ? [digit] : [])) : [],
        even: percent(even, sample),
        odd: sample ? 100 - percent(even, sample) : 0,
        rise: percent(rise, moves),
        fall: moves ? 100 - percent(rise, moves) : 0,
        over: percent(over, sample),
        under: sample ? 100 - percent(over, sample) : 0,
        barrier,
    };
};

/**
 * Length of the run at the end of the list where `test` gives the same answer.
 * E.g. digits [2, 3, 4, 6, 8] with `d => d % 2 === 0` → { value: true, length: 3 }.
 */
export const getCurrentStreak = <T>(items: T[], test: (item: T) => boolean) => {
    if (!items.length) return { value: false, length: 0 };
    const value = test(items[items.length - 1]);
    let length = 0;
    for (let i = items.length - 1; i >= 0 && test(items[i]) === value; i--) length += 1;
    return { value, length };
};

/** Display name ordering: 1-second indices first, then by volatility number. */
export const sortVolatilitySymbols = <T extends { symbol: string; name: string }>(symbols: T[]): T[] => {
    const volatilityOf = (name: string) => Number(/Volatility (\d+)/.exec(name)?.[1] ?? 999);
    const isOneSecond = (symbol: string) => symbol.startsWith('1HZ');
    return [...symbols].sort((a, b) => {
        if (isOneSecond(a.symbol) !== isOneSecond(b.symbol)) return isOneSecond(a.symbol) ? -1 : 1;
        return volatilityOf(a.name) - volatilityOf(b.name);
    });
};

export type TUnusualness = {
    /** How far the most unusual statistic is from fair odds, in standard deviations (|z|). */
    score: number;
    /** Plain-language description, e.g. "Even at 62% (fair: 50%)". */
    label: string;
    /** Which way to look if you want to trade it: 'even' | 'odd' | 'over' | 'under' | 'digit-<d>-hot' | 'digit-<d>-cold'. */
    kind: string;
};

/**
 * The single most unusual statistic in recent ticks, measured against fair odds (each digit 10%,
 * even/odd and 0-4/5-9 50%). On a random market, |z| above 2 happens about 1 time in 20 by chance alone.
 */
export const mostUnusual = (ticks: TTick[]): TUnusualness => {
    const n = ticks.length;
    if (n < 30) return { score: 0, label: 'Not enough ticks yet', kind: 'none' };
    const s = computeDigitStats(ticks, 4);
    const z = (share: number, p: number) => (share / 100 - p) / Math.sqrt((p * (1 - p)) / n);
    const candidates: TUnusualness[] = [
        {
            score: Math.abs(z(s.even, 0.5)),
            label: `${s.even >= 50 ? 'Even' : 'Odd'} at ${Math.max(s.even, s.odd).toFixed(0)}% (fair: 50%)`,
            kind: s.even >= 50 ? 'even' : 'odd',
        },
        {
            score: Math.abs(z(s.over, 0.5)),
            label: `${s.over >= 50 ? 'Digits 5-9' : 'Digits 0-4'} at ${Math.max(s.over, s.under).toFixed(0)}% (fair: 50%)`,
            kind: s.over >= 50 ? 'over' : 'under',
        },
        ...s.percentages.map((p, d) => ({
            score: Math.abs(z(p, 0.1)),
            label: `Digit ${d} at ${p.toFixed(1)}% (fair: 10%)`,
            kind: `digit-${d}-${p >= 10 ? 'hot' : 'cold'}`,
        })),
    ];
    return candidates.reduce((best, c) => (c.score > best.score ? c : best));
};
