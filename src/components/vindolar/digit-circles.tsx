import React from 'react';
import classNames from 'classnames';
import { useTicks } from '@/hooks/useMarketData';
import { computeDigitStats, TDigitStats } from '@/services/vindolar/digit-stats';
import { localize } from '@deriv-com/translations';
import { rankDigits } from '../../pages/analysis-tools/components';
import './digit-circles.scss';

/** Ticks the live digit circles are based on. */
export const DIGIT_CIRCLE_TICKS = 1000;

type TDigitCirclesProps = {
    stats: TDigitStats;
    /** Last digit of the newest tick: marked with a red pointer. */
    current_digit?: number;
    /** Digit picked for the trade (barrier): drawn as a dark disc. */
    selected_digit?: number;
    /** Makes the circles clickable, e.g. to pick the barrier. */
    onSelect?: (digit: number) => void;
    className?: string;
};

/**
 * Digits 0-9 as two rows of five circles. Each arc shows how often the digit came up
 * (full circle = 20%). The most frequent digit gets a teal arc, the least frequent a red one.
 */
export const DigitCircles = ({ stats, current_digit, selected_digit, onSelect, className }: TDigitCirclesProps) => {
    const tones = rankDigits(stats);
    const size = 64;
    const stroke = 5;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;

    return (
        <div className={classNames('vd-dc', className)} role='list' aria-label={localize('Last digit frequency')}>
            {stats.percentages.map((percentage, digit) => {
                const tone = tones[digit];
                const fill = Math.min(percentage / 20, 1);
                const Tag = onSelect ? 'button' : 'div';
                return (
                    <Tag
                        // eslint-disable-next-line react/no-array-index-key
                        key={digit}
                        role='listitem'
                        type={onSelect ? 'button' : undefined}
                        className={classNames('vd-dc__item', {
                            'vd-dc__item--top': tone === 'top',
                            'vd-dc__item--low': tone === 'low',
                            'vd-dc__item--selected': digit === selected_digit,
                            'vd-dc__item--clickable': Boolean(onSelect),
                        })}
                        onClick={onSelect ? () => onSelect(digit) : undefined}
                        aria-pressed={onSelect ? digit === selected_digit : undefined}
                        title={`${localize('Digit')} ${digit}: ${percentage.toFixed(1)}%`}
                    >
                        <svg viewBox={`0 0 ${size} ${size}`} aria-hidden='true'>
                            <circle className='vd-dc__disc' cx={size / 2} cy={size / 2} r={radius - stroke / 2} />
                            <circle
                                className='vd-dc__track'
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                strokeWidth={stroke}
                            />
                            <circle
                                className='vd-dc__arc'
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                strokeWidth={stroke}
                                strokeLinecap='round'
                                strokeDasharray={`${circumference * fill} ${circumference}`}
                                // Centred on the bottom of the circle, growing to both sides.
                                transform={`rotate(${90 - fill * 180} ${size / 2} ${size / 2})`}
                            />
                        </svg>
                        <span className='vd-dc__label'>
                            <strong>{digit}</strong>
                            <small>{stats.sample ? `${percentage.toFixed(1)}%` : '—'}</small>
                        </span>
                        {digit === current_digit && (
                            <span className='vd-dc__pointer' aria-label={localize('Latest digit')} />
                        )}
                    </Tag>
                );
            })}
        </div>
    );
};

/** Digit circles that follow a market on their own (for pages that don't keep long tick history). */
export const LiveDigitCircles = ({
    symbol,
    selected_digit,
    className,
}: {
    symbol?: string;
    selected_digit?: number;
    className?: string;
}) => {
    const ticks = useTicks(symbol, DIGIT_CIRCLE_TICKS);
    const stats = React.useMemo(() => computeDigitStats(ticks), [ticks]);
    return (
        <section className={classNames('vd-dc-card', className)} aria-label={localize('Digit circles')}>
            <header className='vd-dc-card__head'>
                <span>{localize('Last digit stats')}</span>
                <small>{localize('Last {{count}} ticks', { count: stats.sample || DIGIT_CIRCLE_TICKS })}</small>
            </header>
            <DigitCircles
                stats={stats}
                current_digit={ticks[ticks.length - 1]?.digit}
                selected_digit={selected_digit}
            />
        </section>
    );
};

export default DigitCircles;
