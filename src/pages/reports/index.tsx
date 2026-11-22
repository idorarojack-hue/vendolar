import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import NumberField from '@/components/vindolar/number-field';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useStore } from '@/hooks/useStore';
import { getDailyLossLimit, getTodayResult, setDailyLossLimit, subscribeDailyLimit } from '@/services/vindolar/daily-limit';
import { getProfitTable, getStatement } from '@/services/vindolar/trading';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import '../strategy-tester/strategy-tester.scss';

type TView = 'profit' | 'statement' | 'limits';
type TPeriod = 'today' | '7d' | '30d' | 'all';

const PERIODS: { id: TPeriod; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
    { id: 'all', label: 'All' },
];

const periodStart = (period: TPeriod) => {
    const now = new Date();
    if (period === 'today') return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
    if (period === '7d') return Math.floor(now.getTime() / 1000) - 7 * 86400;
    if (period === '30d') return Math.floor(now.getTime() / 1000) - 30 * 86400;
    return undefined;
};

const formatTime = (epoch?: number) => (epoch ? new Date(Number(epoch) * 1000).toLocaleString() : '—');
const money = (value: number, currency: string) => `${value > 0 ? '+' : ''}${value.toFixed(2)} ${currency}`;

const useDailyLimit = () => {
    const get = React.useCallback(() => `${getDailyLossLimit()}|${getTodayResult()}`, []);
    const snapshot = React.useSyncExternalStore(subscribeDailyLimit, get);
    const [limit, today] = snapshot.split('|').map(Number);
    return { limit, today };
};

const LimitsView = ({ currency }: { currency: string }) => {
    const { limit, today } = useDailyLimit();
    const used = limit > 0 ? Math.min(Math.max(0, -today) / limit, 1) : 0;
    return (
        <div className='vd-page__columns'>
            <section className='vd-card'>
                <h3 className='vd-card__title'>{localize('Daily loss limit')}</h3>
                <p className='vd-card__text'>
                    {localize(
                        'Applies to every Vindolar tool: automated sessions, Manual, Bulk and Hedging. Once losing one more stake could take today past the limit, no further trades are placed until tomorrow. Set 0 to turn it off.'
                    )}
                </p>
                <NumberField
                    label={localize('Maximum loss per day')}
                    unit={currency}
                    min={0}
                    value={limit}
                    onChange={setDailyLossLimit}
                    hint={limit ? undefined : localize('Off — we strongly recommend setting one before trading real money.')}
                />
                {limit > 0 && (
                    <div className='vd-tester__winrate'>
                        <div className='vd-tester__winrate-labels'>
                            <span>
                                {localize('Used today')} <b>{Math.max(0, -today).toFixed(2)}</b> / {limit.toFixed(2)} {currency}
                            </span>
                            <span>{Math.round(used * 100)}%</span>
                        </div>
                        <div className='vd-tester__bar' aria-hidden='true'>
                            <span className='vd-tester__bar-fill' style={{ width: `${used * 100}%`, background: used >= 0.8 ? '#ef4444' : '#1e3a8a' }} />
                        </div>
                    </div>
                )}
            </section>
            <aside className='vd-card'>
                <h3 className='vd-card__title'>{localize("Today's result")}</h3>
                <p className={classNames('vd-hedge__ev', { 'is-up': today > 0, 'is-down': today < 0 })}>{money(today, currency)}</p>
                <p className='vd-card__text'>
                    {localize(
                        'Counted from trades placed through Vindolar in this browser. Bot Builder bots and trades made elsewhere are not included — check the profit table for the full picture.'
                    )}
                </p>
            </aside>
        </div>
    );
};

