import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { useStore } from '@/hooks/useStore';
import { TContractParams } from '@/services/vindolar/contracts';
import { buyContract, isLoggedInForTrading, sellContract, TOpenContract, watchContract } from '@/services/vindolar/trading';
import { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import { LastDigits } from '../analysis-tools/components';
import Positions, { isClosed, TPosition } from './positions';
import TickChart from './tick-chart';
import TradePanel, { TTradeSettings } from './trade-panel';
// Shared field / digit-chip styles live with the analysis tools.
import '../analysis-tools/analysis-tools.scss';
import './manual-trader.scss';

const CHART_TICKS = 80;
const DEFAULT_SETTINGS: TTradeSettings = {
    trade_type: 'rise_fall',
    stake: 1,
    duration: 5,
    digit: 4,
    growth_rate: 0.03,
    take_profit: 0,
};
const SETTINGS_KEY = 'vd_manual_trader_settings';

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
    const watchers = React.useRef(new Map<number, () => void>());

    const market = symbols.find(s => s.symbol === symbol) ?? symbols[0];
    const ticks = useTicks(market?.symbol, CHART_TICKS);
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

    const follow = React.useCallback(
        (contract_id: number) => {
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

    const handleBuy = async (params: TContractParams) => {
        setMessage(null);
        if (!isLoggedInForTrading()) {
            setMessage({ tone: 'error', text: localize('Please log in to trade.') });
            return;
        }
        if (is_real && !real_money_ok) {
            setMessage({ tone: 'error', text: localize('Tick the real-money box first, or switch to your demo account.') });
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
                    barrier: params.digit === undefined ? undefined : String(params.digit),
                    market_name: market?.name ?? params.symbol,
                    longcode: bought.longcode,
                },
                ...list,
            ]);
            follow(bought.contract_id);
        } catch (e: any) {
            setMessage({ tone: 'error', text: e?.message ?? localize('The trade could not be placed.') });
        } finally {
            setBuying(null);
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
        ...(active?.entry_spot ? [{ value: Number(active.entry_spot), label: localize('Entry'), tone: 'entry' as const }] : []),
        ...(active?.high_barrier ? [{ value: Number(active.high_barrier), label: localize('High'), tone: 'barrier' as const }] : []),
        ...(active?.low_barrier ? [{ value: Number(active.low_barrier), label: localize('Low'), tone: 'barrier' as const }] : []),
    ];

    const latest = ticks[ticks.length - 1];
    const previous = ticks[ticks.length - 2];
    const direction = latest && previous ? Math.sign(latest.quote - previous.quote) : 0;

    let disabled_reason: string | undefined;
    if (!client.is_logged_in) disabled_reason = localize('Log in to place trades. Prices are live.');
    else if (is_real && !real_money_ok) disabled_reason = localize('You are on a real-money account. Confirm below to trade.');

    return (
        <div className='vd-manual vd-skin'>
            <PageBackdrop />
            <div className='vd-manual__market'>
                <div className='vd-manual__chart-card'>
                    <header className='vd-manual__chart-header'>
                        <label className='vd-field'>
                            <span className='vd-field__label'>{localize('Market')}</span>
                            <select className='vd-field__input' value={market?.symbol ?? symbol} onChange={e => setSymbol(e.target.value)}>
                                {symbols.map(s => (
                                    <option key={s.symbol} value={s.symbol}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <div className='vd-manual__quote'>
                            <strong
                                className={classNames({
                                    'is-up': direction > 0,
                                    'is-down': direction < 0,
                                })}
                            >
                                {latest && market ? latest.quote.toFixed(market.pip_size) : '—'}
                            </strong>
                            <span>
                                {localize('Last digit')} <b>{latest?.digit ?? '—'}</b>
                            </span>
                        </div>
                    </header>
                    <TickChart ticks={ticks} pip_size={market?.pip_size ?? 2} lines={chart_lines} />
                    <div className='vd-manual__digits'>
                        <span className='vd-field__label'>{localize('Last 20 digits')}</span>
                        <LastDigits digits={ticks.slice(-20).map(t => t.digit)} barrier={settings.digit} />
                    </div>
                </div>

                <Positions positions={positions} currency={currency} onSell={handleSell} />
            </div>

            <div className='vd-manual__side'>
                <div className={classNames('vd-account-badge', { 'vd-account-badge--real': is_real })}>
                    {!client.is_logged_in
                        ? localize('Not logged in')
                        : is_real
                          ? localize('Real money account')
                          : localize('Demo account — virtual money')}
                </div>

                {is_real && (
                    <label className='vd-real-confirm'>
                        <input type='checkbox' checked={real_money_ok} onChange={e => setRealMoneyOk(e.target.checked)} />
                        <span>
                            {localize('I understand these trades use real money and I can lose my stake.')}
                        </span>
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
                    />
                )}

                {!client.is_logged_in && (
                    <button type='button' className='vd-login-button' onClick={login}>
                        {localize('Log in')}
                    </button>
                )}

                {message && (
                    <p role='alert' className={classNames('vd-message', `vd-message--${message.tone}`)}>
                        {message.text}
                    </p>
                )}

                <p className='vd-manual__risk'>
                    {localize('Trading involves risk. Payouts shown are what you receive if the contract wins, including your stake.')}
                </p>
            </div>
        </div>
    );
});

export default ManualTrader;
