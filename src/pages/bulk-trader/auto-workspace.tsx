import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import { contractName, STATUS_TEXT, TradeLog } from '@/components/vindolar/auto-session';
import NumberField from '@/components/vindolar/number-field';
import { useAutoTrader, useSessionSettings } from '@/hooks/useAutoTrader';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useStore } from '@/hooks/useStore';
import { TSessionState, TStrategy } from '@/services/vindolar/auto-trader';
import { localize } from '@deriv-com/translations';

const BADGE_TEXT: Record<TSessionState['status'], string> = {
    idle: 'Ready',
    waiting: 'Watching',
    buying: 'Buying',
    in_trade: 'In trade',
    stopping: 'Stopping',
    stopped: 'Stopped',
};

type TAutoWorkspaceProps = {
    id: string;
    buildStrategy: () => TStrategy;
    subtitle: string;
    /** Strategy inputs shown under "Strategy & risk controls". */
    controls: React.ReactNode;
};

const ChipIcon = () => (
    <svg viewBox='0 0 24 24' width='24' height='24' fill='none' stroke='currentColor' strokeWidth='1.8' aria-hidden='true'>
        <rect x='6' y='6' width='12' height='12' rx='2' />
        <rect x='9.5' y='9.5' width='5' height='5' rx='1' />
        <path d='M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3' strokeLinecap='round' />
    </svg>
);