const Reports = observer(() => {
    const { client } = useStore();
    const [view, setView] = usePersistentState<TView>('vd_reports_view', 'profit');
    const [period, setPeriod] = usePersistentState<TPeriod>('vd_reports_period', '7d');
    const [rows, setRows] = React.useState<any[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [page, setPage] = React.useState(0);
    const PAGE_SIZE = 50;
    const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';

    const load = React.useCallback(async () => {
        if (!client.is_logged_in || view === 'limits') return;
        setLoading(true);
        setError(null);
        try {
            const query = { limit: PAGE_SIZE, offset: page * PAGE_SIZE, date_from: periodStart(period) };
            setRows(view === 'profit' ? await getProfitTable(query) : await getStatement(query));
        } catch (e: any) {
            setError(e?.message ?? localize('Could not load the report.'));
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [client.is_logged_in, view, period, page]);

    React.useEffect(() => {
        load();
    }, [load]);

    React.useEffect(() => setPage(0), [view, period]);

    const profits = view === 'profit' ? rows.map(r => Number(r.sell_price ?? 0) - Number(r.buy_price ?? 0)) : [];
    const staked = view === 'profit' ? rows.reduce((s, r) => s + Number(r.buy_price ?? 0), 0) : 0;
    const net = profits.reduce((a, b) => a + b, 0);
    const won = profits.filter(p => p > 0).length;

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Account')}
                title={localize('Reports')}
                subtitle={localize('Your closed trades, account statement and daily limits.')}
                right={
                <div className='vd-segmented' role='tablist'>
                    {(['profit', 'statement', 'limits'] as TView[]).map(v => (
                        <button key={v} type='button' role='tab' aria-selected={view === v} className={classNames({ 'is-active': view === v })} onClick={() => setView(v)}>
                            {v === 'profit' ? localize('Profit table') : v === 'statement' ? localize('Statement') : localize('Limits')}
                        </button>
                    ))}
                </div>
                }
            />

            {view === 'limits' ? (
                <LimitsView currency={currency} />
            ) : !client.is_logged_in ? (
                <p className='vd-page__note'>{localize('Log in to see your reports.')}</p>
            ) : (
                <section className='vd-card'>
                    <div className='vd-scanner__toolbar'>
                        <div className='vd-chip-select'>
                            {PERIODS.map(p => (
                                <button key={p.id} type='button' className={classNames({ 'is-active': period === p.id })} onClick={() => setPeriod(p.id)}>
                                    {localize(p.label)}
                                </button>
                            ))}
                        </div>
                        <button type='button' className='vd-session__reset' onClick={load} disabled={loading}>
                            {loading ? localize('Loading…') : localize('Refresh')}
                        </button>
                    </div>

                    {view === 'profit' && rows.length > 0 && (
                        <dl className='vd-session-stats'>
                            <div>
                                <dt>{localize('Trades (this page)')}</dt>
                                <dd>{rows.length}</dd>
                            </div>
                            <div>
                                <dt>{localize('Won / Lost')}</dt>
                                <dd>
                                    {won} / {rows.length - won}
                                </dd>
                            </div>
                            <div>
                                <dt>{localize('Win rate')}</dt>
                                <dd>{Math.round((won / rows.length) * 100)}%</dd>
                            </div>
                            <div>
                                <dt>{localize('Staked')}</dt>
                                <dd>
                                    {staked.toFixed(2)} {currency}
                                </dd>
                            </div>
                            <div>
                                <dt>{localize('Net result')}</dt>
                                <dd className={classNames({ 'is-up': net > 0, 'is-down': net < 0 })}>{money(net, currency)}</dd>
                            </div>
                            <div>
                                <dt>{localize('Return on staked')}</dt>
                                <dd className={classNames({ 'is-up': net > 0, 'is-down': net < 0 })}>{staked ? ((net / staked) * 100).toFixed(1) : '0.0'}%</dd>
                            </div>
                        </dl>
                    )}

                    {error && (
                        <p role='alert' className='vd-message vd-message--error'>
                            {error}
                        </p>
                    )}

                    {!loading && !error && rows.length === 0 ? (
                        <p className='vd-card__text'>{localize('No records for this period.')}</p>
                    ) : (
                        <div className='vd-trade-log'>
                            <table>
                                <thead>
                                    {view === 'profit' ? (
                                        <tr>
                                            <th>{localize('Closed')}</th>
                                            <th>{localize('Contract')}</th>
                                            <th>{localize('Buy')}</th>
                                            <th>{localize('Sell')}</th>
                                            <th>{localize('Profit/loss')}</th>
                                        </tr>
                                    ) : (
                                        <tr>
                                            <th>{localize('Time')}</th>
                                            <th>{localize('Type')}</th>
                                            <th>{localize('Description')}</th>
                                            <th>{localize('Amount')}</th>
                                            <th>{localize('Balance')}</th>
                                        </tr>
                                    )}
                                </thead>
                                <tbody>
                                    {rows.map((r, i) =>
                                        view === 'profit' ? (
                                            <tr key={r.transaction_id ?? r.contract_id ?? i} title={r.longcode}>
                                                <td>{formatTime(r.sell_time ?? r.purchase_time)}</td>
                                                <td className='vd-reports__desc'>{r.longcode ?? r.shortcode ?? r.contract_type ?? '—'}</td>
                                                <td>{Number(r.buy_price ?? 0).toFixed(2)}</td>
                                                <td>{Number(r.sell_price ?? 0).toFixed(2)}</td>
                                                <td className={classNames({ 'is-up': profits[i] > 0, 'is-down': profits[i] < 0 })}>{money(profits[i], currency)}</td>
                                            </tr>
                                        ) : (
                                            <tr key={r.transaction_id ?? i} title={r.longcode}>
                                                <td>{formatTime(r.transaction_time)}</td>
                                                <td>{r.action_type ?? '—'}</td>
                                                <td className='vd-reports__desc'>{r.longcode ?? r.shortcode ?? '—'}</td>
                                                <td className={classNames({ 'is-up': Number(r.amount) > 0, 'is-down': Number(r.amount) < 0 })}>
                                                    {money(Number(r.amount ?? 0), currency)}
                                                </td>
                                                <td>{r.balance_after !== undefined ? Number(r.balance_after).toFixed(2) : '—'}</td>
                                            </tr>
                                        )
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className='vd-row vd-reports__pager'>
                        <button type='button' className='vd-session__reset' disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>
                            ← {localize('Newer')}
                        </button>
                        <span className='vd-card__text'>{localize('Page {{n}}', { n: page + 1 })}</span>
                        <button type='button' className='vd-session__reset' disabled={rows.length < PAGE_SIZE || loading} onClick={() => setPage(p => p + 1)}>
                            {localize('Older')} →
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
});

export default Reports;
