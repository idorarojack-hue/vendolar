import React from 'react';
import classNames from 'classnames';
import { useTicks } from '@/hooks/useMarketData';
import { computeDigitStats, getCurrentStreak } from '@/services/vindolar/digit-stats';
import { TMarketSymbol } from '@/services/vindolar/market-data';
import { localize } from '@deriv-com/translations';
import { DigitRings, LastDigits, SplitBar } from './components';

type TMarketDetailProps = {
    markets: TMarketSymbol[];
    symbol: string;
    onSymbolChange: (symbol: string) => void;
    tick_count: number;
    barrier: number;
};

const RECENT_DIGITS_SHOWN = 60;

const MarketDetail = ({ markets, symbol, onSymbolChange, tick_count, barrier }: TMarketDetailProps) => {
    const market = markets.find(m => m.symbol === symbol) ?? markets[0];
    const ticks = useTicks(market?.symbol, tick_count);
    const stats = React.useMemo(() => computeDigitStats(ticks, barrier), [ticks, barrier]);
    const digits = React.useMemo(() => ticks.map(t => t.digit), [ticks]);
    const latest = ticks[ticks.length - 1];
    const previous = ticks[ticks.length - 2];
    const max_percentage = Math.max(...stats.percentages, 1);

    const even_streak = getCurrentStreak(digits, d => d % 2 === 0);
    const over_streak = getCurrentStreak(digits, d => d > barrier);
    const direction_streak = getCurrentStreak(
        ticks.slice(1).map((t, i) => t.quote - ticks[i].quote).filter(move => move !== 0),
        move => move > 0
    );

    if (!market) return null;

    const direction = latest && previous ? Math.sign(latest.quote - previous.quote) : 0;

    return (
        <div className='vd-detail'>
            <section className='vd-detail__top'>
                <label className='vd-field'>
                    <span className='vd-field__label'>{localize('Market')}</span>
                    <select
                        className='vd-field__input'
                        value={market.symbol}
                        onChange={e => onSymbolChange(e.target.value)}
                    >
                        {markets.map(m => (
                            <option key={m.symbol} value={m.symbol}>
                                {m.name}
                            </option>
                        ))}
                    </select>
                </label>
                <div className='vd-detail__price'>
                    <span className='vd-field__label'>{localize('Current price')}</span>
                    <strong
                        className={classNames('vd-detail__quote', {
                            'vd-detail__quote--up': direction > 0,
                            'vd-detail__quote--down': direction < 0,
                        })}
                    >
                        {latest ? latest.quote.toFixed(market.pip_size) : '—'}
                    </strong>
                    <span className='vd-detail__latest-digit'>
                        {localize('Last digit')} <b>{latest?.digit ?? '—'}</b>
                    </span>
                </div>
            </section>

            <section className='vd-panel'>
                <h3 className='vd-panel__title'>
                    {localize('Digit frequency')}
                    <small>{localize('last {{count}} ticks', { count: stats.sample })}</small>
                </h3>
                <DigitRings stats={stats} current_digit={latest?.digit} size={56} />
                <div className='vd-histogram' aria-hidden='true'>
                    {stats.percentages.map((percentage, digit) => (
                        <div key={digit} className='vd-histogram__col'>
                            <div
                                className={classNames('vd-histogram__bar', {
                                    'vd-histogram__bar--most': stats.most.includes(digit),
                                    'vd-histogram__bar--least': stats.least.includes(digit),
                                })}
                                style={{ height: `${(percentage / max_percentage) * 100}%` }}
                            />
                            <span>{digit}</span>
                        </div>
                    ))}
                </div>
            </section>

            <section className='vd-detail__grid'>
                <div className='vd-panel'>
                    <h3 className='vd-panel__title'>{localize('Splits')}</h3>
                    <div className='vd-market-card__bars'>
                        <SplitBar left_label={localize('Even')} right_label={localize('Odd')} left={stats.even} right={stats.odd} />
                        <SplitBar left_label={localize('Rise')} right_label={localize('Fall')} left={stats.rise} right={stats.fall} />
                        <SplitBar
                            left_label={`${localize('Over')} ${barrier}`}
                            right_label={`${localize('Under')} ${barrier + 1}`}
                            left={stats.over}
                            right={stats.under}
                        />
                    </div>
                </div>
                <div className='vd-panel'>
                    <h3 className='vd-panel__title'>{localize('Current streaks')}</h3>
                    <dl className='vd-streaks'>
                        <div>
                            <dt>{even_streak.value ? localize('Even digits') : localize('Odd digits')}</dt>
                            <dd>{even_streak.length}</dd>
                        </div>
                        <div>
                            <dt>
                                {over_streak.value
                                    ? `${localize('Over')} ${barrier}`
                                    : `${localize('Under')} ${barrier + 1}`}
                            </dt>
                            <dd>{over_streak.length}</dd>
                        </div>
                        <div>
                            <dt>{direction_streak.value ? localize('Rising ticks') : localize('Falling ticks')}</dt>
                            <dd>{direction_streak.length}</dd>
                        </div>
                    </dl>
                </div>
            </section>

            <section className='vd-panel'>
                <h3 className='vd-panel__title'>
                    {localize('Recent digits')}
                    <small>{localize('newest on the right')}</small>
                </h3>
                <LastDigits digits={digits.slice(-RECENT_DIGITS_SHOWN)} barrier={barrier} />
            </section>
        </div>
    );
};

export default MarketDetail;
