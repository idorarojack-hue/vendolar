import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import { DIGIT_CIRCLE_TICKS, DigitCircles } from '@/components/vindolar/digit-circles';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { TProposalState } from '@/hooks/useProposal';
import { useStore } from '@/hooks/useStore';
import { getTradeType, TContractParams } from '@/services/vindolar/contracts';
import { computeDigitStats } from '@/services/vindolar/digit-stats';
import {
    buyContract,
    cancelContract,
    getOpenContracts,
    isLoggedInForTrading,
    sellContract,
    subscribeTransactions,
    TOpenContract,
    updateContractLimits,
    watchContract,
} from '@/services/vindolar/trading';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import Positions, { isClosed, TPosition } from './positions';
import TickChart from './tick-chart';
import TradePanel, { DEFAULT_TRADE_SETTINGS, TTradeSettings } from './trade-panel';
// Shared field / digit-chip styles live with the analysis tools.
import '../analysis-tools/analysis-tools.scss';
import './manual-trader.scss';
import './manual-trader-light.scss';

const CHART_HEIGHT = 520;
const CHART_HEIGHT_MOBILE = 340;
const ZOOM_MIN = 20;
const ZOOM_MAX = 600;
const ZOOM_DEFAULT = 90;
const DEFAULT_SETTINGS: TTradeSettings = DEFAULT_TRADE_SETTINGS;
const SETTINGS_KEY = 'vd_manual_trader_settings';

/** "Volatility 100 (1s) Index" -> { number: '100', one_second: true } for the market badge. */
const marketBadge = (name: string) => ({
    number: name.match(/\d+/)?.[0] ?? '',
    one_second: /\(1s\)/.test(name),
});

const loadSettings = (): TTradeSettings => {
    try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
    } catch {
        return DEFAULT_SETTINGS;
    }
};

