import classNames from 'classnames';
import { TDigitStats } from '@/services/vindolar/digit-stats';

/** Rank colour of a digit: most frequent, second most, second least, least. */
export type TDigitTone = 'top' | 'second' | 'second-low' | 'low';

/** Ranks digits by how often they appeared: top / second / second-low / low (others plain). */
export const rankDigits = (stats: TDigitStats): Record<number, TDigitTone> => {
    if (!stats.sample) return {};
    const order = stats.percentages
        .map((p, digit) => ({ p, digit }))
        .sort((a, b) => b.p - a.p || a.digit - b.digit)
        .map(o => o.digit);
    return { [order[0]]: 'top', [order[1]]: 'second', [order[8]]: 'second-low', [order[9]]: 'low' };
};

/** One digit 0-9: a ring whose arc shows its share (full ring = 20%), filled with its rank colour. */
export const DigitRing = ({
    digit,
    percentage,
    tone,
    is_current,
    size = 44,
}: {
    digit: number;
    percentage: number;
    tone?: TDigitTone;
    is_current: boolean;
    size?: number;
}) => {
    const stroke = Math.max(3, Math.round(size / 12));
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const fill = Math.min(percentage / 20, 1);

    return (
        <div
            className={classNames('vd-digit', tone && `vd-digit--${tone}`, { 'vd-digit--current': is_current })}
            style={{ width: size, height: size }}
            title={`Digit ${digit}: ${percentage.toFixed(1)}%`}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden='true'>
                <circle className='vd-digit__disc' cx={size / 2} cy={size / 2} r={radius - stroke / 2} />
                <circle className='vd-digit__track' cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
                <circle
                    className='vd-digit__fill'
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    strokeWidth={stroke}
                    strokeDasharray={`${circumference * fill} ${circumference}`}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            <span className='vd-digit__label'>
                <strong style={{ fontSize: Math.max(12, size * 0.32) }}>{digit}</strong>
                <small style={{ fontSize: Math.max(8, size * 0.19) }}>{percentage.toFixed(1)}%</small>
            </span>
            {is_current && <span className='vd-digit__pointer' aria-label='Latest digit' />}
        </div>
    );
};

export const DigitRings = ({ stats, current_digit, size }: { stats: TDigitStats; current_digit?: number; size?: number }) => {
    const tones = rankDigits(stats);
    return (
        <div className='vd-digits'>
            {stats.percentages.map((percentage, digit) => (
                <DigitRing
                    key={digit}
                    digit={digit}
                    percentage={percentage}
                    tone={tones[digit]}
                    is_current={digit === current_digit}
                    size={size}
                />
            ))}
        </div>
    );
};

/** Two-sided bar, e.g. Even 53% | Odd 47%. Left side green, right side red, labels inside. */
export const SplitBar = ({
    left_label,
    right_label,
    left,
    right,
}: {
    left_label: string;
    right_label: string;
    left: number;
    right: number;
}) => {
    const total = left + right;
    const left_width = total > 0 ? (left / total) * 100 : 50;
    return (
        <div className='vd-split' role='img' aria-label={`${left_label} ${left.toFixed(1)}%, ${right_label} ${right.toFixed(1)}%`}>
            <div className='vd-split__left' style={{ width: `${left_width}%` }}>
                <span>
                    {left_label}: {left.toFixed(1)}%
                </span>
            </div>
            <div className='vd-split__right'>
                <span>
                    {right_label}: {right.toFixed(1)}%
                </span>
            </div>
        </div>
    );
};

/** Recent digits as small chips, newest last (green = even, red = odd). */
export const LastDigits = ({ digits, barrier }: { digits: number[]; barrier: number }) => (
    <div className='vd-last-digits'>
        {digits.map((digit, i) => (
            <span
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className={classNames('vd-last-digits__chip', {
                    'vd-last-digits__chip--even': digit % 2 === 0,
                    'vd-last-digits__chip--odd': digit % 2 !== 0,
                    'vd-last-digits__chip--over': digit > barrier,
                    'vd-last-digits__chip--latest': i === digits.length - 1,
                })}
            >
                {digit}
            </span>
        ))}
    </div>
);
