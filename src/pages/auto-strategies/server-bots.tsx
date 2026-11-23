import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useStore } from '@/hooks/useStore';
import {
    listRuns,
    listServerStrategies,
    pauseRun,
    resumeRun,
    runContractCount,
    runProfit,
    startRun,
    stopRun,
    TRun,
    TServerStrategy,
    watchRun,
} from '@/services/vindolar/auto-runs';
import { isLoggedInForTrading } from '@/services/vindolar/trading';
import { localize } from '@deriv-com/translations';

/** Contract types the server bots can trade, with what each needs. */
const CONTRACTS: Record<string, { label: string; digit?: boolean; ticks?: [number, number]; accumulator?: boolean }> = {
    CALL: { label: 'Rise', ticks: [1, 10] },
    PUT: { label: 'Fall', ticks: [1, 10] },
    CALLE: { label: 'Rise (allow equals)', ticks: [1, 10] },
    PUTE: { label: 'Fall (allow equals)', ticks: [1, 10] },
    DIGITEVEN: { label: 'Even', ticks: [1, 10] },
    DIGITODD: { label: 'Odd', ticks: [1, 10] },
    DIGITOVER: { label: 'Over', digit: true, ticks: [1, 10] },
    DIGITUNDER: { label: 'Under', digit: true, ticks: [1, 10] },
    DIGITMATCH: { label: 'Matches', digit: true, ticks: [1, 10] },
    DIGITDIFF: { label: 'Differs', digit: true, ticks: [1, 10] },
    ASIANU: { label: 'Asian Rise', ticks: [5, 10] },
    ASIAND: { label: 'Asian Fall', ticks: [5, 10] },
    ACCU: { label: 'Accumulator', accumulator: true },
};

const PARAM_DEFAULTS: Record<string, number> = {
    initial_stake: 1,
    take_profit: 5,
    stop_loss: 10,
    unit: 1,
    multiplier: 2,
    max_stake: 8,
};

const humanize = (name: string) => name.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

const STATUS_LABEL: Record<string, string> = { running: 'Running', paused: 'Paused', stopped: 'Stopped' };

const RunCard = ({
    run,
    currency,
    onAction,
}: {
    run: TRun;
    currency: string;
    onAction: (action: 'pause' | 'resume' | 'stop', run_id: string) => void;
}) => {
    const profit = runProfit(run);
    const template = run.contract_template;
    const contract = template ? (CONTRACTS[template.contract_type]?.label ?? template.contract_type) : '';
    return (
        <li className={classNames('vd-at-run', `vd-at-run--${run.status}`)}>
            <div className='vd-at-run__main'>
                <strong>
                    {run.strategy_id} · {contract}
                    {template?.barrier ? ` ${template.barrier}` : ''}
                </strong>
                <small>
                    {template?.underlying_symbol} · {localize('{{n}} contracts', { n: runContractCount(run) })}
                    {run.stop_reason ? ` · ${run.stop_reason.replace(/_/g, ' ')}` : ''}
                </small>
            </div>
            <span className='vd-at-run__status'>{localize(STATUS_LABEL[run.status] ?? run.status)}</span>
            <span className={classNames('vd-at-run__pl', profit >= 0 ? 'is-up' : 'is-down')}>
                {profit >= 0 ? '+' : ''}
                {profit.toFixed(2)} {currency}
            </span>
            <div className='vd-at-run__actions'>
                {run.status === 'running' && (
                    <button type='button' onClick={() => onAction('pause', run.run_id)}>
                        {localize('Pause')}
                    </button>
                )}
                {run.status === 'paused' && (
                    <button type='button' onClick={() => onAction('resume', run.run_id)}>
                        {localize('Resume')}
                    </button>
                )}
                {run.status !== 'stopped' && (
                    <button type='button' className='is-stop' onClick={() => onAction('stop', run.run_id)}>
                        {localize('Stop')}
                    </button>
                )}
            </div>
        </li>
    );
};

/**
 * Server bots: Deriv runs the staking strategy on its own servers (`auto_start`), so the run does not
 * depend on this page staying open. Live status comes from `auto_get` subscriptions.
 */
