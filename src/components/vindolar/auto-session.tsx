import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import { TSessionFormValues, useAutoTrader, useSessionSettings } from '@/hooks/useAutoTrader';
import { useStore } from '@/hooks/useStore';
import { TSessionState, TStrategy, TTradeRecord } from '@/services/vindolar/auto-trader';
import { localize } from '@deriv-com/translations';
import NumberField from './number-field';
import '../../pages/analysis-tools/analysis-tools.scss';
import './vindolar.scss';

const CONTRACT_NAMES: Record<string, string> = {
    CALL: 'Rise',
    PUT: 'Fall',
    DIGITEVEN: 'Even',
    DIGITODD: 'Odd',
    DIGITOVER: 'Over',
    DIGITUNDER: 'Under',
    DIGITMATCH: 'Matches',
    DIGITDIFF: 'Differs',
};

export const contractName = (contract_type: string, digit?: number) =>
    `${localize(CONTRACT_NAMES[contract_type] ?? contract_type)}${digit !== undefined ? ` ${digit}` : ''}`;

export const STATUS_TEXT: Record<TSessionState['status'], string> = {
    idle: 'Ready',
    waiting: 'Watching for an entry…',
    buying: 'Placing trade…',
    in_trade: 'Trade running…',
    stopping: 'Stopping after the current trade…',
    stopped: 'Stopped',
};

/** Session settings form (stake, take profit, stop loss, martingale, max stake). */
export const SessionSettingsForm = ({
    values,
    onChange,
    currency,
    disabled,
    compact,
}: {
    values: TSessionFormValues;
    onChange: (patch: Partial<TSessionFormValues>) => void;
    currency: string;
    disabled?: boolean;
    compact?: boolean;
}) => (
    <div className={classNames('vd-session-form', { 'vd-session-form--compact': compact })}>
        <NumberField label={localize('Stake')} unit={currency} min={0.35} value={values.stake} disabled={disabled} onChange={stake => onChange({ stake })} />
        <NumberField
            label={localize('Take profit')}
            unit={currency}
            min={0}
            value={values.take_profit}
            disabled={disabled}
            hint={compact ? undefined : localize('Stops when the session is this much up.')}
            onChange={take_profit => onChange({ take_profit })}
        />
        <NumberField
            label={localize('Stop loss')}
            unit={currency}
            min={0}
            value={values.stop_loss}
            disabled={disabled}
            hint={compact ? undefined : localize('Never risks losing more than this in one session.')}
            onChange={stop_loss => onChange({ stop_loss })}
        />
        <div className='vd-number'>
            <span className='vd-field__label'>{localize('Martingale')}</span>
            <label className={classNames('vd-switch', { 'vd-switch--disabled': disabled })}>
                <input
                    type='checkbox'
                    checked={values.martingale}
                    disabled={disabled}
                    onChange={e => onChange({ martingale: e.target.checked })}
                />
                <span className='vd-switch__track' aria-hidden='true' />
                <span>{values.martingale ? localize('On') : localize('Off')}</span>
            </label>
        </div>
        {values.martingale && (
            <NumberField
                label={localize('Multiplier after loss')}
                unit='×'
                min={1.1}
                max={10}
                value={values.multiplier}
                disabled={disabled}
                hint={compact ? undefined : localize('Next stake = stake × this after a loss.')}
                onChange={multiplier => onChange({ multiplier })}
            />
        )}
        <NumberField
            label={localize('Max stake')}
            unit={currency}
            min={0.35}
            value={values.max_stake}
            disabled={disabled}
            hint={compact ? undefined : localize('The session stops rather than stake more than this.')}
            onChange={max_stake => onChange({ max_stake })}
        />
    </div>
);

export const SessionStats = ({ state, currency }: { state: TSessionState; currency: string }) => {
    const total = state.wins + state.losses;
    const tiles = [
        { key: 'trades', icon: '↗', label: localize('Trades'), value: String(total) },
        { key: 'won', icon: '✓', label: localize('Won'), value: String(state.wins) },
        { key: 'lost', icon: '↓', label: localize('Lost'), value: String(state.losses) },
        { key: 'rate', icon: '◎', label: localize('Win rate'), value: total ? `${Math.round((state.wins / total) * 100)}%` : '0%' },
        {
            key: state.profit > 0 ? 'pl-up' : state.profit < 0 ? 'pl-down' : 'pl',
            icon: '$',
            label: localize('Session P/L'),
            value: `${state.profit > 0 ? '+' : ''}${state.profit.toFixed(2)} ${currency}`,
        },
        { key: 'next', icon: '→', label: localize('Next stake'), value: `${(state.current_stake || 0).toFixed(2)} ${currency}` },
    ];
    return (
        <dl className='vd-session-stats vd-stat-tiles'>
            {tiles.map(t => (
                <div key={t.label} className={`vd-stat vd-stat--${t.key}`}>
                    <dt>
                        <span className='vd-stat__icon' aria-hidden='true'>
                            {t.icon}
                        </span>
                        {t.label}
                    </dt>
                    <dd>{t.value}</dd>
                </div>
            ))}
        </dl>
    );
};

