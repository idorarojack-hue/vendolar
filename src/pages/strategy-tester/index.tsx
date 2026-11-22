import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { SessionSettingsForm } from '@/components/vindolar/auto-session';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import { DEFAULT_SESSION, TSessionFormValues } from '@/hooks/useAutoTrader';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useStore } from '@/hooks/useStore';
import { validateSettings } from '@/services/vindolar/auto-trader';
import { edgeZScore } from '@/services/vindolar/backtest';
import { getCatalogEntry, STRATEGY_CATALOG } from '@/services/vindolar/strategy-catalog';
import { runStrategyTest, TStrategyTestResult } from '@/services/vindolar/strategy-test-runner';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import './strategy-tester.scss';

const TICK_OPTIONS = [1000, 5000, 10000, 20000];

const EquityCurve = ({ equity }: { equity: number[] }) => {
    const width = 640;
    const height = 180;
    if (equity.length < 2) return null;
    const min = Math.min(0, ...equity);
    const max = Math.max(0, ...equity);
    const range = max - min || 1;
    const x = (i: number) => (i / (equity.length - 1)) * width;
    const y = (v: number) => height - ((v - min) / range) * height;
    const points = equity.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const last = equity[equity.length - 1];
    return (
        <svg className='vd-tester__curve' viewBox={`0 0 ${width} ${height}`} preserveAspectRatio='none' role='img' aria-label={localize('Balance over the test')}>
            <line x1='0' x2={width} y1={y(0)} y2={y(0)} className='vd-tester__zero' />
            <polyline points={points} className={classNames('vd-tester__line', { 'is-down': last < 0 })} vectorEffect='non-scaling-stroke' />
        </svg>
    );
};

