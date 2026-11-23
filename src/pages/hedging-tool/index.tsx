import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { LiveDigitCircles } from '@/components/vindolar/digit-circles';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { usePositions } from '@/hooks/usePositions';
import { useProposal } from '@/hooks/useProposal';
import { useStore } from '@/hooks/useStore';
import { TContractParams } from '@/services/vindolar/contracts';
import { localize } from '@deriv-com/translations';
import Positions from '../manual-trader/positions';
import '../manual-trader/manual-trader.scss';
import '@/components/vindolar/vindolar.scss';

type TLeg = { contract_type: string; digit?: number; label: string; wins: (digit: number) => boolean };
type TPair = { id: string; label: string; legs: [TLeg, TLeg]; is_digit: boolean };

const PAIRS: TPair[] = [
    {
        id: 'over5_under4',
        label: 'Over 5 / Under 4',
        is_digit: true,
        legs: [
            { contract_type: 'DIGITOVER', digit: 5, label: 'Over 5', wins: d => d > 5 },
            { contract_type: 'DIGITUNDER', digit: 4, label: 'Under 4', wins: d => d < 4 },
        ],
    },
    {
        id: 'over4_under5',
        label: 'Over 4 / Under 5',
        is_digit: true,
        legs: [
            { contract_type: 'DIGITOVER', digit: 4, label: 'Over 4', wins: d => d > 4 },
            { contract_type: 'DIGITUNDER', digit: 5, label: 'Under 5', wins: d => d < 5 },
        ],
    },
    {
        id: 'over3_under6',
        label: 'Over 3 / Under 6',
        is_digit: true,
        legs: [
            { contract_type: 'DIGITOVER', digit: 3, label: 'Over 3', wins: d => d > 3 },
            { contract_type: 'DIGITUNDER', digit: 6, label: 'Under 6', wins: d => d < 6 },
        ],
    },
    {
        id: 'even_odd',
        label: 'Even / Odd',
        is_digit: true,
        legs: [
            { contract_type: 'DIGITEVEN', label: 'Even', wins: d => d % 2 === 0 },
            { contract_type: 'DIGITODD', label: 'Odd', wins: d => d % 2 !== 0 },
        ],
    },
    {
        id: 'rise_fall',
        label: 'Rise / Fall',
        is_digit: false,
        legs: [
            { contract_type: 'CALL', label: 'Rise', wins: () => false },
            { contract_type: 'PUT', label: 'Fall', wins: () => false },
        ],
    },
];

type TOutcome = { label: string; probability: number; net: number; digits?: number[] };

/** Outcomes of a hedge with fair (equally likely) digits. */
const outcomes = (pair: TPair, payouts: [number, number], stake: number): TOutcome[] => {
    const cost = stake * 2;
    if (!pair.is_digit) {
        return [
            { label: `${pair.legs[0].label} wins`, probability: 0.5, net: payouts[0] - cost },
            { label: `${pair.legs[1].label} wins`, probability: 0.5, net: payouts[1] - cost },
        ];
    }
    const groups = new Map<string, TOutcome>();
    for (let d = 0; d < 10; d++) {
        const a = pair.legs[0].wins(d);
        const b = pair.legs[1].wins(d);
        const key = a && b ? 'both' : a ? 'a' : b ? 'b' : 'none';
        const label =
            key === 'both' ? 'Both win' : key === 'a' ? `Only ${pair.legs[0].label} wins` : key === 'b' ? `Only ${pair.legs[1].label} wins` : 'Both lose';
        const net = (a ? payouts[0] : 0) + (b ? payouts[1] : 0) - cost;
        const existing = groups.get(key) ?? { label, probability: 0, net, digits: [] };
        existing.probability += 0.1;
        existing.digits?.push(d);
        groups.set(key, existing);
    }
    return [...groups.values()];
};

