import React from 'react';
import classNames from 'classnames';
import { TRADE_TYPES } from '@/services/vindolar/contracts';
import { TOpenContract } from '@/services/vindolar/trading';
import { localize } from '@deriv-com/translations';

export type TPosition = TOpenContract & { market_name: string; is_selling?: boolean };

const CONTRACT_LABELS: Record<string, string> = {
    ...Object.fromEntries(
        TRADE_TYPES.flatMap(type =>
            type.contracts.map(c => [
                c.contract_type,
                type.id === 'accumulators'
                    ? 'Accumulator'
                    : type.id === 'multipliers'
                      ? `Multiplier ${c.label}`
                      : type.id === 'turbos'
                        ? `Turbos ${c.label}`
                        : c.label,
            ])
        )
    ),
    CALLE: 'Rise (allow equals)',
    PUTE: 'Fall (allow equals)',
};

export const isClosed = (p: TOpenContract) => Boolean(p.is_sold) || (p.status !== undefined && p.status !== 'open');

const contractLabel = (p: TPosition) => {
    if (!p.contract_type) return localize('Contract');
    const label = localize(CONTRACT_LABELS[p.contract_type] ?? p.contract_type);
    if (p.barrier && /^DIGIT(OVER|UNDER|MATCH|DIFF)$/.test(p.contract_type)) return `${label} ${p.barrier}`;
    if (p.multiplier) return `${label} x${p.multiplier}`;
    return label;
};

type TLimits = { take_profit?: number | null; stop_loss?: number | null };

type TPositionsProps = {
    positions: TPosition[];
    currency: string;
    onSell: (contract_id: number) => void;
    /** Deal cancellation (multipliers). */
    onCancel?: (contract_id: number) => void;
    /** Change take profit / stop loss (multipliers, accumulators). */
    onUpdateLimits?: (contract_id: number, limits: TLimits) => void;
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

/** Inline take profit / stop loss editor for one open contract. */
const LimitsEditor = ({
    position,
    currency,
    onSave,
    onClose,
}: {
    position: TPosition;
    currency: string;
    onSave: (limits: TLimits) => void;
    onClose: () => void;
}) => {
    const is_multiplier = /^MULT/.test(position.contract_type);
    const current_tp = position.limit_order?.take_profit?.order_amount;
    const current_sl = position.limit_order?.stop_loss?.order_amount;
    const [tp, setTp] = React.useState(current_tp ? String(Math.abs(current_tp)) : '');
    const [sl, setSl] = React.useState(current_sl ? String(Math.abs(current_sl)) : '');
    const toLimit = (text: string) => (text.trim() === '' || Number(text) <= 0 ? null : Number(text));

    return (
        <form
            className='vd-position__limits'
            onSubmit={e => {
                e.preventDefault();
                onSave(
                    is_multiplier ? { take_profit: toLimit(tp), stop_loss: toLimit(sl) } : { take_profit: toLimit(tp) }
                );
                onClose();
            }}
        >
            <label>
                <span>{localize('Take profit')}</span>
                <input
                    inputMode='decimal'
                    value={tp}
                    placeholder={localize('Off')}
                    onChange={e => setTp(e.target.value)}
                />
                <small>{currency}</small>
            </label>
            {is_multiplier && (
                <label>
                    <span>{localize('Stop loss')}</span>
                    <input
                        inputMode='decimal'
                        value={sl}
                        placeholder={localize('Off')}
                        onChange={e => setSl(e.target.value)}
                    />
                    <small>{currency}</small>
                </label>
            )}
            <button type='submit'>{localize('Save')}</button>
            <button type='button' className='is-plain' onClick={onClose}>
                {localize('Close')}
            </button>
        </form>
    );
};

const Positions = ({ positions, currency, onSell, onCancel, onUpdateLimits }: TPositionsProps) => {
    const [editing, setEditing] = React.useState<number | null>(null);
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
                <p className='vd-positions__empty'>
                    {localize('Your open contracts and the trades from this session will appear here.')}
                </p>
            ) : (
                <ul className='vd-positions__list'>
                    {[...open, ...closed].map(p => {
                        const closed_now = isClosed(p);
                        const profit = Number(p.profit);
                        const can_edit =
                            !closed_now &&
                            Boolean(onUpdateLimits) &&
                            Boolean(p.is_valid_to_update) &&
                            /^(MULT|ACCU)/.test(p.contract_type);
                        const can_cancel = !closed_now && Boolean(onCancel) && Boolean(p.is_valid_to_cancel);
                        const tp = p.limit_order?.take_profit?.order_amount;
                        const sl = p.limit_order?.stop_loss?.order_amount;
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
                                    {!closed_now && (tp || sl) ? (
                                        <span>
                                            {tp ? `${localize('TP')} ${Math.abs(tp).toFixed(2)}` : ''}
                                            {tp && sl ? ' · ' : ''}
                                            {sl ? `${localize('SL')} ${Math.abs(sl).toFixed(2)}` : ''}
                                        </span>
                                    ) : null}
                                </div>
                                <div className='vd-position__result'>
                                    {closed_now ? (
                                        <span className='vd-position__status'>
                                            {p.status === 'sold'
                                                ? localize('Sold')
                                                : p.status === 'cancelled'
                                                  ? localize('Cancelled')
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
                                {!closed_now && (can_edit || can_cancel || p.is_valid_to_sell) ? (
                                    <div className='vd-position__actions'>
                                        {can_edit && (
                                            <button
                                                type='button'
                                                className='vd-position__action'
                                                onClick={() =>
                                                    setEditing(editing === p.contract_id ? null : p.contract_id)
                                                }
                                            >
                                                {localize('TP / SL')}
                                            </button>
                                        )}
                                        {can_cancel && (
                                            <button
                                                type='button'
                                                className='vd-position__action'
                                                disabled={p.is_selling}
                                                onClick={() => onCancel?.(p.contract_id)}
                                            >
                                                {localize('Cancel deal')}
                                            </button>
                                        )}
                                        {p.is_valid_to_sell ? (
                                            <button
                                                type='button'
                                                className='vd-position__sell'
                                                disabled={p.is_selling}
                                                onClick={() => onSell(p.contract_id)}
                                            >
                                                {p.is_selling ? localize('Selling…') : localize('Sell')}
                                                {!p.is_selling && p.bid_price !== undefined
                                                    ? ` ${Number(p.bid_price).toFixed(2)}`
                                                    : ''}
                                            </button>
                                        ) : null}
                                    </div>
                                ) : null}
                                {editing === p.contract_id && can_edit && (
                                    <LimitsEditor
                                        position={p}
                                        currency={currency}
                                        onSave={limits => onUpdateLimits?.(p.contract_id, limits)}
                                        onClose={() => setEditing(null)}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

export default Positions;