const ServerBots = observer(() => {
    const { client } = useStore();
    const [strategies, setStrategies] = React.useState<TServerStrategy[] | null>(null);
    const [strategy_id, setStrategyId] = usePersistentState('vd_server_bot_strategy', 'martingale');
    const [symbol, setSymbol] = usePersistentState('vd_server_bot_symbol', '1HZ100V');
    const [contract_type, setContractType] = usePersistentState('vd_server_bot_contract', 'DIGITOVER');
    const [digit, setDigit] = usePersistentState('vd_server_bot_digit', 2);
    const [duration, setDuration] = usePersistentState('vd_server_bot_duration', 1);
    const [growth_rate, setGrowthRate] = usePersistentState('vd_server_bot_growth', 0.03);
    const [values, setValues] = usePersistentState<Record<string, number | undefined>>(
        'vd_server_bot_params',
        PARAM_DEFAULTS
    );
    const [runs, setRuns] = React.useState<TRun[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [real_ok, setRealOk] = React.useState(false);
    const watchers = React.useRef(new Map<string, () => void>());

    const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';
    const is_real = client.is_logged_in && !client.is_virtual;
    const strategy = strategies?.find(s => s.strategy_id === strategy_id) ?? strategies?.[0];
    const contract_types = (strategy?.supported_contract_types ?? Object.keys(CONTRACTS)).filter(c => CONTRACTS[c]);
    const contract =
        CONTRACTS[contract_types.includes(contract_type) ? contract_type : contract_types[0]] ?? CONTRACTS.CALL;
    const chosen_contract = contract_types.includes(contract_type) ? contract_type : contract_types[0];

    React.useEffect(() => {
        listServerStrategies()
            .then(setStrategies)
            .catch(() => setStrategies([]));
    }, []);

    const upsert = React.useCallback((run: TRun) => {
        setRuns(list => {
            const i = list.findIndex(r => r.run_id === run.run_id);
            if (i === -1) return [run, ...list];
            const next = [...list];
            next[i] = { ...next[i], ...run };
            return next;
        });
    }, []);

    const follow = React.useCallback(
        (run: TRun) => {
            if (watchers.current.has(run.run_id) || run.status === 'stopped') return;
            try {
                watchers.current.set(run.run_id, watchRun(run.run_id, upsert));
            } catch {
                // Not logged in.
            }
        },
        [upsert]
    );

    // Load this account's runs (they keep going on Deriv's side) and follow the active ones.
    React.useEffect(() => {
        const current = watchers.current;
        if (!client.is_logged_in) return undefined;
        let cancelled = false;
        let retry: ReturnType<typeof setTimeout> | undefined;
        const load = (attempt = 0) => {
            if (cancelled) return;
            if (!isLoggedInForTrading()) {
                if (attempt < 30) retry = setTimeout(() => load(attempt + 1), 1000);
                return;
            }
            listRuns()
                .then(list => {
                    if (cancelled) return;
                    setRuns(list);
                    list.forEach(follow);
                })
                .catch(() => undefined);
        };
        load();
        return () => {
            cancelled = true;
            if (retry) clearTimeout(retry);
            current.forEach(stop => stop());
            current.clear();
        };
    }, [client.is_logged_in, client.loginid, follow]);

    const start = async () => {
        if (!strategy) return;
        setError(null);
        setBusy(true);
        try {
            const stake = values.initial_stake ?? 1;
            const run = await startRun(
                strategy,
                {
                    amount: stake,
                    basis: 'stake',
                    contract_type: chosen_contract,
                    currency,
                    underlying_symbol: symbol,
                    ...(contract.accumulator
                        ? { growth_rate }
                        : {
                              duration: Math.min(
                                  Math.max(duration, contract.ticks?.[0] ?? 1),
                                  contract.ticks?.[1] ?? 10
                              ),
                              duration_unit: 't' as const,
                          }),
                    ...(contract.digit ? { barrier: String(digit) } : {}),
                },
                values
            );
            upsert(run);
            follow(run);
        } catch (e: any) {
            setError(e?.message ?? localize('The server bot could not be started.'));
        } finally {
            setBusy(false);
        }
    };

    const act = async (action: 'pause' | 'resume' | 'stop', run_id: string) => {
        setError(null);
        try {
            const run = await (action === 'pause' ? pauseRun : action === 'resume' ? resumeRun : stopRun)(run_id);
            if (run) upsert(run);
            if (action === 'stop') {
                watchers.current.get(run_id)?.();
                watchers.current.delete(run_id);
            }
        } catch (e: any) {
            setError(e?.message ?? localize('That did not work. Please try again.'));
        }
    };

    const active = runs.filter(r => r.status !== 'stopped');
    const finished = runs.filter(r => r.status === 'stopped').slice(0, 5);

    return (
        <section className='vd-at-card vd-at-server' aria-label={localize('Server bots')}>
            <h3 className='vd-at-card__title'>
                <span className='vd-at-card__step'>☁</span>
                {localize('Server bots')}
                <span className='vd-at-server__badge'>{localize('Runs on Deriv')}</span>
            </h3>
            <p className='vd-at-card__sub'>
                {localize(
                    'Deriv runs these staking strategies on its own servers, so they keep trading even if you close this page. They stop at your take profit or stop loss.'
                )}
            </p>

            {strategies === null ? (
                <p className='vd-at-card__note'>{localize('Loading strategies…')}</p>
            ) : strategies.length === 0 ? (
                <p className='vd-at-card__note'>{localize('Server bots are not available right now.')}</p>
            ) : (
                <>
                    <div className='vd-at-setups' role='radiogroup' aria-label={localize('Server strategy')}>
                        {strategies.map(s => (
                            <button
                                key={s.strategy_id}
                                type='button'
                                role='radio'
                                aria-checked={s.strategy_id === strategy?.strategy_id}
                                className={classNames('vd-at-setup', {
                                    'is-active': s.strategy_id === strategy?.strategy_id,
                                })}
                                onClick={() => setStrategyId(s.strategy_id)}
                            >
                                <span className='vd-at-setup__icon' aria-hidden='true' />
                                <span className='vd-at-setup__text'>
                                    <strong>{s.display_name}</strong>
                                    <small>{s.description}</small>
                                </span>
                                <span className='vd-at-setup__check' aria-hidden='true' />
                            </button>
                        ))}
                    </div>

                    <div className='vd-at-server__grid'>
                        <MarketSelect value={symbol} onChange={setSymbol} />
                        <label className='vd-number'>
                            <span className='vd-field__label'>{localize('Contract')}</span>
                            <select
                                className='vd-select'
                                value={chosen_contract}
                                onChange={e => setContractType(e.target.value)}
                            >
                                {contract_types.map(c => (
                                    <option key={c} value={c}>
                                        {localize(CONTRACTS[c].label)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {contract.digit && (
                            <label className='vd-number'>
                                <span className='vd-field__label'>{localize('Digit')}</span>
                                <select
                                    className='vd-select'
                                    value={digit}
                                    onChange={e => setDigit(Number(e.target.value))}
                                >
                                    {Array.from({ length: 10 }, (_, d) => (
                                        <option key={d} value={d}>
                                            {d}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        {contract.accumulator ? (
                            <label className='vd-number'>
                                <span className='vd-field__label'>{localize('Growth rate')}</span>
                                <select
                                    className='vd-select'
                                    value={growth_rate}
                                    onChange={e => setGrowthRate(Number(e.target.value))}
                                >
                                    {[0.01, 0.02, 0.03, 0.04, 0.05].map(r => (
                                        <option key={r} value={r}>
                                            {Math.round(r * 100)}%
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <NumberField
                                label={localize('Duration (ticks)')}
                                value={duration}
                                min={contract.ticks?.[0] ?? 1}
                                max={contract.ticks?.[1] ?? 10}
                                decimals={0}
                                onChange={setDuration}
                            />
                        )}
                        {strategy?.parameters.map(p => (
                            <NumberField
                                key={p.name}
                                label={`${localize(humanize(p.name))}${p.required ? '' : ` (${localize('optional')})`}`}
                                unit={/stake|profit|loss|unit/.test(p.name) ? currency : undefined}
                                value={values[p.name] ?? 0}
                                min={0}
                                max={p.maximum}
                                decimals={p.type === 'integer' ? 0 : 2}
                                hint={p.description}
                                onChange={v => setValues({ ...values, [p.name]: v > 0 ? v : undefined })}
                            />
                        ))}
                    </div>

                    {is_real && (
                        <label className='vd-real-confirm'>
                            <input type='checkbox' checked={real_ok} onChange={e => setRealOk(e.target.checked)} />
                            <span>
                                {localize(
                                    'I understand this server bot trades real money and keeps running after I close the page, until it hits my take profit or stop loss.'
                                )}
                            </span>
                        </label>
                    )}

                    <button
                        type='button'
                        className='vd-at-start'
                        disabled={!client.is_logged_in || busy || !strategy || (is_real && !real_ok)}
                        onClick={start}
                    >
                        {client.is_logged_in
                            ? busy
                                ? localize('Starting…')
                                : localize('Start server bot')
                            : localize('Log in to start')}
                    </button>
                </>
            )}

            {error && (
                <p className='vd-message vd-message--error' role='alert'>
                    {error}
                </p>
            )}

            {(active.length > 0 || finished.length > 0) && (
                <ul className='vd-at-runs'>
                    {[...active, ...finished].map(run => (
                        <RunCard key={run.run_id} run={run} currency={currency} onAction={act} />
                    ))}
                </ul>
            )}
        </section>
    );
});

export default ServerBots;