const HedgingTool = observer(() => {
    const { client } = useStore();
    const { symbols } = useVolatilitySymbols();
    const [symbol, setSymbol] = usePersistentState('vd_hedge_symbol', 'R_100');
    const [pair_id, setPairId] = usePersistentState('vd_hedge_pair', 'over5_under4');
    const [stake, setStake] = usePersistentState('vd_hedge_stake', 1);
    const [duration, setDuration] = usePersistentState('vd_hedge_duration', 5);
    const [real_ok, setRealOk] = React.useState(false);
    const pair = PAIRS.find(p => p.id === pair_id) ?? PAIRS[0];
    const market = symbols.find(s => s.symbol === symbol);
    const ticks = useTicks(symbol, 2);
    const latest = ticks[ticks.length - 1];
    const currency = client.is_logged_in ? client.currency || 'USD' : 'USD';
    const is_real = client.is_logged_in && !client.is_virtual;
    const { positions, buy, sell, is_buying, error } = usePositions();

    const params = (leg: TLeg): TContractParams => ({
        contract_type: leg.contract_type,
        symbol,
        amount: stake,
        currency,
        duration,
        digit: leg.digit,
    });
    const a = useProposal(params(pair.legs[0]), { is_logged_in: client.is_logged_in });
    const b = useProposal(params(pair.legs[1]), { is_logged_in: client.is_logged_in });
    const ready = !a.is_loading && !b.is_loading && !a.error && !b.error && a.payout && b.payout;
    const table = ready ? outcomes(pair, [a.payout as number, b.payout as number], stake) : [];
    const expected = table.reduce((sum, o) => sum + o.probability * o.net, 0);

    const execute = () => {
        if (is_real && !real_ok) return;
        buy(pair.legs.map(leg => ({ params: params(leg), market_name: market?.name ?? symbol })));
    };

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Trading')}
                title={localize('Hedging')}
                subtitle={localize('Buy two contracts at the same time and see every possible outcome before you do.')}
                right={
                    <>
                        <div className='vd-detail__price' style={{ alignItems: 'flex-end' }}>
                            <span className='vd-field__label'>{localize('Market price')}</span>
                            <strong className='vd-bulk__quote'>{latest && market ? latest.quote.toFixed(market.pip_size) : '—'}</strong>
                        </div>
                    </>
                }
            />

            <div className='vd-page__columns'>
                <section className='vd-card'>
                    <div className='vd-row'>
                        <MarketSelect value={symbol} onChange={setSymbol} />
                        <label className='vd-number'>
                            <span className='vd-field__label'>{localize('Strategy')}</span>
                            <select className='vd-select' value={pair_id} onChange={e => setPairId(e.target.value)}>
                                {PAIRS.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <LiveDigitCircles symbol={symbol} />
                    <div className='vd-row'>
                        <NumberField label={localize('Stake per leg')} unit={currency} value={stake} min={0.35} onChange={setStake} />
                        <NumberField label={localize('Duration (ticks)')} value={duration} min={1} max={10} decimals={0} onChange={setDuration} />
                    </div>

                    <div className='vd-trade-panel__buy'>
                        {[a, b].map((proposal, i) => (
                            <div key={pair.legs[i].label} className={classNames('vd-hedge-leg', i === 0 ? 'vd-hedge-leg--up' : 'vd-hedge-leg--down')}>
                                <strong>{pair.legs[i].label}</strong>
                                <span className='vd-field__label'>{localize('Payout')}</span>
                                <span className='vd-hedge-leg__payout'>
                                    {proposal.is_loading ? '…' : proposal.error ? '—' : `${proposal.payout?.toFixed(2)} ${currency}`}
                                </span>
                                {proposal.payout ? (
                                    <small>
                                        {localize('Profit {{p}} {{c}} if it wins', { p: (proposal.payout - stake).toFixed(2), c: currency })}
                                    </small>
                                ) : null}
                                {proposal.error && <small className='is-down'>{proposal.error}</small>}
                            </div>
                        ))}
                    </div>

                    {is_real && (
                        <label className='vd-real-confirm'>
                            <input type='checkbox' checked={real_ok} onChange={e => setRealOk(e.target.checked)} />
                            <span>{localize('I understand these trades use real money.')}</span>
                        </label>
                    )}

                    <button
                        type='button'
                        className='vd-primary-button vd-hedge__execute'
                        disabled={!client.is_logged_in || !ready || is_buying || (is_real && !real_ok)}
                        onClick={execute}
                    >
                        {is_buying
                            ? localize('Placing both legs…')
                            : localize('Execute hedge · {{total}} {{c}}', { total: (stake * 2).toFixed(2), c: currency })}
                    </button>
                    {!client.is_logged_in && <p className='vd-trade-panel__notice'>{localize('Log in to place trades. Prices are live.')}</p>}
                    {error && (
                        <p role='alert' className='vd-message vd-message--error'>
                            {error}
                        </p>
                    )}
                </section>

                <section className='vd-card'>
                    <h3 className='vd-card__title'>{localize('What can happen')}</h3>
                    {table.length === 0 ? (
                        <p className='vd-card__text'>{localize('Loading prices…')}</p>
                    ) : (
                        <>
                            <div className='vd-trade-log'>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>{localize('Outcome')}</th>
                                            <th>{localize('Chance')}</th>
                                            <th>{localize('Net result')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {table.map(o => (
                                            <tr key={o.label}>
                                                <td>
                                                    {o.label}
                                                    {o.digits ? <small> ({localize('last digit')} {o.digits.join(', ')})</small> : null}
                                                </td>
                                                <td>{Math.round(o.probability * 100)}%</td>
                                                <td className={classNames({ 'is-up': o.net > 0, 'is-down': o.net < 0 })}>
                                                    {o.net > 0 ? '+' : ''}
                                                    {o.net.toFixed(2)} {currency}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className={classNames('vd-hedge__ev', { 'is-down': expected < 0 })}>
                                {localize('Average result per hedge: {{ev}} {{c}}', { ev: expected.toFixed(2), c: currency })}
                            </p>
                            <p className='vd-card__text'>
                                {localize(
                                    'Hedging two sides does not remove the house edge: each leg pays less than fair odds, so the average result is negative. Chances assume every digit is equally likely{{rf}}.',
                                    { rf: pair.is_digit ? '' : localize(' (Rise/Fall: about 50/50)') }
                                )}
                            </p>
                        </>
                    )}
                </section>
            </div>

            <div style={{ marginTop: '1.6rem' }}>
                <Positions positions={positions} currency={currency} onSell={sell} />
            </div>
        </div>
    );
});

export default HedgingTool;