const ManualTrader = observer(() => {
    const { client } = useStore();
    const { symbols } = useVolatilitySymbols();
    const [symbol, setSymbol] = React.useState(() => localStorage.getItem('vd_manual_trader_symbol') ?? '1HZ100V');
    const [settings, setSettings] = React.useState<TTradeSettings>(loadSettings);
    const [positions, setPositions] = React.useState<TPosition[]>([]);
    const [buying, setBuying] = React.useState<string | null>(null);
    const [message, setMessage] = React.useState<{ tone: 'error' | 'info'; text: string } | null>(null);
    const [real_money_ok, setRealMoneyOk] = React.useState(false);
    const [accu, setAccu] = React.useState<TProposalState | null>(null);
    const [visible, setVisible] = React.useState(ZOOM_DEFAULT);
    const { isDesktop } = useDevice();
    const watchers = React.useRef(new Map<number, () => void>());

    const market = symbols.find(s => s.symbol === symbol) ?? symbols[0];
    const ticks = useTicks(market?.symbol, DIGIT_CIRCLE_TICKS);
    const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';
    const is_real = client.is_logged_in && !client.is_virtual;

    React.useEffect(() => {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
            localStorage.setItem('vd_manual_trader_symbol', symbol);
        } catch {
            // Not remembering settings is fine.
        }
    }, [settings, symbol]);

    // Stop following contracts when leaving the page (the contracts themselves keep running on Deriv).
    React.useEffect(() => {
        const current = watchers.current;
        return () => current.forEach(stop => stop());
    }, []);

    const updatePosition = React.useCallback((contract_id: number, patch: Partial<TPosition>) => {
        setPositions(list => list.map(p => (p.contract_id === contract_id ? { ...p, ...patch } : p)));
    }, []);

    // Latest market list for naming positions that come from `portfolio` / `transaction`.
    const symbols_ref = React.useRef(symbols);
    symbols_ref.current = symbols;
    const marketName = (code?: string) => symbols_ref.current.find(m => m.symbol === code)?.name ?? code ?? '';

    /** Add a position unless it is already listed (a buy can arrive from both the buy reply and the stream). */
    const addPosition = React.useCallback((position: TPosition) => {
        setPositions(list => (list.some(p => p.contract_id === position.contract_id) ? list : [position, ...list]));
    }, []);

    const follow = React.useCallback(
        (contract_id: number) => {
            if (watchers.current.has(contract_id)) return;
            const stop = watchContract(contract_id, (contract: TOpenContract) => {
                updatePosition(contract_id, {
                    ...contract,
                    contract_id,
                    buy_price: Number(contract.buy_price),
                    profit: contract.profit === undefined ? undefined : Number(contract.profit),
                    entry_spot: contract.entry_spot === undefined ? undefined : Number(contract.entry_spot),
                });
                if (isClosed(contract)) {
                    watchers.current.get(contract_id)?.();
                    watchers.current.delete(contract_id);
                }
            });
            watchers.current.set(contract_id, stop);
        },
        [updatePosition]
    );

    // Open contracts on the account come back after a reload (`portfolio`), and buys made anywhere else
    // (another tab, a bot, the Deriv app) appear as they happen (`transaction` stream).
    React.useEffect(() => {
        if (!client.is_logged_in) return undefined;
        let cancelled = false;
        let stopTransactions: (() => void) | undefined;
        let retry: ReturnType<typeof setTimeout> | undefined;

        const listContract = (
            contract_id: number,
            contract_type: string,
            buy_price: number,
            code?: string,
            longcode?: string
        ) => {
            addPosition({
                contract_id,
                contract_type,
                buy_price,
                status: 'open',
                market_name: marketName(code),
                longcode,
            });
            follow(contract_id);
        };

        const start = async (attempt = 0) => {
            if (cancelled) return;
            if (!isLoggedInForTrading()) {
                if (attempt < 30) retry = setTimeout(() => start(attempt + 1), 1000);
                return;
            }
            try {
                const open = await getOpenContracts();
                if (cancelled) return;
                open.forEach(c =>
                    listContract(
                        c.contract_id,
                        c.contract_type,
                        c.buy_price,
                        c.underlying_symbol ?? c.symbol,
                        c.longcode
                    )
                );
            } catch {
                // Restoring is a convenience; trading still works without it.
            }
            if (cancelled) return;
            try {
                stopTransactions = subscribeTransactions(t => {
                    if (t.action !== 'buy' || !t.contract_id) return;
                    listContract(t.contract_id, '', Math.abs(t.amount), t.underlying_symbol, t.longcode);
                });
            } catch {
                // Not logged in any more.
            }
        };
        start();

        return () => {
            cancelled = true;
            if (retry) clearTimeout(retry);
            stopTransactions?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client.is_logged_in, client.loginid]);

    // A different account has different positions.
    React.useEffect(() => {
        watchers.current.forEach(stop => stop());
        watchers.current.clear();
        setPositions([]);
    }, [client.loginid]);

    const handleBuy = async (params: TContractParams) => {
        setMessage(null);
        if (!isLoggedInForTrading()) {
            setMessage({ tone: 'error', text: localize('Please log in to trade.') });
            return;
        }
        if (is_real && !real_money_ok) {
            setMessage({
                tone: 'error',
                text: localize('Tick the real-money box first, or switch to your demo account.'),
            });
            return;
        }
        setBuying(params.contract_type);
        try {
            const bought = await buyContract(params);
            setPositions(list => [
                {
                    contract_id: bought.contract_id,
                    contract_type: params.contract_type,
                    buy_price: Number(bought.buy_price),
                    payout: Number(bought.payout),
                    status: 'open',
                    barrier: params.digit === undefined ? params.barrier : String(params.digit),
                    market_name: market?.name ?? params.symbol,
                    longcode: bought.longcode,
                },
                ...list.filter(p => p.contract_id !== bought.contract_id),
            ]);
            follow(bought.contract_id);
        } catch (e: any) {
            setMessage({ tone: 'error', text: e?.message ?? localize('The trade could not be placed.') });
        } finally {
            setBuying(null);
        }
    };

    /** Change take profit / stop loss on an open multiplier or accumulator. */
    const handleUpdateLimits = async (
        contract_id: number,
        limits: { take_profit?: number | null; stop_loss?: number | null }
    ) => {
        setMessage(null);
        try {
            await updateContractLimits(contract_id, limits);
            setMessage({ tone: 'info', text: localize('Take profit / stop loss updated.') });
        } catch (e: any) {
            setMessage({ tone: 'error', text: e?.message ?? localize('Could not update the contract.') });
        }
    };

    /** Deal cancellation: close a multiplier within its window and get the stake back. */
    const handleCancel = async (contract_id: number) => {
        setMessage(null);
        updatePosition(contract_id, { is_selling: true });
        try {
            await cancelContract(contract_id);
        } catch (e: any) {
            setMessage({ tone: 'error', text: e?.message ?? localize('The contract could not be cancelled.') });
        } finally {
            updatePosition(contract_id, { is_selling: false });
        }
    };

    const handleSell = async (contract_id: number) => {
        updatePosition(contract_id, { is_selling: true });
        try {
            await sellContract(contract_id);
        } catch (e: any) {
            setMessage({ tone: 'error', text: e?.message ?? localize('The contract could not be sold.') });
        } finally {
            updatePosition(contract_id, { is_selling: false });
        }
    };

    const login = async () => {
        const url = await generateOAuthURL();
        if (url) window.location.replace(url);
    };

    // Lines on the chart for the newest open contract on this market.
    const active = positions.find(p => !isClosed(p) && p.market_name === market?.name);
    const chart_lines = [
        ...(active?.entry_spot
            ? [{ value: Number(active.entry_spot), label: localize('Entry'), tone: 'entry' as const }]
            : []),
        ...(active?.high_barrier
            ? [{ value: Number(active.high_barrier), label: localize('High'), tone: 'barrier' as const }]
            : []),
        ...(active?.low_barrier
            ? [{ value: Number(active.low_barrier), label: localize('Low'), tone: 'barrier' as const }]
            : []),
    ];

    const latest = ticks[ticks.length - 1];
    const previous = ticks[ticks.length - 2];
    const change = latest && previous ? latest.quote - previous.quote : 0;
    const change_pct = previous && previous.quote ? (change / previous.quote) * 100 : 0;
    const pip = market?.pip_size ?? 2;
    const digit_stats = React.useMemo(() => computeDigitStats(ticks, settings.digit), [ticks, settings.digit]);
    const trade_type = getTradeType(settings.trade_type);
    const badge = marketBadge(market?.name ?? '');
    const is_accumulator = trade_type.id === 'accumulators';

    // Accumulator range drawn from the live quote (before buying) — ±distance around the spot.
    const band =
        is_accumulator && accu?.high_barrier && accu?.low_barrier
            ? {
                  high: accu.high_barrier,
                  low: accu.low_barrier,
                  high_label: accu.barrier_spot_distance ? `+${accu.barrier_spot_distance}` : undefined,
                  low_label: accu.barrier_spot_distance ? `-${accu.barrier_spot_distance}` : undefined,
              }
            : undefined;
    const stayed_in = (accu?.ticks_stayed_in ?? []).slice(-10).reverse();

    let disabled_reason: string | undefined;
    if (!client.is_logged_in) disabled_reason = localize('Log in to place trades. Prices are live.');
    else if (is_real && !real_money_ok)
        disabled_reason = localize('You are on a real-money account. Confirm below to trade.');

    return (
        <div className='vd-mt'>
            <div className='vd-mt__grid'>
                <section className='vd-mt-stage' aria-label={localize('Chart')}>
                    {/* Market: a styled card over a native select */}
                    <label className='vd-mt-market'>
                        <span className='vd-mt-market__badge' aria-hidden='true'>
                            <b>{badge.number}</b>
                            {badge.one_second && <i>1s</i>}
                            <span className='vd-mt-market__candles'>
                                <span />
                                <span />
                                <span />
                                <span />
                            </span>
                        </span>
                        <span className='vd-mt-market__text'>
                            <strong>{market?.name ?? localize('Loading markets…')}</strong>
                            <span
                                className={classNames('vd-mt-market__quote', {
                                    'is-up': change > 0,
                                    'is-down': change < 0,
                                })}
                            >
                                {latest ? latest.quote.toFixed(pip) : '—'}
                                {latest && previous && (
                                    <>
                                        {' '}
                                        {change >= 0 ? '+' : '-'} {Math.abs(change).toFixed(pip)} (
                                        {Math.abs(change_pct).toFixed(2)}%)
                                        <span className='vd-mt-market__arrow' aria-hidden='true' />
                                    </>
                                )}
                            </span>
                        </span>
                        <span className='vd-mt-market__chevron' aria-hidden='true' />
                        <select
                            className='vd-mt-market__select'
                            aria-label={localize('Market')}
                            value={market?.symbol ?? symbol}
                            onChange={e => setSymbol(e.target.value)}
                        >
                            {symbols.map(s => (
                                <option key={s.symbol} value={s.symbol}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className='vd-mt-zoom' role='group' aria-label={localize('Chart zoom')}>
                        <button
                            type='button'
                            aria-label={localize('Zoom in')}
                            disabled={visible <= ZOOM_MIN}
                            onClick={() => setVisible(v => Math.max(ZOOM_MIN, Math.round(v / 1.5)))}
                        >
                            +
                        </button>
                        <button
                            type='button'
                            aria-label={localize('Reset zoom')}
                            onClick={() => setVisible(ZOOM_DEFAULT)}
                        >
                            ◎
                        </button>
                        <button
                            type='button'
                            aria-label={localize('Zoom out')}
                            disabled={visible >= ZOOM_MAX}
                            onClick={() => setVisible(v => Math.min(ZOOM_MAX, Math.round(v * 1.5)))}
                        >
                            −
                        </button>
                    </div>

                    <TickChart
                        ticks={ticks.slice(-visible)}
                        pip_size={pip}
                        lines={chart_lines}
                        band={band}
                        height={isDesktop ? CHART_HEIGHT : CHART_HEIGHT_MOBILE}
                        lead_space={0.18}
                        show_times
                    />

                    {/* Stats bar: accumulators show how long recent contracts stayed in range; others show digit shares */}
                    <div className='vd-mt-stats'>
                        <span className='vd-mt-stats__title'>{localize('Stats')}</span>
                        {is_accumulator ? (
                            stayed_in.length ? (
                                stayed_in.map((n, i) => (
                                    // eslint-disable-next-line react/no-array-index-key
                                    <span key={i} className={classNames({ 'is-latest': i === 0 })}>
                                        {n}
                                    </span>
                                ))
                            ) : (
                                <span>—</span>
                            )
                        ) : (
                            digit_stats.percentages.map((p, d) => (
                                <span key={d} className={classNames({ 'is-latest': d === latest?.digit })}>
                                    <b>{d}</b> {p.toFixed(1)}%
                                </span>
                            ))
                        )}
                    </div>
                </section>

                <div className='vd-mt__side'>
                    {is_real && (
                        <label className='vd-real-confirm vd-mt__confirm'>
                            <input
                                type='checkbox'
                                checked={real_money_ok}
                                onChange={e => setRealMoneyOk(e.target.checked)}
                            />
                            <span>{localize('I understand these trades use real money and I can lose my stake.')}</span>
                        </label>
                    )}
                    {market && (
                        <TradePanel
                            symbol={market.symbol}
                            currency={currency}
                            settings={settings}
                            onSettingsChange={setSettings}
                            onBuy={handleBuy}
                            buying_contract_type={buying}
                            can_trade={client.is_logged_in && (!is_real || real_money_ok)}
                            is_logged_in={client.is_logged_in}
                            disabled_reason={disabled_reason}
                            onAccumulatorQuote={setAccu}
                        />
                    )}
                    {!client.is_logged_in && (
                        <button type='button' className='vd-mt__login' onClick={login}>
                            {localize('Log in')}
                        </button>
                    )}
                    {message && (
                        <p role='alert' className={classNames('vd-message', `vd-message--${message.tone}`)}>
                            {message.text}
                        </p>
                    )}
                </div>
            </div>

            {trade_type.digit && (
                <section className='vd-dc-card' aria-label={localize('Digit circles')}>
                    <header className='vd-dc-card__head'>
                        <span>{localize('Last digit stats')}</span>
                        <small>
                            {localize('Last {{count}} ticks · tap a digit to pick it', { count: digit_stats.sample })}
                        </small>
                    </header>
                    <DigitCircles
                        stats={digit_stats}
                        current_digit={latest?.digit}
                        selected_digit={settings.digit}
                        onSelect={digit => setSettings(s => ({ ...s, digit }))}
                    />
                </section>
            )}

            <Positions
                positions={positions}
                currency={currency}
                onSell={handleSell}
                onCancel={handleCancel}
                onUpdateLimits={handleUpdateLimits}
            />

            <p className='vd-mt__risk'>
                {localize(
                    'Trading involves risk. Payouts shown are what you receive if the contract wins, including your stake.'
                )}
            </p>
        </div>
    );
});

export default ManualTrader;
