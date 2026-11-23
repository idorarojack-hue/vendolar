import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import { contractName, STATUS_TEXT, TradeLog } from '@/components/vindolar/auto-session';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import { DEFAULT_SESSION, useAutoTrader, useSessionSettings } from '@/hooks/useAutoTrader';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useStore } from '@/hooks/useStore';
import { computeDigitStats } from '@/services/vindolar/digit-stats';
import { createDigitStrategy, rangeBounceRule } from '@/services/vindolar/digit-strategies';
import { TMarketSymbol } from '@/services/vindolar/market-data';
import { localize } from '@deriv-com/translations';
import ServerBots from './server-bots';
import './auto-trading.scss';

const SESSION_ID = 'auto-trading';

/**
 * Over X / Under Y setups. Entry: after `confirm` digits in a row at or below X the bot buys Over X;
 * after `confirm` digits in a row at or above Y it buys Under Y. "Pro" waits for one more digit.
 */
type TSetup = { id: string; name: string; over: number; under: number; confirm: number };

const SETUPS: TSetup[] = [
    { id: 'o2u7', name: 'Over 2 / Under 7', over: 2, under: 7, confirm: 2 },
    { id: 'o2u7-pro', name: 'Over 2 / Under 7 Pro', over: 2, under: 7, confirm: 3 },
    { id: 'o3u6', name: 'Over 3 / Under 6', over: 3, under: 6, confirm: 2 },
    { id: 'o3u6-pro', name: 'Over 3 / Under 6 Pro', over: 3, under: 6, confirm: 3 },
];

const PERIODS = [100, 250, 500, 1000];
const PATTERN_LENGTH = 3;

const getSetup = (id: string) => SETUPS.find(s => s.id === id) ?? SETUPS[0];

/** Which side (if any) the last digits confirm right now. */
const confirmedSide = (digits: number[], setup: TSetup): 'over' | 'under' | null => {
    const recent = digits.slice(-setup.confirm);
    if (recent.length < setup.confirm) return null;
    if (recent.every(d => d <= setup.over)) return 'over';
    if (recent.every(d => d >= setup.under)) return 'under';
    return null;
};

/** One market in the Live setups table: last digits coloured by whether each would have won. */
const SetupRow = ({ market, setup }: { market: TMarketSymbol; setup: TSetup }) => {
    const ticks = useTicks(market.symbol, PATTERN_LENGTH + 2);
    const digits = ticks.map(t => t.digit);
    const pattern = digits.slice(-PATTERN_LENGTH);
    const side = confirmedSide(digits, setup);
    const last = ticks[ticks.length - 1];

    return (
        <li className={classNames('vd-at-row', { 'vd-at-row--ready': side })}>
            <span className='vd-at-row__market'>
                <i className={classNames('vd-at-row__dot', { 'is-live': last })} aria-hidden='true' />
                <span>
                    <strong>{market.name}</strong>
                    <small>{last ? last.quote.toFixed(market.pip_size) : '—'}</small>
                </span>
            </span>
            <span className={classNames('vd-at-row__pattern', { 'is-ready': side === 'over' })}>
                {pattern.map((d, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <b key={i} className={d > setup.over ? 'is-win' : 'is-loss'}>
                        {d}
                    </b>
                ))}
            </span>
            <span className={classNames('vd-at-row__pattern', { 'is-ready': side === 'under' })}>
                {pattern.map((d, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <b key={i} className={d < setup.under ? 'is-win' : 'is-loss'}>
                        {d}
                    </b>
                ))}
            </span>
        </li>
    );
};

