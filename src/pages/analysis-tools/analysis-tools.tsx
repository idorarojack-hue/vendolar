import React from 'react';
import classNames from 'classnames';
import { useMarketDataStatus, useVolatilitySymbols } from '@/hooks/useMarketData';
import { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import MarketCard from './market-card';
import MarketDetail from './market-detail';
import './analysis-tools.scss';

const TICK_OPTIONS = [50, 100, 120, 500, 1000];
const BARRIER_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

type TView = 'all' | 'single';

const readSetting = (key: string, fallback: number) => {
    try {
        const value = Number(localStorage.getItem(key));
        return Number.isFinite(value) && localStorage.getItem(key) !== null ? value : fallback;
    } catch {
        return fallback;
    }
};

const saveSetting = (key: string, value: string | number) => {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Storage can be unavailable (private mode); settings then just aren't remembered.
    }
};

const AnalysisTools = () => {
    const { symbols, error } = useVolatilitySymbols();
    const is_connected = useMarketDataStatus();
    const [view, setView] = React.useState<TView>('all');
    const [tick_count, setTickCount] = React.useState(() => readSetting('vd_analysis_ticks', 120));
    const [barrier, setBarrier] = React.useState(() => readSetting('vd_analysis_barrier', 4));
    const [selected_symbol, setSelectedSymbol] = React.useState<string>('');

    const openMarket = React.useCallback((symbol: string) => {
        setSelectedSymbol(symbol);
        setView('single');
    }, []);

    return (
        <div className='vd-analysis vd-skin'>
            <PageBackdrop />
            <div className='vd-analysis__toolbar'>
                <div className='vd-analysis__title'>
                    <h2>{localize('Analysis Tools')}</h2>
                    <span className={classNames('vd-live', { 'vd-live--off': !is_connected })}>
                        {is_connected ? localize('Live') : localize('Connecting…')}
                    </span>
                </div>

                <div className='vd-segmented' role='tablist' aria-label={localize('View')}>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={view === 'all'}
                        className={classNames({ 'is-active': view === 'all' })}
                        onClick={() => setView('all')}
                    >
                        {localize('All markets')}
                    </button>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={view === 'single'}
                        className={classNames({ 'is-active': view === 'single' })}
                        onClick={() => setView('single')}
                    >
                        {localize('Single market')}
                    </button>
                </div>

                <div className='vd-analysis__settings'>
                    <label className='vd-field vd-field--inline'>
                        <span className='vd-field__label'>{localize('Ticks')}</span>
                        <select
                            className='vd-field__input'
                            value={tick_count}
                            onChange={e => {
                                setTickCount(Number(e.target.value));
                                saveSetting('vd_analysis_ticks', e.target.value);
                            }}
                        >
                            {TICK_OPTIONS.map(n => (
                                <option key={n} value={n}>
                                    {n}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className='vd-field vd-field--inline'>
                        <span className='vd-field__label'>{localize('Over/Under')}</span>
                        <select
                            className='vd-field__input'
                            value={barrier}
                            onChange={e => {
                                setBarrier(Number(e.target.value));
                                saveSetting('vd_analysis_barrier', e.target.value);
                            }}
                        >
                            {BARRIER_OPTIONS.map(b => (
                                <option key={b} value={b}>
                                    {localize('Over')} {b} / {localize('Under')} {b + 1}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <p className='vd-analysis__note'>
                {localize(
                    'These statistics describe past ticks only. Volatility indices are generated by a random number generator, so past digits do not predict the next one.'
                )}
            </p>

            {error && <p className='vd-analysis__error'>{localize('Could not load markets. Please refresh the page.')}</p>}

            {!error && symbols.length === 0 && <p className='vd-analysis__loading'>{localize('Loading markets…')}</p>}

            {symbols.length > 0 && view === 'all' && (
                <div className='vd-analysis__grid'>
                    {symbols.map(market => (
                        <MarketCard
                            key={market.symbol}
                            market={market}
                            tick_count={tick_count}
                            barrier={barrier}
                            onOpen={openMarket}
                        />
                    ))}
                </div>
            )}

            {symbols.length > 0 && view === 'single' && (
                <MarketDetail
                    markets={symbols}
                    symbol={selected_symbol || symbols[0].symbol}
                    onSymbolChange={setSelectedSymbol}
                    tick_count={tick_count}
                    barrier={barrier}
                />
            )}
        </div>
    );
};

export default AnalysisTools;