export const TradeLog = ({ trades, currency, limit = 20 }: { trades: TTradeRecord[]; currency: string; limit?: number }) =>
    trades.length === 0 ? (
        <p className='vd-trade-log__empty'>{localize('Trades will appear here once the session places them.')}</p>
    ) : (
        <div className='vd-trade-log'>
            <table>
                <thead>
                    <tr>
                        <th>{localize('Time')}</th>
                        <th>{localize('Market')}</th>
                        <th>{localize('Contract')}</th>
                        <th>{localize('Stake')}</th>
                        <th>{localize('Result')}</th>
                    </tr>
                </thead>
                <tbody>
                    {trades.slice(0, limit).map(t => (
                        <tr key={t.id} title={t.reason}>
                            <td>{new Date(t.time).toLocaleTimeString()}</td>
                            <td>{t.symbol}</td>
                            <td>{contractName(t.contract_type, t.digit)}</td>
                            <td>{t.stake.toFixed(2)}</td>
                            <td className={classNames({ 'is-up': (t.profit ?? 0) > 0, 'is-down': (t.profit ?? 0) <= 0 })}>
                                {(t.profit ?? 0) > 0 ? '+' : ''}
                                {(t.profit ?? 0).toFixed(2)} {currency}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

type TAutoSessionProps = {
    /** Unique id per tool (sessions with the same id share one engine). */
    id: string;
    /** Builds the strategy from the tool's current inputs when Start is pressed. */
    buildStrategy: () => TStrategy;
    defaults?: Partial<TSessionFormValues>;
    start_label?: string;
    /** Tool-specific inputs shown above the session settings. */
    children?: React.ReactNode;
    compact?: boolean;
    show_log?: boolean;
    /** Lets the tool disable inputs while running. */
    onRunningChange?: (is_running: boolean) => void;
};

/** Start/stop an automated session with mandatory risk limits. Used by every automated tool. */
const AutoSession = observer(
    ({ id, buildStrategy, defaults, start_label, children, compact, show_log = true, onRunningChange }: TAutoSessionProps) => {
        const { client } = useStore();
        const { trader, state } = useAutoTrader(id);
        const [values, update] = useSessionSettings(id, defaults);
        const [error, setError] = React.useState<string | null>(null);
        const [real_ok, setRealOk] = React.useState(false);
        const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';
        const is_real = client.is_logged_in && !client.is_virtual;
        const is_running = trader.isRunning;

        React.useEffect(() => onRunningChange?.(is_running), [is_running, onRunningChange]);

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

        return (
            <section className={classNames('vd-session', { 'vd-session--compact': compact })}>
                {children}

                <SessionSettingsForm values={values} onChange={update} currency={currency} disabled={is_running} compact={compact} />

                {is_real && !is_running && (
                    <label className='vd-real-confirm'>
                        <input type='checkbox' checked={real_ok} onChange={e => setRealOk(e.target.checked)} />
                        <span>{localize('I understand this session trades real money and I can lose up to my stop loss.')}</span>
                    </label>
                )}

                <div className='vd-session__controls'>
                    {!client.is_logged_in ? (
                        <button type='button' className='vd-session__start' onClick={login}>
                            {localize('Log in to start')}
                        </button>
                    ) : is_running ? (
                        <button
                            type='button'
                            className='vd-session__stop'
                            onClick={() => trader.stop()}
                            disabled={state.status === 'stopping'}
                        >
                            {state.status === 'stopping' ? localize('Stopping…') : localize('Stop')}
                        </button>
                    ) : (
                        <button type='button' className='vd-session__start' onClick={start}>
                            ▶ {start_label ?? localize('Start')}
                        </button>
                    )}
                    <div className='vd-session__status' aria-live='polite'>
                        <span className={classNames('vd-session__dot', `vd-session__dot--${state.status}`)} />
                        <span>
                            {localize(STATUS_TEXT[state.status])}
                            {state.status === 'stopped' && state.stop_reason ? ` — ${state.stop_reason}` : ''}
                        </span>
                        {is_running && (
                            <small>
                                {localize('{{count}} ticks watched', { count: state.ticks_seen })}
                                {state.open_trade ? ` · ${contractName(state.open_trade.contract_type, state.open_trade.digit)} ${state.open_trade.symbol}` : ''}
                            </small>
                        )}
                    </div>
                    {!is_running && state.trades.length > 0 && (
                        <button type='button' className='vd-session__reset' onClick={() => trader.reset()}>
                            {localize('Clear results')}
                        </button>
                    )}
                </div>

                {error && (
                    <p role='alert' className='vd-message vd-message--error'>
                        {error}
                    </p>
                )}

                <SessionStats state={state} currency={currency} />
                {show_log && <TradeLog trades={state.trades} currency={currency} limit={compact ? 5 : 20} />}
            </section>
        );
    }
);

export default AutoSession;
