import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import AutoSession from '@/components/vindolar/auto-session';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect, validDigit } from '@/components/vindolar/pickers';
import { useAutoTrader } from '@/hooks/useAutoTrader';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { usePositions } from '@/hooks/usePositions';
import { useProposal } from '@/hooks/useProposal';
import { useStore } from '@/hooks/useStore';
import { TContractParams } from '@/services/vindolar/contracts';
import { computeDigitStats } from '@/services/vindolar/digit-stats';
import { createRuleStrategy, TCondition } from '@/services/vindolar/rules';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import { DigitRings, LastDigits } from '../analysis-tools/components';
import Positions from '../manual-trader/positions';
import '../manual-trader/manual-trader.scss';

const ID = 'bulk-trader';

type TPair = 'even_odd' | 'over_under' | 'rise_fall' | 'matches_differs';

const PAIRS: { id: TPair; label: string; sides: [string, string]; names: [string, string] }[] = [
    { id: 'even_odd', label: 'Even/Odd', sides: ['DIGITEVEN', 'DIGITODD'], names: ['Even', 'Odd'] },
    { id: 'over_under', label: 'Over/Under', sides: ['DIGITOVER', 'DIGITUNDER'], names: ['Over', 'Under'] },
    { id: 'rise_fall', label: 'Rise/Fall', sides: ['CALL', 'PUT'], names: ['Rise', 'Fall'] },
    { id: 'matches_differs', label: 'Matches/Differs', sides: ['DIGITMATCH', 'DIGITDIFF'], names: ['Matches', 'Differs'] },
];

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

    const placeOrder = (contract_type: string) => {
        if (is_real && !real_ok) return;
        buy(Array.from({ length: copies }, () => ({ params: params(contract_type), market_name: market?.name ?? symbol })));
    };

    // Auto mode: after N digits all on one side, trade the opposite (or same) side.
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
        <div className='vd-page vd-page--dark vd-bulk'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Trade')}
                title={localize('Bulk Trader')}
                subtitle={localize('Digit statistics for one market, with one-click and multi-contract orders.')}
                right={
                <div className='vd-detail__price' style={{ alignItems: 'flex-end' }}>
                    <span className='vd-field__label'>{localize('Current tick')}</span>
                    <strong className='vd-bulk__quote'>{latest && market ? latest.quote.toFixed(market.pip_size) : '—'}</strong>
                </div>
                }
            />

            <div className='vd-bulk__board'>
                <div className='vd-card vd-bulk__col vd-bulk__market'>
                    <header className='vd-bulk__market-head'>
                        <span>{localize('Watching')}</span>
                        <strong>{market?.name ?? symbol}</strong>
                    </header>
                    <div className='vd-bulk__controls'>
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
                        <NumberField label={localize('Window (ticks)')} value={window} min={20} max={1000} decimals={0} onChange={setWindow} />
                        {has_digit && (
                            <label className='vd-number vd-bulk__digit'>
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

                    <section className='vd-bulk__digits' aria-label={localize('Digit share')}>
                        <span className='vd-field__label'>{localize('How often each digit appeared')}</span>
                        <div className='vd-digits-wide'>
                            <DigitRings stats={stats} current_digit={latest?.digit} size={52} />
                        </div>
                    </section>

                    <section className='vd-bulk__tape' aria-label={localize('Recent digits')}>
                        <span className='vd-field__label'>{localize('Recent digits')}</span>
                        <LastDigits digits={ticks.slice(-24).map(t => t.digit)} barrier={digit} />
                    </section>
                </div>

                <div className='vd-bulk__stack'>
                    <div className='vd-card'>
                        <div className='vd-row'>
                            <NumberField label={localize('Duration (ticks)')} value={duration} min={1} max={10} decimals={0} disabled={is_running} onChange={setDuration} />
                            <NumberField label={localize('Stake per contract')} unit={currency} value={stake} min={0.35} onChange={setStake} />
                            <NumberField
                                label={localize('Contracts per order')}
                                value={copies}
                                min={1}
                                max={10}
                                decimals={0}
                                onChange={setCopies}
                                hint={localize(
                                    'Total per click: {{total}} {{currency}}. Contracts in one order settle on the same tick, so they win or lose together.',
                                    { total: (stake * copies).toFixed(2), currency }
                                )}
                            />
                        </div>

                        {is_real && (
                            <label className='vd-real-confirm'>
                                <input type='checkbox' checked={real_ok} onChange={e => setRealOk(e.target.checked)} />
                                <span>{localize('I understand these trades use real money.')}</span>
                            </label>
                        )}

                        <div className='vd-trade-panel__buy'>
                            {[left, right].map((proposal, i) => {
                                const side = i as 0 | 1;
                                const contract_type = pair.sides[side];
                                return (
                                    <div className='vd-buy' key={contract_type}>
                                        <button
                                            type='button'
                                            className={classNames('vd-buy__button', side === 0 ? 'vd-buy__button--up' : 'vd-buy__button--down')}
                                            disabled={disabled_buy || Boolean(proposal.error) || proposal.is_loading}
                                            onClick={() => placeOrder(contract_type)}
                                        >
                                            <span className='vd-buy__label'>
                                                {localize(pair.names[side])}
                                                {has_digit ? ` ${validDigit(contract_type, digit)}` : ''}
                                                {copies > 1 ? ` ×${copies}` : ''}
                                            </span>
                                            <span className='vd-buy__payout'>
                                                {proposal.is_loading ? '…' : `${proposal.payout?.toFixed(2) ?? '—'} ${currency}`}
                                                <small>
                                                    {localize('{{share}}% of last {{n}} ticks', { share: share(side).toFixed(1), n: stats.sample })}
                                                </small>
                                            </span>
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
                    </div>
                    <Positions positions={positions} currency={currency} onSell={sell} />
                </div>

                <div className='vd-card vd-bulk__col'>
                    <h3 className='vd-card__title'>
                        {localize('Auto trade')}
                        <span className='vd-card__badge'>{localize('Pattern rule')}</span>
                    </h3>
                    <AutoSession id={ID} buildStrategy={buildStrategy} compact start_label={localize('Start auto trade')}>
                        <div className='vd-row'>
                            <NumberField label={localize('Run length')} value={auto_count} min={1} max={10} decimals={0} disabled={is_running} onChange={setAutoCount} />
                            <label className='vd-number'>
                                <span className='vd-field__label'>{localize('Then trade')}</span>
                                <select className='vd-select' value={auto_follow} disabled={is_running} onChange={e => setAutoFollow(e.target.value as 'opposite' | 'same')}>
                                    <option value='opposite'>{localize('The opposite side')}</option>
                                    <option value='same'>{localize('The same side')}</option>
                                </select>
                            </label>
                        </div>
                        <p className='vd-card__text'>
                            {auto_description}{' '}
                            {is_running
                                ? localize('Market, trade type, digit and duration above are locked while auto trade runs.')
                                : localize('Uses the market, trade type, digit and duration above.')}
                        </p>
                    </AutoSession>
                </div>
            </div>
        </div>
    );
});

export default BulkTrader;
