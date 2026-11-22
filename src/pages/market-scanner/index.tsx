import React from 'react';
import classNames from 'classnames';
import AutoSession from '@/components/vindolar/auto-session';
import NumberField from '@/components/vindolar/number-field';
import { useAutoTrader } from '@/hooks/useAutoTrader';
import { useMarketDataStatus, useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { computeDigitStats } from '@/services/vindolar/digit-stats';
import { createDigitStrategy, rangeBounceRule } from '@/services/vindolar/digit-strategies';
import { TMarketSymbol } from '@/services/vindolar/market-data';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';

const ID = 'market-scanner';
const STATS_WINDOW = 100;

type TSetup = { over: number; under: number; count: number; use_over: boolean; use_under: boolean };

const ScannerRow = ({ market, setup }: { market: TMarketSymbol; setup: TSetup }) => {
    const ticks = useTicks(market.symbol, STATS_WINDOW);
    const stats = React.useMemo(() => computeDigitStats(ticks, 4), [ticks]);
    const latest = ticks[ticks.length - 1];
    const recent = ticks.slice(-setup.count).map(t => t.digit);
    const has_run = recent.length === setup.count;
    const over_ready = setup.use_over && has_run && recent.every(d => d <= setup.over);
    const under_ready = setup.use_under && has_run && recent.every(d => d >= setup.under);
    const top = stats.most[0];

    return (
        <tr className={classNames({ 'is-ready': over_ready || under_ready })}>
            <td>
                <strong>{market.name}</strong>
                <small className='vd-scanner__live'>{ticks.length ? localize('Live') : localize('Loading…')}</small>
            </td>
            <td className='vd-scanner__num'>{latest ? latest.quote.toFixed(market.pip_size) : '—'}</td>
            <td className='vd-scanner__num'>{ticks.slice(-3).map(t => t.digit).join(', ') || '—'}</td>
            <td>
                <span className='vd-scanner__pill'>
                    {top !== undefined ? `${localize('Top')} ${top} (${stats.percentages[top].toFixed(0)}%)` : '—'} | O&gt;4{' '}
                    {stats.over.toFixed(0)}% | U&lt;5 {stats.under.toFixed(0)}%
                </span>
            </td>
            <td>
                {setup.use_over ? (
                    <span className={classNames('vd-scanner__flag', { 'is-on': over_ready })}>
                        {localize('Over')} {setup.over} · {over_ready ? localize('Yes') : localize('No')}
                    </span>
                ) : (
                    '—'
                )}
            </td>
            <td>
                {setup.use_under ? (
                    <span className={classNames('vd-scanner__flag', { 'is-on': under_ready })}>
                        {localize('Under')} {setup.under} · {under_ready ? localize('Yes') : localize('No')}
                    </span>
                ) : (
                    '—'
                )}
            </td>
        </tr>
    );
};

const MarketScanner = () => {
    const { symbols } = useVolatilitySymbols();
    const is_connected = useMarketDataStatus();
    const { state } = useAutoTrader(ID);
    const is_running = !['idle', 'stopped'].includes(state.status);
    const [setup, setSetup] = usePersistentState<TSetup>('vd_scanner_setup', {
        over: 2,
        under: 7,
        count: 3,
        use_over: true,
        use_under: true,
    });
    const [filter, setFilter] = React.useState('');
    const update = (patch: Partial<TSetup>) => setSetup(previous => ({ ...previous, ...patch }));

    const shown = symbols.filter(
        s => !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.symbol.toLowerCase().includes(filter.toLowerCase())
    );

    const buildStrategy = () =>
        createDigitStrategy({
            name: 'Market Scanner',
            markets: symbols.map(s => s.symbol),
            rule: rangeBounceRule(setup.count, setup.use_over ? setup.over : null, setup.use_under ? setup.under : null),
        });

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Automation')}
                title={localize('Pulse AI Scanner')}
                subtitle={localize('Watches every volatility market and trades the first one whose setup matches.')}
            />

            <div className='vd-page__columns'>
                <section className='vd-card'>
                    <div className='vd-scanner__toolbar'>
                        <h3 className='vd-card__title'>
                            {localize('Active markets')} ({symbols.length})
                        </h3>
                        <span className={classNames('vd-live', { 'vd-live--off': !is_connected })}>
                            {is_connected ? localize('Live') : localize('Connecting…')}
                        </span>
                        <input
                            className='vd-select vd-scanner__filter'
                            placeholder={localize('Filter by market or symbol')}
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            aria-label={localize('Filter markets')}
                        />
                    </div>
                    <div className='vd-trade-log vd-scanner'>
                        <table>
                            <thead>
                                <tr>
                                    <th>{localize('Market')}</th>
                                    <th>{localize('Price')}</th>
                                    <th>{localize('Last digits')}</th>
                                    <th>{localize('Pattern stats (100 ticks)')}</th>
                                    <th>{localize('Over setup')}</th>
                                    <th>{localize('Under setup')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map(market => (
                                    <ScannerRow key={market.symbol} market={market} setup={setup} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <div className='vd-card'>
                    <AutoSession
                        id={ID}
                        buildStrategy={buildStrategy}
                        defaults={{ stake: 1, take_profit: 10, stop_loss: 30, martingale: false, max_stake: 8 }}
                        start_label={localize('Start scanner bot')}
                    >
                        <p className='vd-card__text'>
                            {localize(
                                'Over setup: the last {{n}} digits are all {{o}} or lower → trade Over {{o}}. Under setup: the last {{n}} digits are all {{u}} or higher → trade Under {{u}}.',
                                { n: setup.count, o: setup.over, u: setup.under }
                            )}
                        </p>
                        <div className='vd-row'>
                            <NumberField label={localize('Digits in a row')} value={setup.count} min={1} max={10} decimals={0} disabled={is_running} onChange={count => update({ count })} />
                            <NumberField label={localize('Over setup digit')} value={setup.over} min={0} max={8} decimals={0} disabled={is_running} onChange={over => update({ over })} />
                            <NumberField label={localize('Under setup digit')} value={setup.under} min={1} max={9} decimals={0} disabled={is_running} onChange={under => update({ under })} />
                        </div>
                        <div className='vd-row'>
                            <label className='vd-switch'>
                                <input type='checkbox' checked={setup.use_over} disabled={is_running || !setup.use_under} onChange={e => update({ use_over: e.target.checked })} />
                                <span className='vd-switch__track' aria-hidden='true' />
                                <span>{localize('Over setup')}</span>
                            </label>
                            <label className='vd-switch'>
                                <input type='checkbox' checked={setup.use_under} disabled={is_running || !setup.use_over} onChange={e => update({ use_under: e.target.checked })} />
                                <span className='vd-switch__track' aria-hidden='true' />
                                <span>{localize('Under setup')}</span>
                            </label>
                        </div>
                    </AutoSession>
                </div>
            </div>
        </div>
    );
};

export default MarketScanner;