/** Digit 0-9 bars for the analysis market: highest share green, lowest red, latest digit marked. */
const DigitBars = ({ symbol, period }: { symbol: string; period: number }) => {
    const ticks = useTicks(symbol, period);
    const stats = React.useMemo(() => computeDigitStats(ticks), [ticks]);
    const max = Math.max(...stats.percentages, 0.0001);
    const most = stats.percentages.indexOf(Math.max(...stats.percentages));
    const least = stats.percentages.indexOf(Math.min(...stats.percentages));
    const current = ticks[ticks.length - 1]?.digit;

    return (
        <div
            className='vd-at-bars'
            role='img'
            aria-label={localize('Last digit share over the last {{n}} ticks', { n: stats.sample })}
        >
            {stats.percentages.map((p, d) => (
                <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={d}
                    className={classNames('vd-at-bars__col', {
                        'is-most': stats.sample > 0 && d === most,
                        'is-least': stats.sample > 0 && d === least,
                        'is-current': d === current,
                    })}
                >
                    <small>{stats.sample ? `${p.toFixed(1)}%` : '—'}</small>
                    <span className='vd-at-bars__bar' style={{ height: `${(p / max) * 100}%` }} />
                    <strong>{d}</strong>
                </div>
            ))}
        </div>
    );
};