/** "Automation workspace": session summary tiles, risk inputs and the start/stop control for Bulk Trader. */
const AutoWorkspace = observer(({ id, buildStrategy, subtitle, controls }: TAutoWorkspaceProps) => {
    const { client } = useStore();
    const { trader, state } = useAutoTrader(id);
    const [values, update] = useSessionSettings(id);
    const [error, setError] = React.useState<string | null>(null);
    const [real_ok, setRealOk] = React.useState(false);
    const [show_controls, setShowControls] = usePersistentState('vd_bulk_controls_open', false);
    const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';
    const is_real = client.is_logged_in && !client.is_virtual;
    const is_running = trader.isRunning;
    const total = state.wins + state.losses;
    const target_progress = values.take_profit > 0 ? Math.min(Math.max(state.profit / values.take_profit, 0), 1) : 0;

    const start = () => {
        setError(null);
        try {
            trader.start(buildStrategy(), { ...values, currency, allow_real_money: is_real && real_ok });
        } catch (e: any) {
            setError(e?.message ?? localize('Could not start.'));
        }
    };

    const login = async () => {
        const url = await generateOAuthURL();
        if (url) window.location.replace(url);
    };

    const action = !client.is_logged_in ? (
        <button type='button' className='vd-bt-auto__start' onClick={login}>
            {localize('Log in to start')}
        </button>
    ) : is_running ? (
        <button type='button' className='vd-bt-auto__start vd-bt-auto__start--stop' onClick={() => trader.stop()} disabled={state.status === 'stopping'}>
            <span aria-hidden='true'>■</span> {state.status === 'stopping' ? localize('Stopping…') : localize('Stop auto trade')}
        </button>
    ) : (
        <button type='button' className='vd-bt-auto__start' onClick={start} disabled={is_real && !real_ok}>
            <span aria-hidden='true'>▶</span> {localize('Start auto trade')}
        </button>
    );

    return (
        <section className='vd-bt-auto' aria-label={localize('Automation workspace')}>
            <header className='vd-bt-auto__head'>
                <span className='vd-bt-auto__icon'>
                    <ChipIcon />
                </span>
                <div className='vd-bt-auto__title'>
                    <p className='vd-bt-auto__eyebrow'>{localize('Automation workspace')}</p>
                    <h3>
                        {localize('Auto trade')}
                        <span className={classNames('vd-bt-auto__badge', `vd-bt-auto__badge--${state.status}`)}>{localize(BADGE_TEXT[state.status])}</span>
                    </h3>
                    <p className='vd-bt-auto__subtitle'>{subtitle}</p>
                </div>
                <div className='vd-bt-auto__action'>{action}</div>
            </header>

            <dl className='vd-bt-auto__tiles'>
                <div className='vd-bt-tile'>
                    <dt>
                        <span aria-hidden='true'>↗</span> {localize('Session P/L')}
                    </dt>
                    <dd className={classNames({ 'is-up': state.profit > 0, 'is-down': state.profit < 0 })}>
                        {state.profit > 0 ? '+' : ''}
                        {state.profit.toFixed(2)} <small>{currency}</small>
                    </dd>
                </div>
                <div className='vd-bt-tile'>
                    <dt>
                        <span aria-hidden='true'>◎</span> {localize('Profit target')}
                    </dt>
                    <dd>
                        {values.take_profit.toFixed(2)} <small>{currency}</small>
                    </dd>
                    <div className='vd-bt-tile__progress' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(target_progress * 100)}>
                        <span style={{ width: `${target_progress * 100}%` }} />
                    </div>
                </div>
                <div className='vd-bt-tile'>
                    <dt>
                        <span aria-hidden='true'>∿</span> {localize('Recovery level')}
                    </dt>
                    <dd>
                        {state.consecutive_losses}{' '}
                        <small>
                            {state.consecutive_losses === 0 || !values.martingale
                                ? localize('Base stake')
                                : localize('Next {{stake}} {{currency}}', { stake: state.current_stake.toFixed(2), currency })}
                        </small>
                    </dd>
                </div>
            </dl>

            <div className='vd-bt-auto__fields'>
                <NumberField label={localize('Stake / trade ({{currency}})', { currency })} min={0.35} value={values.stake} disabled={is_running} onChange={stake => update({ stake })} />
                <NumberField label={localize('Take profit ({{currency}})', { currency })} min={0} value={values.take_profit} disabled={is_running} onChange={take_profit => update({ take_profit })} />
                <NumberField label={localize('Stop loss ({{currency}})', { currency })} min={0} value={values.stop_loss} disabled={is_running} onChange={stop_loss => update({ stop_loss })} />
                <NumberField
                    label={localize('Loss multiplier')}
                    min={1}
                    max={10}
                    value={values.martingale ? values.multiplier : 1}
                    disabled={is_running}
                    hint={values.martingale ? localize('Max stake {{max}} {{currency}}', { max: values.max_stake.toFixed(2), currency }) : localize('1 = off (flat stake)')}
                    onChange={multiplier => update(multiplier > 1 ? { multiplier, martingale: true } : { martingale: false })}
                />
            </div>

            {is_real && !is_running && (
                <label className='vd-real-confirm'>
                    <input type='checkbox' checked={real_ok} onChange={e => setRealOk(e.target.checked)} />
                    <span>{localize('I understand this session trades real money and I can lose up to my stop loss.')}</span>
                </label>
            )}

            <div className='vd-bt-auto__status' aria-live='polite'>
                <span className={classNames('vd-session__dot', `vd-session__dot--${state.status}`)} />
                <span>
                    {state.status === 'idle' ? localize('Ready to start') : localize(STATUS_TEXT[state.status])}
                    {state.status === 'stopped' && state.stop_reason ? ` — ${state.stop_reason}` : ''}
                </span>
                {is_running && (
                    <small>
                        {localize('{{count}} ticks watched', { count: state.ticks_seen })}
                        {state.open_trade ? ` · ${contractName(state.open_trade.contract_type, state.open_trade.digit)}` : ''}
                    </small>
                )}
                {total > 0 && (
                    <small className='vd-bt-auto__record'>
                        {localize('Won {{wins}} · Lost {{losses}} · {{rate}}%', { wins: state.wins, losses: state.losses, rate: Math.round((state.wins / total) * 100) })}
                    </small>
                )}
                {!is_running && state.trades.length > 0 && (
                    <button type='button' className='vd-bt-auto__reset' onClick={() => trader.reset()}>
                        {localize('Clear results')}
                    </button>
                )}
            </div>

            {error && (
                <p role='alert' className='vd-message vd-message--error'>
                    {error}
                </p>
            )}

            <div className='vd-bt-auto__controls'>
                <button type='button' className='vd-bt-auto__toggle' aria-expanded={show_controls} onClick={() => setShowControls(v => !v)}>
                    <svg viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' strokeWidth='2' aria-hidden='true'>
                        <path d='M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z' strokeLinejoin='round' />
                    </svg>
                    {localize('Strategy & risk controls')}
                    <span className={classNames('vd-bt-auto__chevron', { 'is-open': show_controls })} aria-hidden='true' />
                </button>
                {show_controls && (
                    <div className='vd-bt-auto__controls-body'>
                        {controls}
                        <NumberField
                            label={localize('Max stake ({{currency}})', { currency })}
                            min={0.35}
                            value={values.max_stake}
                            disabled={is_running}
                            hint={localize('The session stops rather than stake more than this.')}
                            onChange={max_stake => update({ max_stake })}
                        />
                    </div>
                )}
            </div>

            {state.trades.length > 0 && <TradeLog trades={state.trades} currency={currency} limit={5} />}
        </section>
    );
});

export default AutoWorkspace;
