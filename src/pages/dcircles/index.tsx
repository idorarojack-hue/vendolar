import React from 'react';
import classNames from 'classnames';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { computeDigitStats } from '@/services/vindolar/digit-stats';
import { localize } from '@deriv-com/translations';
import { DigitRings, rankDigits } from '../analysis-tools/components';
import '../analysis-tools/analysis-tools.scss';
import './dcircles.scss';

type TPatternMode = 'even_odd' | 'over_under';

const WINDOWS = [100, 500, 1000];
const PATTERN_LENGTH = 50;
const STREAM_LENGTH = 120;

/** Two big percentage cards: left side green, right side red. */
const SplitCards = ({
    left,
    right,
}: {
    left: { label: string; value: number };
    right: { label: string; value: number };
}) => (
    <div className='vd-dcx-split'>
        <div className='vd-dcx-split__card vd-dcx-split__card--up'>
            <strong>{left.value.toFixed(1)}%</strong>
            <span>{left.label}</span>
        </div>
        <div className='vd-dcx-split__card vd-dcx-split__card--down'>
            <strong>{right.value.toFixed(1)}%</strong>
            <span>{right.label}</span>
        </div>
    </div>
);

const DCircles = () => {
    const { symbols } = useVolatilitySymbols();
    const [symbol, setSymbol] = usePersistentState('vd_dcircles_symbol', '1HZ10V');
    const [window_size, setWindowSize] = usePersistentState('vd_dcircles_window', 1000);
    const [mode, setMode] = usePersistentState<TPatternMode>('vd_dcircles_mode', 'even_odd');
    const [barrier, setBarrier] = usePersistentState('vd_dcircles_barrier', 4);

    const market = symbols.find(s => s.symbol === symbol);
    const ticks = useTicks(symbol, window_size);
    const stats = React.useMemo(() => computeDigitStats(ticks, barrier), [ticks, barrier]);
    const latest = ticks[ticks.length - 1];
    const pip = market?.pip_size ?? 2;

    // Highest, 2nd highest, lowest, 2nd lowest digit
    const ranks = rankDigits(stats);
    const digitWith = (tone: string) => Number(Object.keys(ranks).find(d => ranks[Number(d)] === tone));
    const rank_cards = [
        { tone: 'top', label: localize('Highest') },
        { tone: 'second', label: localize('2nd') },
        { tone: 'low', label: localize('Lowest') },
        { tone: 'second-low', label: localize('2nd low') },
    ].map(card => {
        const digit = digitWith(card.tone);
        return { ...card, digit, value: Number.isNaN(digit) ? undefined : stats.percentages[digit] };
    });

    const recent = ticks.slice(-PATTERN_LENGTH).map(t => t.digit);
    const pattern =
        mode === 'even_odd'
            ? recent.map(d => ({ letter: d % 2 === 0 ? 'E' : 'O', up: d % 2 === 0 }))
            : recent.map(d => ({ letter: d > barrier ? 'O' : 'U', up: d > barrier }));
    // Newest first, so the latest digit is always in view.
    const stream = ticks
        .slice(-STREAM_LENGTH)
        .map(t => t.digit)
        .reverse();

    return (
        <div className='vd-dcx'>
            <div className='vd-dcx__inner'>
                <header className='vd-dcx__head'>
                    <div className='vd-dcx__price'>
                        <strong>{latest ? latest.quote.toFixed(pip) : '—'}</strong>
                        <span>{localize('Current price')}</span>
                    </div>
                    <label className='vd-dcx__market'>
                        <select
                            value={symbol}
                            onChange={e => setSymbol(e.target.value)}
                            aria-label={localize('Market')}
                        >
                            {symbols.length === 0 && <option value={symbol}>{localize('Loading…')}</option>}
                            {symbols.map(s => (
                                <option key={s.symbol} value={s.symbol}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                        <span>{localize('Market')}</span>
                    </label>
                </header>

                <section className='vd-dcx-card'>
                    <h3 className='vd-dcx-card__title'>{localize('Digit distribution')}</h3>
                    <div className='vd-dcx-rings'>
                        <DigitRings stats={stats} current_digit={latest?.digit} size={64} />
                    </div>
                    <div className='vd-dcx-ranks'>
                        {rank_cards.map(card => (
                            <div key={card.tone} className={`vd-dcx-ranks__item vd-dcx-ranks__item--${card.tone}`}>
                                <small>{card.label}</small>
                                <strong>
                                    {card.value === undefined ? '—' : `${card.value.toFixed(2)}%`}
                                    {card.value !== undefined && <em> · {card.digit}</em>}
                                </strong>
                            </div>
                        ))}
                    </div>
                </section>

                <section className='vd-dcx-card'>
                    <div className='vd-dcx-card__row'>
                        <h3 className='vd-dcx-card__title vd-dcx-card__title--left'>{localize('Pattern analysis')}</h3>
                        <div className='vd-dcx-toggle' role='tablist' aria-label={localize('Pattern')}>
                            <button
                                type='button'
                                role='tab'
                                aria-selected={mode === 'even_odd'}
                                className={classNames({ 'is-active': mode === 'even_odd' })}
                                onClick={() => setMode('even_odd')}
                            >
                                {localize('Even/Odd')}
                            </button>
                            <button
                                type='button'
                                role='tab'
                                aria-selected={mode === 'over_under'}
                                className={classNames({ 'is-active': mode === 'over_under' })}
                                onClick={() => setMode('over_under')}
                            >
                                {localize('Over/Under')}
                            </button>
                        </div>
                    </div>
                    {mode === 'over_under' && (
                        <label className='vd-dcx-barrier'>
                            <span>{localize('Barrier')}</span>
                            <select value={barrier} onChange={e => setBarrier(Number(e.target.value))}>
                                {Array.from({ length: 9 }, (_, d) => (
                                    <option key={d} value={d}>
                                        {localize('Over {{o}} / Under {{u}}', { o: d, u: d + 1 })}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {mode === 'even_odd' ? (
                        <SplitCards
                            left={{ label: localize('Even'), value: stats.even }}
                            right={{ label: localize('Odd'), value: stats.odd }}
                        />
                    ) : (
                        <SplitCards
                            left={{ label: localize('Over {{n}}', { n: barrier }), value: stats.over }}
                            right={{ label: localize('Under {{n}}', { n: barrier + 1 }), value: stats.under }}
                        />
                    )}
                    <p className='vd-dcx-card__label'>{localize('Last {{n}} digits pattern', { n: PATTERN_LENGTH })}</p>
                    <div className='vd-dcx-chips'>
                        {pattern.map((p, i) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <span key={i} className={classNames('vd-dcx-chip', p.up ? 'is-up' : 'is-down')}>
                                {p.letter}
                            </span>
                        ))}
                    </div>
                </section>

                <section className='vd-dcx-card'>
                    <h3 className='vd-dcx-card__title'>{localize('Market movement')}</h3>
                    <SplitCards
                        left={{ label: localize('Rise'), value: stats.rise }}
                        right={{ label: localize('Fall'), value: stats.fall }}
                    />
                </section>

                <section className='vd-dcx-card'>
                    <h3 className='vd-dcx-card__title'>{localize('Last digits stream')}</h3>
                    <div className='vd-dcx-stream' aria-label={localize('Latest digits, newest first')}>
                        {stream.map((d, i) => (
                            <span
                                // eslint-disable-next-line react/no-array-index-key
                                key={i}
                                className={classNames('vd-dcx-chip', d % 2 === 0 ? 'is-up' : 'is-down', {
                                    'is-latest': i === 0,
                                })}
                            >
                                {d}
                            </span>
                        ))}
                    </div>
                </section>

                <section className='vd-dcx-card'>
                    <h3 className='vd-dcx-card__title'>{localize('Statistics')}</h3>
                    <div className='vd-dcx-stats'>
                        <label>
                            <span>{localize('Total ticks')}</span>
                            <select value={window_size} onChange={e => setWindowSize(Number(e.target.value))}>
                                {WINDOWS.map(w => (
                                    <option key={w} value={w}>
                                        {w}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div>
                            <span>{localize('Ticks loaded')}</span>
                            <strong>{stats.sample}</strong>
                        </div>
                        <div>
                            <span>{localize('Pip size')}</span>
                            <strong>{pip}</strong>
                        </div>
                    </div>
                    <p className='vd-dcx-note'>
                        {localize(
                            'These describe past ticks. Volatility indices are random, so they do not predict the next digit.'
                        )}
                    </p>
                </section>
            </div>
        </div>
    );
};

export default DCircles;
