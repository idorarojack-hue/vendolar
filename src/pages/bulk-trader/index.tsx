import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { OPEN_SCANNER_EVENT } from '@/components/vindolar/floating-scanner';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect, validDigit } from '@/components/vindolar/pickers';
import { useAutoTrader } from '@/hooks/useAutoTrader';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { usePositions } from '@/hooks/usePositions';
import { useProposal } from '@/hooks/useProposal';
import { useStore } from '@/hooks/useStore';
import { TContractParams } from '@/services/vindolar/contracts';
import { computeDigitStats, TTick } from '@/services/vindolar/digit-stats';
import { createRuleStrategy, TCondition } from '@/services/vindolar/rules';
import { localize } from '@deriv-com/translations';
import { DigitRings } from '../analysis-tools/components';
import Positions from '../manual-trader/positions';
import AutoWorkspace from './auto-workspace';
import '../manual-trader/manual-trader.scss';
import './bulk-trader.scss';

const ID = 'bulk-trader';
const PATTERN_LENGTH = 8;

type TPair = 'even_odd' | 'over_under' | 'rise_fall' | 'matches_differs';

const PAIRS: { id: TPair; label: string; sides: [string, string]; names: [string, string]; letters: [string, string] }[] = [
    { id: 'even_odd', label: 'Even/Odd', sides: ['DIGITEVEN', 'DIGITODD'], names: ['Even', 'Odd'], letters: ['E', 'O'] },
    { id: 'over_under', label: 'Over/Under', sides: ['DIGITOVER', 'DIGITUNDER'], names: ['Over', 'Under'], letters: ['O', 'U'] },
    { id: 'rise_fall', label: 'Rise/Fall', sides: ['CALL', 'PUT'], names: ['Rise', 'Fall'], letters: ['R', 'F'] },
    { id: 'matches_differs', label: 'Matches/Differs', sides: ['DIGITMATCH', 'DIGITDIFF'], names: ['Matches', 'Differs'], letters: ['M', 'D'] },
];

/** Which side (0 = left, 1 = right, null = neither) a tick landed on for this trade type. */
const sideOf = (pair: TPair, tick: TTick, previous: TTick | undefined, digit: number): 0 | 1 | null => {
    switch (pair) {
        case 'even_odd':
            return tick.digit % 2 === 0 ? 0 : 1;
        case 'over_under':
            return tick.digit > digit ? 0 : tick.digit < digit ? 1 : null;
        case 'rise_fall':
            if (!previous || tick.quote === previous.quote) return null;
            return tick.quote > previous.quote ? 0 : 1;
        default:
            return tick.digit === digit ? 0 : 1;
    }
};