const StrategyTester = observer(() => {
    const { client } = useStore();
    const [strategy_id, setStrategyId] = usePersistentState('vd_tester_strategy', STRATEGY_CATALOG[0].id);
    const [symbol, setSymbol] = usePersistentState('vd_tester_symbol', '1HZ100V');
    const [tick_count, setTickCount] = usePersistentState('vd_tester_ticks', 10000);
    const [duration, setDuration] = usePersistentState('vd_tester_duration', 5);
    const [repeat, setRepeat] = usePersistentState('vd_tester_repeat', true);
    const [session, setSession] = usePersistentState<TSessionFormValues>('vd_tester_session', { ...DEFAULT_SESSION, martingale: true });
    const [progress, setProgress] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [result, setResult] = React.useState<TStrategyTestResult | null>(null);

    const entry = getCatalogEntry(strategy_id);
    const groups = [...new Set(STRATEGY_CATALOG.map(e => e.group))];
    const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';
    const problems = validateSettings({ ...session, currency });

    const run = async () => {
        setError(null);
        setResult(null);
        try {
            setResult(
                await runStrategyTest({
                    strategy_id,
                    symbol,
                    tick_count,
                    duration,
                    settings: session,
                    currency,
                    repeat_sessions: repeat,
                    onProgress: message => setProgress(localize(message)),
                })
            );
        } catch (e: any) {
            setError(e?.message ?? localize('The test could not run.'));
        } finally {
            setProgress(null);
        }
    };

    const z = result ? edgeZScore(result) : 0;
    const ended = result
        ? result.sessions.reduce<Record<string, { count: number; profit: number }>>((acc, s) => {
              acc[s.ended] = { count: (acc[s.ended]?.count ?? 0) + 1, profit: (acc[s.ended]?.profit ?? 0) + s.profit };
              return acc;
          }, {})
        : {};

    let verdict = '';
    let verdict_tone: 'bad' | 'neutral' | 'good' = 'neutral';
    if (result) {
        if (result.trades.length < 100) {
            verdict = localize('Too few trades ({{n}}) to judge. Test more ticks or a strategy that trades more often.', { n: result.trades.length });
        } else if (result.return_on_staked < 0) {
            verdict_tone = 'bad';
            verdict = localize(
                'Lost {{pct}}% of everything staked. This is what the house edge looks like: payouts are below fair odds, so every rule loses on average.',
                { pct: Math.abs(result.return_on_staked).toFixed(1) }
            );
        } else if (z >= 2) {
            verdict_tone = 'good';
            verdict = localize(
                'Profitable on this sample and above chance (z = {{z}}). Treat it as luck until it also wins on other markets and other periods — when you test many strategies, some will look good by chance.',
                { z: z.toFixed(1) }
            );
        } else {
            verdict = localize(
                'Slightly profitable on this sample, but not distinguishable from luck (z = {{z}}). Re-test on more ticks and other markets.',
                { z: z.toFixed(1) }
            );
        }
    }

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Research')}
                title={localize('Confluence AI')}
                subtitle={localize('Replay any Vindolar strategy on real past ticks, with your session rules and your real payouts — before you risk money.')}
            />
            <p className='vd-page__note'>
                {localize(
                    'Past results do not guarantee future results. On random markets the honest question is not "did it win?" but "did it beat the break-even win rate by more than luck?" — the tester answers that.'
                )}
            </p>

            <div className='vd-page__columns'>
                <section className='vd-card'>
                    <h3 className='vd-card__title'>{localize('Test setup')}</h3>
                    <label className='vd-number'>
                        <span className='vd-field__label'>{localize('Strategy')}</span>
                        <select className='vd-select' value={strategy_id} onChange={e => setStrategyId(e.target.value)}>
                            {groups.map(group => (
                                <optgroup key={group} label={group}>
                                    {STRATEGY_CATALOG.filter(s => s.group === group).map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <small className='vd-number__hint'>{entry.description}</small>
                    </label>
                    <div className='vd-row'>
                        <MarketSelect value={symbol} onChange={setSymbol} />
                        <label className='vd-number'>
                            <span className='vd-field__label'>{localize('Past ticks to replay')}</span>
                            <select className='vd-select' value={tick_count} onChange={e => setTickCount(Number(e.target.value))}>
                                {TICK_OPTIONS.map(n => (
                                    <option key={n} value={n}>
                                        {n.toLocaleString()}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {entry.uses_duration && (
                            <NumberField label={localize('Duration (ticks)')} value={duration} min={1} max={10} decimals={0} onChange={setDuration} />
                        )}
                    </div>
                    <SessionSettingsForm values={session} onChange={patch => setSession(s => ({ ...s, ...patch }))} currency={currency} />
                    <label className='vd-switch'>
                        <input type='checkbox' checked={repeat} onChange={e => setRepeat(e.target.checked)} />
                        <span className='vd-switch__track' aria-hidden='true' />
                        <span>{localize('After take profit or stop loss, start a new session (test the whole period)')}</span>
                    </label>
                    {problems.map(p => (
                        <p key={p} className='vd-message vd-message--error'>
                            {p}
                        </p>
                    ))}
                    <button type='button' className='vd-session__start' disabled={!!progress || problems.length > 0} onClick={run}>
                        {progress ? localize('Testing…') : `▶ ${localize('Run test')}`}
                    </button>
                    {progress && (
                        <p className='vd-card__text' aria-live='polite'>
                            {progress}
                        </p>
                    )}
                    {error && (
                        <p role='alert' className='vd-message vd-message--error'>
                            {error}
                        </p>
                    )}
                </section>

                <section className='vd-card'>
                    <h3 className='vd-card__title'>{localize('Results')}</h3>
                    {!result ? (
                        <p className='vd-card__text'>{localize('Run a test to see how this strategy would have done.')}</p>
                    ) : (
                        <>
                            <p className='vd-card__text'>
                                <strong>{result.name}</strong> · {result.symbol} · {localize('{{n}} ticks', { n: result.ticks_used.toLocaleString() })}
                            </p>
                            <div className={`vd-tester__verdict vd-tester__verdict--${verdict_tone}`}>
                                <span className='vd-field__label'>{localize('Return on everything staked')}</span>
                                <strong>
                                    {result.return_on_staked > 0 ? '+' : ''}
                                    {result.return_on_staked.toFixed(2)}%
                                </strong>
                                <p>{verdict}</p>
                            </div>

                            <div className='vd-tester__winrate'>
                                <div className='vd-tester__winrate-labels'>
                                    <span>
                                        {localize('Win rate')} <b>{result.win_rate.toFixed(1)}%</b>
                                    </span>
                                    <span>
                                        {localize('Needed to break even')} <b>{result.breakeven_win_rate.toFixed(1)}%</b>
                                    </span>
                                </div>
                                <div className='vd-tester__bar' aria-hidden='true'>
                                    <span className='vd-tester__bar-fill' style={{ width: `${Math.min(result.win_rate, 100)}%` }} />
                                    <span className='vd-tester__bar-mark' style={{ left: `${Math.min(result.breakeven_win_rate, 100)}%` }} />
                                </div>
                            </div>

                            <dl className='vd-session-stats vd-tester__stats'>
                                <div>
                                    <dt>{localize('Trades')}</dt>
                                    <dd>{result.trades.length.toLocaleString()}</dd>
                                </div>
                                <div>
                                    <dt>{localize('Net result')}</dt>
                                    <dd className={classNames({ 'is-up': result.net_profit > 0, 'is-down': result.net_profit < 0 })}>
                                        {result.net_profit > 0 ? '+' : ''}
                                        {result.net_profit.toFixed(2)} {currency}
                                    </dd>
                                </div>
                                <div>
                                    <dt>{localize('Total staked')}</dt>
                                    <dd>
                                        {result.total_staked.toFixed(2)} {currency}
                                    </dd>
                                </div>
                                <div>
                                    <dt>{localize('Worst drawdown')}</dt>
                                    <dd className='is-down'>
                                        -{result.max_drawdown.toFixed(2)} {currency}
                                    </dd>
                                </div>
                                <div>
                                    <dt>{localize('Longest losing run')}</dt>
                                    <dd>{result.longest_losing_streak}</dd>
                                </div>
                                <div>
                                    <dt>{localize('Highest stake')}</dt>
                                    <dd>
                                        {result.highest_stake.toFixed(2)} {currency}
                                    </dd>
                                </div>
                            </dl>

                            <EquityCurve equity={result.equity} />

                            {result.sessions.length > 0 && (
                                <div className='vd-trade-log'>
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>{localize('Sessions ended by')}</th>
                                                <th>{localize('Sessions')}</th>
                                                <th>{localize('Combined result')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(ended).map(([reason, v]) => (
                                                <tr key={reason}>
                                                    <td>{localize(reason)}</td>
                                                    <td>{v.count}</td>
                                                    <td className={classNames({ 'is-up': v.profit > 0, 'is-down': v.profit < 0 })}>
                                                        {v.profit > 0 ? '+' : ''}
                                                        {v.profit.toFixed(2)} {currency}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <p className='vd-card__text'>
                                <small>
                                    {localize(
                                        'Model: decide on a tick, enter on the next tick, settle on the exit tick, one trade at a time — the same as the live engine. Payouts were fetched from Deriv for this account.'
                                    )}
                                </small>
                            </p>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
});

export default StrategyTester;