const AutoTrading = observer(() => {
    const { client } = useStore();
    const { symbols } = useVolatilitySymbols();
    const { trader, state } = useAutoTrader(SESSION_ID);
    const [values, update] = useSessionSettings(SESSION_ID, { stake: 1, take_profit: 20, stop_loss: 10 });
    const [setup_id, setSetupId] = usePersistentState('vd_auto_trading_setup', SETUPS[0].id);
    const [view_symbol, setViewSymbol] = usePersistentState('vd_auto_trading_view', '1HZ100V');
    const [period, setPeriod] = usePersistentState('vd_auto_trading_period', 500);
    const [duration, setDuration] = usePersistentState('vd_auto_trading_duration', 1);
    const [real_ok, setRealOk] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const setup = getSetup(setup_id);
    const view_ticks = useTicks(view_symbol, 1);
    const view_market = symbols.find(s => s.symbol === view_symbol);
    const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';
    const is_real = client.is_logged_in && !client.is_virtual;
    const is_running = trader.isRunning;
    const total = state.wins + state.losses;
    const open_market = state.open_trade ? symbols.find(s => s.symbol === state.open_trade?.symbol)?.name : undefined;

    const start = () => {
        setError(null);
        const base = rangeBounceRule(setup.confirm, setup.over, setup.under);
        try {
            trader.start(
                createDigitStrategy({
                    name: setup.name,
                    markets: symbols.map(s => s.symbol),
                    // Same rule, with the chosen duration
                    rule: digits => {
                        const trade = base(digits);
                        return trade && { ...trade, duration };
                    },
                    history: 20,
                }),
                { ...values, currency, allow_real_money: is_real && real_ok }
            );
        } catch (e: any) {
            setError(e?.message ?? localize('Could not start.'));
        }
    };

    const resetSettings = () => {
        update({ ...DEFAULT_SESSION, stake: 1, take_profit: 20, stop_loss: 10 });
        setDuration(1);
        setPeriod(500);
        setSetupId(SETUPS[0].id);
    };

    const login = async () => {
        const url = await generateOAuthURL();
        if (url) window.location.replace(url);
    };

    const status_label = state.status === 'idle' ? localize('Ready') : localize(STATUS_TEXT[state.status]);
    const next_entry = state.open_trade
        ? `${contractName(state.open_trade.contract_type, state.open_trade.digit)} · ${open_market ?? state.open_trade.symbol}`
        : is_running
          ? localize('When a setup confirms')
          : localize('When setup confirms');

    return (
        <div className='vd-at'>
            <div className='vd-at__top'>
                {/* 1. Market & strategy */}
                <section className='vd-at-card'>
                    <h3 className='vd-at-card__title'>
                        <span className='vd-at-card__step'>1</span>
                        {localize('Market & strategy')}
                    </h3>
                    <div className='vd-at-view'>
                        <MarketSelect label={localize('Analysis view')} value={view_symbol} onChange={setViewSymbol} />
                        <span className='vd-at-live' aria-live='off'>
                            <span>{localize('Live')}</span>
                            <strong>
                                {view_ticks[0] && view_market ? view_ticks[0].quote.toFixed(view_market.pip_size) : '—'}
                            </strong>
                        </span>
                    </div>
                    <div className='vd-at-setups' role='radiogroup' aria-label={localize('Strategy')}>
                        {SETUPS.map(s => (
                            <button
                                key={s.id}
                                type='button'
                                role='radio'
                                aria-checked={s.id === setup.id}
                                disabled={is_running}
                                className={classNames('vd-at-setup', { 'is-active': s.id === setup.id })}
                                onClick={() => setSetupId(s.id)}
                            >
                                <span className='vd-at-setup__icon' aria-hidden='true' />
                                <span className='vd-at-setup__text'>
                                    <strong>{localize(s.name)}</strong>
                                    <small>{localize('Enters after {{n}} digits in a row', { n: s.confirm })}</small>
                                </span>
                                <span className='vd-at-setup__check' aria-hidden='true' />
                            </button>
                        ))}
                    </div>
                    <label className='vd-number'>
                        <span className='vd-field__label'>{localize('Analysis period')}</span>
                        <select className='vd-select' value={period} onChange={e => setPeriod(Number(e.target.value))}>
                            {PERIODS.map(p => (
                                <option key={p} value={p}>
                                    {localize('{{n}} ticks', { n: p })}
                                </option>
                            ))}
                        </select>
                    </label>
                    <p className='vd-at-card__note'>
                        {localize('Historical patterns are descriptive signals, not guaranteed outcomes.')}
                    </p>
                </section>

                {/* 2. Trade settings */}
                <section className='vd-at-card'>
                    <h3 className='vd-at-card__title'>
                        <span className='vd-at-card__step'>2</span>
                        {localize('Trade settings')}
                    </h3>
                    <div className='vd-at-fields'>
                        <NumberField
                            label={localize('Stake')}
                            unit={currency}
                            min={0.35}
                            value={values.stake}
                            disabled={is_running}
                            onChange={stake => update({ stake })}
                        />
                        <label className='vd-number'>
                            <span className='vd-field__label'>{localize('Duration')}</span>
                            <select
                                className='vd-select'
                                value={duration}
                                disabled={is_running}
                                onChange={e => setDuration(Number(e.target.value))}
                            >
                                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                    <option key={n} value={n}>
                                        {n === 1 ? localize('1 Tick') : localize('{{n}} Ticks', { n })}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <NumberField
                            label={localize('Take profit')}
                            unit={currency}
                            min={0}
                            value={values.take_profit}
                            disabled={is_running}
                            onChange={take_profit => update({ take_profit })}
                        />
                        <NumberField
                            label={localize('Stop loss')}
                            unit={currency}
                            min={0}
                            value={values.stop_loss}
                            disabled={is_running}
                            onChange={stop_loss => update({ stop_loss })}
                        />
                    </div>
                    <div className='vd-at-martingale'>
                        <span>
                            <strong>{localize('Martingale')}</strong>
                            <small>{localize('Increase stake after loss')}</small>
                        </span>
                        <button
                            type='button'
                            role='switch'
                            aria-checked={values.martingale}
                            aria-label={localize('Martingale')}
                            disabled={is_running}
                            className={classNames('vd-at-switch', { 'is-on': values.martingale })}
                            onClick={() => update({ martingale: !values.martingale })}
                        />
                        <NumberField
                            label={localize('Multiplier')}
                            unit='×'
                            min={1.1}
                            max={10}
                            value={values.multiplier}
                            disabled={is_running || !values.martingale}
                            onChange={multiplier => update({ multiplier })}
                        />
                    </div>
                    {values.martingale && (
                        <NumberField
                            label={localize('Max stake')}
                            unit={currency}
                            min={values.stake}
                            value={values.max_stake}
                            disabled={is_running}
                            onChange={max_stake => update({ max_stake })}
                        />
                    )}
                </section>

                {/* Status */}
                <section
                    className={classNames('vd-at-card vd-at-status', `vd-at-status--${state.status}`)}
                    aria-live='polite'
                >
                    <p className='vd-at-status__state'>
                        <i aria-hidden='true' />
                        {status_label}
                    </p>
                    <p className='vd-at-status__sub'>
                        {state.status === 'stopped' && state.stop_reason
                            ? state.stop_reason
                            : localize('{{state}} · Scanning all volatility markets with {{setup}}', {
                                  state: status_label,
                                  setup: localize(setup.name),
                              })}
                    </p>
                    <dl className='vd-at-status__rows'>
                        <div>
                            <dt>{localize('Market')}</dt>
                            <dd>{open_market ?? localize('All volatility markets')}</dd>
                        </div>
                        <div>
                            <dt>{localize('Strategy')}</dt>
                            <dd>{localize(setup.name)}</dd>
                        </div>
                        <div>
                            <dt>{localize('Current stake')}</dt>
                            <dd>
                                {(is_running ? state.current_stake : values.stake).toFixed(2)} {currency}
                            </dd>
                        </div>
                        <div>
                            <dt>{localize('Next entry')}</dt>
                            <dd className='is-accent'>{next_entry}</dd>
                        </div>
                        {total > 0 && (
                            <div>
                                <dt>{localize('Session P/L')}</dt>
                                <dd className={state.profit >= 0 ? 'is-up' : 'is-down'}>
                                    {state.profit >= 0 ? '+' : ''}
                                    {state.profit.toFixed(2)} {currency} ·{' '}
                                    {localize('Won {{w}} / Lost {{l}}', { w: state.wins, l: state.losses })}
                                </dd>
                            </div>
                        )}
                    </dl>

                    {is_real && !is_running && (
                        <label className='vd-real-confirm'>
                            <input type='checkbox' checked={real_ok} onChange={e => setRealOk(e.target.checked)} />
                            <span>
                                {localize(
                                    'I understand this session trades real money and I can lose up to my stop loss.'
                                )}
                            </span>
                        </label>
                    )}

                    {!client.is_logged_in ? (
                        <button type='button' className='vd-at-start' onClick={login}>
                            {localize('Log in to start')}
                        </button>
                    ) : is_running ? (
                        <button
                            type='button'
                            className='vd-at-start vd-at-start--stop'
                            disabled={state.status === 'stopping'}
                            onClick={() => trader.stop()}
                        >
                            ■ {localize('Stop auto trading')}
                        </button>
                    ) : (
                        <button
                            type='button'
                            className='vd-at-start'
                            disabled={!symbols.length || (is_real && !real_ok)}
                            onClick={start}
                        >
                            ▷ {localize('Start auto trading')}
                        </button>
                    )}
                    <button type='button' className='vd-at-reset' disabled={is_running} onClick={resetSettings}>
                        ↺ {localize('Reset settings')}
                    </button>
                    {!is_running && state.trades.length > 0 && (
                        <button type='button' className='vd-at-reset' onClick={() => trader.reset()}>
                            {localize('Clear results')}
                        </button>
                    )}
                    {error && (
                        <p className='vd-message vd-message--error' role='alert'>
                            {error}
                        </p>
                    )}
                </section>
            </div>

            {/* Market analysis */}
            <section className='vd-at-card vd-at-analysis'>
                <h3 className='vd-at-card__title'>{localize('Market analysis')}</h3>
                <p className='vd-at-card__sub'>
                    {localize('{{setup}} · Scanning {{n}} volatility markets', {
                        setup: localize(setup.name),
                        n: symbols.length,
                    })}
                </p>
                <div className='vd-at-table'>
                    <div className='vd-at-table__head'>
                        <span>
                            <i aria-hidden='true' /> {localize('Live setups')}
                        </span>
                        <span>{localize('Over {{n}} pattern', { n: setup.over })}</span>
                        <span>{localize('Under {{n}} pattern', { n: setup.under })}</span>
                    </div>
                    <ul className='vd-at-table__body'>
                        {symbols.map(market => (
                            <SetupRow key={market.symbol} market={market} setup={setup} />
                        ))}
                    </ul>
                </div>
                <p className='vd-at-card__sub'>
                    {localize('Last digit share · {{market}} · last {{n}} ticks', {
                        market: view_market?.name ?? view_symbol,
                        n: period,
                    })}
                </p>
                <DigitBars symbol={view_symbol} period={period} />
                {state.trades.length > 0 && <TradeLog trades={state.trades} currency={currency} limit={8} />}
            </section>

            <ServerBots />

            <p className='vd-at__risk'>
                {localize(
                    'Trading involves risk. Setups and historical hit rates describe past tick data and do not guarantee future results: each digit is random.'
                )}
            </p>
        </div>
    );
});

export default AutoTrading;