const BulkTrader = observer(() => {
    const { client } = useStore();
    const { symbols } = useVolatilitySymbols();
    const { state } = useAutoTrader(ID);
    const is_running = !['idle', 'stopped'].includes(state.status);
    const [symbol, setSymbol] = usePersistentState('vd_bulk_symbol', 'R_100');
    const [pair_id, setPairId] = usePersistentState<TPair>('vd_bulk_pair', 'even_odd');
    const [window, setWindow] = usePersistentState('vd_bulk_window', 120);
    const [digit, setDigit] = usePersistentState('vd_bulk_digit', 4);
    const [duration, setDuration] = usePersistentState('vd_bulk_duration', 1);
    const [stake, setStake] = usePersistentState('vd_bulk_stake', 1);
    const [copies, setCopies] = usePersistentState('vd_bulk_copies', 1);
    const [auto_count, setAutoCount] = usePersistentState('vd_bulk_auto_count', 3);
    const [auto_follow, setAutoFollow] = usePersistentState<'opposite' | 'same'>('vd_bulk_auto_follow', 'opposite');

    const pair = PAIRS.find(p => p.id === pair_id) ?? PAIRS[0];
    const market = symbols.find(s => s.symbol === symbol);
    const ticks = useTicks(symbol, window);
    const stats = React.useMemo(() => computeDigitStats(ticks, digit), [ticks, digit]);
    const latest = ticks[ticks.length - 1];
    const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';
    const { positions, buy, sell, is_buying, error } = usePositions();
    const is_real = client.is_logged_in && !client.is_virtual;
    const [real_ok, setRealOk] = React.useState(false);

    const has_digit = pair.id === 'over_under' || pair.id === 'matches_differs';
    const params = (contract_type: string): TContractParams => ({
        contract_type,
        symbol,
        amount: stake,
        currency,
        duration: pair.id === 'rise_fall' ? Math.max(duration, 1) : duration,
        digit: has_digit ? validDigit(contract_type, digit) : undefined,
    });
    const left = useProposal(params(pair.sides[0]), { is_logged_in: client.is_logged_in });
    const right = useProposal(params(pair.sides[1]), { is_logged_in: client.is_logged_in });

    const share = (side: 0 | 1) => {
        switch (pair.id) {
            case 'even_odd':
                return side === 0 ? stats.even : stats.odd;
            case 'over_under': {
                const over = stats.percentages.slice(digit + 1).reduce((a, b) => a + b, 0);
                const under = stats.percentages.slice(0, digit).reduce((a, b) => a + b, 0);
                return side === 0 ? over : under;
            }
            case 'rise_fall':
                return side === 0 ? stats.rise : stats.fall;
            default:
                return side === 0 ? stats.percentages[digit] : 100 - stats.percentages[digit];
        }
    };

    const pattern = ticks.slice(-PATTERN_LENGTH).map((tick, i, recent) => {
        const index = ticks.length - recent.length + i;
        return { tick, side: sideOf(pair.id, tick, ticks[index - 1], digit) };
    });

    const placeOrder = (contract_type: string) => {
        if (is_real && !real_ok) return;
        buy(Array.from({ length: copies }, () => ({ params: params(contract_type), market_name: market?.name ?? symbol })));
    };

    // Auto mode: after N results all on one side, trade the opposite (or same) side.
    const buildStrategy = () => {
        let condition: TCondition;
        let trade_type: string;
        if (pair.id === 'even_odd') {
            condition = { kind: 'last_digits', count: auto_count, test: 'even' };
            trade_type = auto_follow === 'opposite' ? 'DIGITODD' : 'DIGITEVEN';
        } else if (pair.id === 'over_under') {
            condition = { kind: 'last_digits', count: auto_count, test: 'under', value: digit + 1 };
            trade_type = auto_follow === 'opposite' ? 'DIGITOVER' : 'DIGITUNDER';
        } else if (pair.id === 'rise_fall') {
            condition = { kind: 'percent', window: Math.max(auto_count * 2, 10), metric: 'rise', op: '>=', threshold: 70 };
            trade_type = auto_follow === 'opposite' ? 'PUT' : 'CALL';
        } else {
            condition = { kind: 'last_digits', count: auto_count, test: 'equal', value: digit };
            trade_type = auto_follow === 'opposite' ? 'DIGITDIFF' : 'DIGITMATCH';
        }
        return createRuleStrategy({
            name: 'Bulk Trader auto',
            markets: [symbol],
            condition,
            trade: { contract_type: trade_type, digit: has_digit ? validDigit(trade_type, digit) : undefined, duration },
            pause_ticks: 2,
        });
    };

    const auto_description =
        pair.id === 'even_odd'
            ? localize('After {{n}} even digits in a row, trade {{side}}.', { n: auto_count, side: auto_follow === 'opposite' ? 'Odd' : 'Even' })
            : pair.id === 'over_under'
              ? localize('After {{n}} digits in a row at {{d}} or below, trade {{side}} {{d}}.', { n: auto_count, d: digit, side: auto_follow === 'opposite' ? 'Over' : 'Under' })
              : pair.id === 'rise_fall'
                ? localize('When at least 70% of recent moves were up, trade {{side}}.', { side: auto_follow === 'opposite' ? 'Fall' : 'Rise' })
                : localize('After digit {{d}} repeats {{n}} times, trade {{side}} {{d}}.', { n: auto_count, d: digit, side: auto_follow === 'opposite' ? 'Differs' : 'Matches' });

    const disabled_buy = !client.is_logged_in || is_buying || (is_real && !real_ok);

    return (
        <div className='vd-page vd-bt'>
            <div className='vd-bt__selects'>
                <MarketSelect value={symbol} onChange={setSymbol} disabled={is_running} />
                <label className='vd-number'>
                    <span className='vd-field__label'>{localize('Trade type')}</span>
                    <select className='vd-select' value={pair_id} onChange={e => setPairId(e.target.value as TPair)} disabled={is_running}>
                        {PAIRS.map(p => (
                            <option key={p.id} value={p.id}>
                                {localize(p.label)}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className={classNames('vd-bt__window', { 'vd-bt__window--digit': has_digit })}>
                <NumberField label={localize('Number of ticks')} value={window} min={20} max={1000} decimals={0} onChange={setWindow} />
                {has_digit && (
                    <label className='vd-number'>
                        <span className='vd-field__label'>{localize('Digit')}</span>
                        <select className='vd-select' value={digit} onChange={e => setDigit(Number(e.target.value))} disabled={is_running}>
                            {Array.from({ length: 10 }, (_, d) => (
                                <option key={d} value={d}>
                                    {d}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            <div className='vd-bt__tick-row'>
                <div className='vd-bt__tick'>
                    <span>{localize('Current tick')}</span>
                    <strong>{latest && market ? latest.quote.toFixed(market.pip_size) : '—'}</strong>
                </div>
                <button type='button' className='vd-bt__scanner' onClick={() => document.dispatchEvent(new Event(OPEN_SCANNER_EVENT))}>
                    <svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' strokeWidth='1.8' aria-hidden='true'>
                        <path d='M12 3 3 7.5l9 4.5 9-4.5L12 3zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5' strokeLinejoin='round' />
                    </svg>
                    {localize('Market scanner')}
                </button>
            </div>

            <section className='vd-bt__digits' aria-label={localize('How often each digit appeared')}>
                <DigitRings stats={stats} current_digit={latest?.digit} size={76} />
                <div className='vd-bt__pattern' aria-label={localize('Last {{n}} results', { n: pattern.length })}>
                    {pattern.map(({ tick, side }, i) => (
                        <span
                            // eslint-disable-next-line react/no-array-index-key
                            key={i}
                            className={classNames('vd-bt__pattern-chip', side === null ? 'is-flat' : side === 0 ? 'is-left' : 'is-right')}
                            title={`${localize('Digit')} ${tick.digit}`}
                        >
                            {side === null ? '=' : pair.letters[side]}
                        </span>
                    ))}
                </div>
            </section>

            <div className='vd-bt__order'>
                <NumberField label={localize('Ticks')} value={duration} min={1} max={10} decimals={0} disabled={is_running} onChange={setDuration} />
                <NumberField label={localize('Stake')} value={stake} min={0.35} onChange={setStake} />
                <NumberField
                    label={localize('Contracts per order')}
                    value={copies}
                    min={1}
                    max={10}
                    decimals={0}
                    onChange={setCopies}
                    hint={copies > 1 ? localize('Total per click: {{total}} {{currency}}. They settle on the same tick.', { total: (stake * copies).toFixed(2), currency }) : undefined}
                />
            </div>

            {is_real && (
                <label className='vd-real-confirm'>
                    <input type='checkbox' checked={real_ok} onChange={e => setRealOk(e.target.checked)} />
                    <span>{localize('I understand these trades use real money.')}</span>
                </label>
            )}

            <div className='vd-bt__sides'>
                {[left, right].map((proposal, i) => {
                    const side = i as 0 | 1;
                    const contract_type = pair.sides[side];
                    const pct = share(side);
                    return (
                        <div className='vd-bt__side-wrap' key={contract_type}>
                            <button
                                type='button'
                                className={classNames('vd-bt-side', side === 0 ? 'vd-bt-side--left' : 'vd-bt-side--right')}
                                disabled={disabled_buy || Boolean(proposal.error) || proposal.is_loading}
                                onClick={() => placeOrder(contract_type)}
                            >
                                <span className='vd-bt-side__fill' style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} aria-hidden='true' />
                                <span className='vd-bt-side__top'>
                                    <span className='vd-bt-side__name'>
                                        <span className='vd-bt-side__icon' aria-hidden='true' />
                                        {localize(pair.names[side])}
                                        {has_digit ? ` ${validDigit(contract_type, digit)}` : ''}
                                        {copies > 1 ? ` ×${copies}` : ''}
                                    </span>
                                    <span className='vd-bt-side__payout'>
                                        {proposal.is_loading ? '…' : `${currency} ${proposal.payout?.toFixed(2) ?? '—'}`}
                                    </span>
                                </span>
                                <span className='vd-bt-side__pct'>{pct.toFixed(2)}%</span>
                            </button>
                            {proposal.error && <p className='vd-buy__error'>{proposal.error}</p>}
                        </div>
                    );
                })}
            </div>
            {!client.is_logged_in && <p className='vd-trade-panel__notice'>{localize('Log in to place trades. Prices are live.')}</p>}
            {error && (
                <p role='alert' className='vd-message vd-message--error'>
                    {error}
                </p>
            )}
            {positions.length > 0 && <Positions positions={positions} currency={currency} onSell={sell} />}

            <AutoWorkspace
                id={ID}
                buildStrategy={buildStrategy}
                subtitle={localize('{{pair}} - Pattern-based execution', { pair: localize(pair.label) })}
                controls={
                    <>
                        <NumberField label={localize('Run length')} value={auto_count} min={1} max={10} decimals={0} disabled={is_running} onChange={setAutoCount} />
                        <label className='vd-number'>
                            <span className='vd-field__label'>{localize('Then trade')}</span>
                            <select className='vd-select' value={auto_follow} disabled={is_running} onChange={e => setAutoFollow(e.target.value as 'opposite' | 'same')}>
                                <option value='opposite'>{localize('The opposite side')}</option>
                                <option value='same'>{localize('The same side')}</option>
                            </select>
                        </label>
                        <p className='vd-bt-auto__rule'>
                            {auto_description} {localize('Uses the market, trade type, digit and ticks above.')}
                        </p>
                    </>
                }
            />
        </div>
    );
});

export default BulkTrader;
