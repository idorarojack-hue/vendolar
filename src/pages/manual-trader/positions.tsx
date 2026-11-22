import classNames from 'classnames';
import { TRADE_TYPES } from '@/services/vindolar/contracts';
import { TOpenContract } from '@/services/vindolar/trading';
import { localize } from '@deriv-com/translations';

export type TPosition = TOpenContract & { market_name: string; is_selling?: boolean };

const CONTRACT_LABELS: Record<string, string> = Object.fromEntries(
    TRADE_TYPES.flatMap(type =>
        type.contracts.map(c => [c.contract_type, type.id === 'accumulators' ? 'Accumulator' : c.label])
    )
);

export const isClosed = (p: TOpenContract) => Boolean(p.is_sold) || (p.status !== undefined && p.status !== 'open');

const contractLabel = (p: TPosition) => {
    const label = localize(CONTRACT_LABELS[p.contract_type] ?? p.contract_type);
    return p.barrier && /^DIGIT(OVER|UNDER|MATCH|DIFF)$/.test(p.contract_type) ? `${label} ${p.barrier}` : label;
};

type TPositionsProps = {
    positions: TPosition[];
    currency: string;
    onSell: (contract_id: number) => void;
};

const Money = ({ value, currency }: { value?: number; currency: string }) => {
    if (value === undefined || Number.isNaN(value)) return <span>—</span>;
    return (
        <span className={classNames('vd-money', { 'vd-money--up': value > 0, 'vd-money--down': value < 0 })}>
            {value > 0 ? '+' : ''}
            {value.toFixed(2)} {currency}
        </span>
    );
};

const Positions = ({ positions, currency, onSell }: TPositionsProps) => {
    const open = positions.filter(p => !isClosed(p));
    const closed = positions.filter(isClosed);
    const wins = closed.filter(p => Number(p.profit) > 0).length;
    const total_profit = closed.reduce((sum, p) => sum + Number(p.profit ?? 0), 0);
    const total_stake = positions.reduce((sum, p) => sum + Number(p.buy_price ?? 0), 0);

    return (
        <section className='vd-positions' aria-label={localize('Positions')}>
            <dl className='vd-positions__summary'>
                <div>
                    <dt>{localize('Trades')}</dt>
                    <dd>{positions.length}</dd>
                </div>
                <div>
                    <dt>{localize('Won / Lost')}</dt>
                    <dd>
                        {wins} / {closed.length - wins}
                    </dd>
                </div>
                <div>
                    <dt>{localize('Total stake')}</dt>
                    <dd>
                        {total_stake.toFixed(2)} {currency}
                    </dd>
                </div>
                <div>
                    <dt>{localize('Profit/loss')}</dt>
                    <dd>
                        <Money value={total_profit} currency={currency} />
                    </dd>
                </div>
            </dl>

            {positions.length === 0 ? (
                <p className='vd-positions__empty'>{localize('Your trades from this session will appear here.')}</p>
            ) : (
                <ul className='vd-positions__list'>
                    {[...open, ...closed].map(p => {
                        const closed_now = isClosed(p);
                        const profit = Number(p.profit);
                        return (
                            <li
                                key={p.contract_id}
                                className={classNames('vd-position', {
                                    'vd-position--won': closed_now && profit > 0,
                                    'vd-position--lost': closed_now && profit <= 0,
                                })}
                            >
                                <div className='vd-position__main'>
                                    <strong>{contractLabel(p)}</strong>
                                    <span>{p.market_name}</span>
                                </div>
                                <div className='vd-position__meta'>
                                    <span>
                                        {localize('Stake')} {Number(p.buy_price).toFixed(2)}
                                    </span>
                                    {!closed_now && p.tick_count && p.contract_type !== 'ACCU' ? (
                                        <span>
                                            {localize('Tick')} {p.tick_passed ?? 0}/{p.tick_count}
                                        </span>
                                    ) : null}
                                    {!closed_now && p.contract_type === 'ACCU' && p.tick_passed !== undefined ? (
                                        <span>
                                            {p.tick_passed} {localize('ticks')}
                                        </span>
                                    ) : null}
                                </div>
                                <div className='vd-position__result'>
                                    {closed_now ? (
                                        <span className='vd-position__status'>
                                            {p.status === 'sold'
                                                ? localize('Sold')
                                                : profit > 0
                                                  ? localize('Won')
                                                  : localize('Lost')}
                                        </span>
                                    ) : (
                                        <span className='vd-position__status vd-position__status--open'>
                                            {localize('Open')}
                                        </span>
                                    )}
                                    <Money value={p.profit === undefined ? undefined : profit} currency={currency} />
                                </div>
                                {!closed_now && p.is_valid_to_sell ? (
                                    <button
                                        type='button'
                                        className='vd-position__sell'
                                        disabled={p.is_selling}
                                        onClick={() => onSell(p.contract_id)}
                                    >
                                        {p.is_selling ? localize('Selling…') : localize('Sell')}
                                        {!p.is_selling && p.bid_price !== undefined ? ` ${Number(p.bid_price).toFixed(2)}` : ''}
                                    </button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

export default Positions;
