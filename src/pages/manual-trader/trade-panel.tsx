import React from 'react';
import classNames from 'classnames';
import { TProposalState, useProposal } from '@/hooks/useProposal';
import {
    getReturnPercent,
    getTradeType,
    TContractOption,
    TContractParams,
    TRADE_GROUPS,
    TRADE_TYPES,
    TTradeType,
    TTradeTypeId,
} from '@/services/vindolar/contracts';
import { pickOffering, TOffering, useOfferings } from '@/services/vindolar/contracts-for';
import { localize } from '@deriv-com/translations';

export type TTradeSettings = {
    trade_type: TTradeTypeId;
    stake: number;
    duration: number;
    digit: number;
    growth_rate: number;
    take_profit: number;
    /** Rise/Fall: also win when the exit equals the entry (CALLE / PUTE). */
    allow_equals: boolean;
    /** Offset barrier ("+0.58"); empty = Deriv's default for the market. */
    barrier: string;
    barrier_high: string;
    barrier_low: string;
    /** Index into the strike (vanillas) or barrier-distance (turbos) choices. */
    barrier_choice: number;
    selected_tick: number;
    multiplier: number;
    stop_loss: number;
    /** Deal cancellation window, e.g. "5m"; empty = off. */
    cancellation: string;
    use_take_profit: boolean;
    use_stop_loss: boolean;
};

export const DEFAULT_TRADE_SETTINGS: TTradeSettings = {
    trade_type: 'rise_fall',
    stake: 1,
    duration: 5,
    digit: 4,
    growth_rate: 0.03,
    take_profit: 0,
    allow_equals: false,
    barrier: '',
    barrier_high: '',
    barrier_low: '',
    barrier_choice: 2,
    selected_tick: 1,
    multiplier: 100,
    stop_loss: 0,
    cancellation: '',
    use_take_profit: false,
    use_stop_loss: false,
};

type TTradePanelProps = {
    symbol: string;
    currency: string;
    settings: TTradeSettings;
    onSettingsChange: (settings: TTradeSettings) => void;
    onBuy: (params: TContractParams) => void;
    buying_contract_type: string | null;
    can_trade: boolean;
    is_logged_in: boolean;
    disabled_reason?: string;
    /** Gets the live accumulator quote (range, stats), or null for other trade types. */
    onAccumulatorQuote?: (proposal: TProposalState | null) => void;
};

const MIN_STAKE = 0.35;
const OFFSET_PATTERN = /^[+-]\d+(\.\d+)?$/;
const TURBO_LIST = /Barriers available are (.+?)\.?$/;

const formatMoney = (value: number | undefined, currency: string) =>
    value === undefined || Number.isNaN(value) ? '—' : `${value.toFixed(2)} ${currency}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Duration limits for a trade type on this market, from contracts_for when it matches the unit. */
const durationLimits = (type: TTradeType, offering?: TOffering) => {
    if (!type.duration) return null;
    const unit = type.duration_unit ?? 't';
    let { min, max } = type.duration;
    if (offering?.min?.unit === unit) min = Math.max(min, offering.min.value);
    if (offering?.max?.unit === unit) max = Math.min(max, offering.max.value);
    return { min, max: Math.max(min, max), unit };
};

/** Small trade-type icon: up-right arrow, down-right arrow, or a range line for accumulators. */
const TypeIcon = ({ kind }: { kind: 'up' | 'down' | 'range' }) => (
    <svg className='vd-mt-icon' viewBox='0 0 24 24' aria-hidden='true'>
        {kind === 'up' && (
            <path
                d='M4 18 L18 6 M10 6 H18 V14'
                fill='none'
                stroke='currentColor'
                strokeWidth='2.2'
                strokeLinecap='round'
            />
        )}
        {kind === 'down' && (
            <path
                d='M4 6 L18 18 M18 10 V18 H10'
                fill='none'
                stroke='currentColor'
                strokeWidth='2.2'
                strokeLinecap='round'
            />
        )}
        {kind === 'range' && (
            <path
                d='M3 7 H21 M3 17 H21 M4 13 L8 10 L12 13 L16 9 L20 12'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                strokeLinecap='round'
            />
        )}
    </svg>
);

const BuyButton = ({
    option,
    type,
    proposal,
    stake,
    currency,
    is_buying,
    is_disabled,
    onClick,
}: {
    option: TContractOption;
    type: TTradeType;
    proposal: TProposalState;
    stake: number;
    currency: string;
    is_buying: boolean;
    is_disabled: boolean;
    onClick: () => void;
}) => {
    const has_error = Boolean(proposal.error) && !TURBO_LIST.test(proposal.error ?? '');
    const is_accumulator = type.id === 'accumulators';

    let detail: React.ReactNode = null;
    if (type.multiplier) {
        detail = (
            <>
                <span>{proposal.cancellation_fee ? localize('Deal cancel. fee') : localize('Stop out')}</span>
                <strong>
                    {proposal.is_loading ? '…' : formatMoney(proposal.cancellation_fee ?? proposal.stop_out, currency)}
                </strong>
            </>
        );
    } else if (type.barrier === 'turbo' || type.barrier === 'choices') {
        detail = (
            <>
                <span>{localize('Payout per point')}</span>
                <strong>{proposal.is_loading ? '…' : (proposal.payout_per_point ?? '—')}</strong>
            </>
        );
    } else if (!is_accumulator) {
        detail = (
            <>
                <span>
                    {localize('Payout')}
                    {!proposal.is_loading && proposal.payout ? (
                        <small> +{getReturnPercent(stake, proposal.payout).toFixed(1)}%</small>
                    ) : null}
                </span>
                <strong>{proposal.is_loading ? '…' : formatMoney(proposal.payout, currency)}</strong>
            </>
        );
    }

    return (
        <div className='vd-mt-buy'>
            <button
                type='button'
                className={classNames('vd-mt-buy__button', `vd-mt-buy__button--${option.side}`, {
                    'vd-mt-buy__button--accu': is_accumulator,
                })}
                disabled={is_disabled || Boolean(proposal.error) || proposal.is_loading || is_buying}
                onClick={onClick}
                aria-busy={is_buying}
            >
                <span className='vd-mt-buy__label'>
                    <TypeIcon kind={is_accumulator ? 'range' : option.side === 'down' ? 'down' : 'up'} />
                    {is_buying ? localize('Buying…') : localize(option.label)}
                </span>
                {detail && <span className='vd-mt-buy__payout'>{detail}</span>}
            </button>
            {has_error && <p className='vd-mt-buy__error'>{proposal.error}</p>}
        </div>
    );
};

/** Money input with an on/off checkbox (take profit, stop loss). */
const LimitField = ({
    label,
    hint,
    enabled,
    value,
    currency,
    disabled,
    disabled_note,
    onToggle,
    onValue,
}: {
    label: string;
    hint: string;
    enabled: boolean;
    value: number;
    currency: string;
    disabled?: boolean;
    disabled_note?: string;
    onToggle: (enabled: boolean) => void;
    onValue: (value: number) => void;
}) => (
    <div className='vd-mt-side__box'>
        <label className={classNames('vd-mt-check', { 'is-disabled': disabled })}>
            <input
                type='checkbox'
                checked={enabled && !disabled}
                disabled={disabled}
                onChange={e => onToggle(e.target.checked)}
            />
            <span>{label}</span>
            <i title={hint}>i</i>
        </label>
        {disabled && disabled_note && <small className='vd-mt-side__hint'>{disabled_note}</small>}
        {enabled && !disabled && (
            <div className='vd-mt-stepper vd-mt-stepper--plain'>
                <label>
                    <span className='vd-sr-only'>{label}</span>
                    <input
                        inputMode='decimal'
                        placeholder={localize('Amount')}
                        defaultValue={value || ''}
                        onBlur={e => onValue(Math.max(0, Number(e.target.value) || 0))}
                    />
                    <span>{currency}</span>
                </label>
            </div>
        )}
    </div>
);

const TradePanel = ({
    symbol,
    currency,
    settings,
    onSettingsChange,
    onBuy,
    buying_contract_type,
    can_trade,
    is_logged_in,
    disabled_reason,
    onAccumulatorQuote,
}: TTradePanelProps) => {
    const s = { ...DEFAULT_TRADE_SETTINGS, ...settings };
    const type = getTradeType(s.trade_type);
    const is_accumulator = type.id === 'accumulators';
    const [stake_text, setStakeText] = React.useState(String(s.stake));
    const [show_help, setShowHelp] = React.useState(false);
    // Turbo barriers move with the price; Deriv's error lists the current ones, which we switch to.
    const [turbo_lists, setTurboLists] = React.useState<Record<string, string[]>>({});
    const update = (patch: Partial<TTradeSettings>) => onSettingsChange({ ...s, ...patch });

    React.useEffect(() => setStakeText(String(s.stake)), [s.stake]);
    React.useEffect(() => setTurboLists({}), [symbol]);

    const offerings = useOfferings(symbol);
    const offeringFor = (contract_type: string) => (offerings ? pickOffering(offerings, contract_type) : undefined);
    const first = type.contracts[0];
    const second = type.contracts[1];
    const offering = offeringFor(first.contract_type);
    const available_types = offerings?.length
        ? TRADE_TYPES.filter(t => t.contracts.every(c => offeringFor(c.contract_type)))
        : TRADE_TYPES;
    const is_offered = !offerings?.length || available_types.some(t => t.id === type.id);

    const limits = durationLimits(type, offering);
    const duration = limits ? clamp(s.duration, limits.min, limits.max) : undefined;
    const multipliers = offering?.multiplier_range?.length ? offering.multiplier_range : [40, 100, 200, 300, 400];
    const multiplier = multipliers.includes(s.multiplier)
        ? s.multiplier
        : multipliers[Math.min(1, multipliers.length - 1)];
    const cancellations = offering?.cancellation_range ?? [];
    const min_stake = Math.max(MIN_STAKE, offering?.min_stake ?? 0);

    // Strike / turbo choices
    const vanilla_choices = type.barrier === 'choices' ? (offering?.barrier_choices ?? []) : [];
    const turboChoices = (option: TContractOption) => {
        const fresh = turbo_lists[option.contract_type];
        if (fresh?.length) return fresh;
        const sign = option.contract_type === 'TURBOSLONG' ? '-' : '+';
        return (offeringFor(option.contract_type)?.barrier_choices ?? []).map(v =>
            /^[+-]/.test(v) ? v : `${sign}${v}`
        );
    };
    const choice_count = type.barrier === 'turbo' ? turboChoices(first).length : vanilla_choices.length;
    const choice_index = choice_count ? clamp(s.barrier_choice, 0, choice_count - 1) : 0;

    const offset_barrier =
        type.barrier === 'offset'
            ? OFFSET_PATTERN.test(s.barrier)
                ? s.barrier
                : (offering?.barrier ?? '+0.58')
            : undefined;
    const range_high =
        type.barrier === 'range'
            ? OFFSET_PATTERN.test(s.barrier_high)
                ? s.barrier_high
                : (offering?.high_barrier ?? '+2.80')
            : undefined;
    const range_low =
        type.barrier === 'range'
            ? OFFSET_PATTERN.test(s.barrier_low)
                ? s.barrier_low
                : (offering?.low_barrier ?? '-2.80')
            : undefined;

    const contractTypeFor = (option: TContractOption) => {
        if (type.allow_equals && s.allow_equals) {
            if (option.contract_type === 'CALL') return 'CALLE';
            if (option.contract_type === 'PUT') return 'PUTE';
        }
        return option.contract_type;
    };

    const barrierFor = (option: TContractOption): { barrier?: string; barrier2?: string } => {
        switch (type.barrier) {
            case 'offset':
                return { barrier: offset_barrier };
            case 'range':
                return { barrier: range_high, barrier2: range_low };
            case 'choices':
                return { barrier: vanilla_choices[choice_index] };
            case 'turbo':
                return { barrier: turboChoices(option)[choice_index] };
            default:
                return {};
        }
    };

    const params = (option: TContractOption): TContractParams => ({
        contract_type: contractTypeFor(option),
        symbol,
        amount: s.stake,
        currency,
        duration,
        duration_unit: limits?.unit,
        digit: type.digit ? s.digit : undefined,
        growth_rate: is_accumulator ? s.growth_rate : undefined,
        take_profit:
            (is_accumulator || type.multiplier) && s.use_take_profit && s.take_profit > 0 ? s.take_profit : undefined,
        stop_loss: type.multiplier && s.use_stop_loss && !s.cancellation && s.stop_loss > 0 ? s.stop_loss : undefined,
        multiplier: type.multiplier ? multiplier : undefined,
        cancellation: type.multiplier && s.cancellation ? s.cancellation : undefined,
        selected_tick: type.selected_tick ? s.selected_tick : undefined,
        ...barrierFor(option),
    });

    const first_params = params(first);
    const second_params = second ? params(second) : null;
    const ready = type.barrier === 'turbo' || type.barrier === 'choices' ? choice_count > 0 : true;
    const first_proposal = useProposal(is_offered && ready ? first_params : null, { is_logged_in });
    const second_proposal = useProposal(is_offered && ready ? second_params : null, { is_logged_in });

    // Turbos: when Deriv says the barrier moved, switch to the list it gives.
    React.useEffect(() => {
        if (type.barrier !== 'turbo') return;
        [
            [first, first_proposal],
            [second, second_proposal],
        ].forEach(([option, proposal]) => {
            const match = TURBO_LIST.exec((proposal as TProposalState)?.error ?? '');
            if (option && match) {
                const list = match[1].split(',').map(v => v.trim());
                setTurboLists(previous => ({ ...previous, [(option as TContractOption).contract_type]: list }));
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [first_proposal.error, second_proposal.error, type.barrier]);

    React.useEffect(() => {
        onAccumulatorQuote?.(is_accumulator ? first_proposal : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_accumulator, first_proposal]);

    const commitStake = (text: string) => {
        const value = Math.round(Number(text) * 100) / 100;
        if (Number.isFinite(value) && value >= min_stake) update({ stake: value });
        else setStakeText(String(s.stake));
    };

    const stepStake = (delta: number) =>
        update({ stake: Math.max(min_stake, Math.round((s.stake + delta) * 100) / 100) });

    const chooseType = (id: TTradeTypeId) => {
        const next = getTradeType(id);
        update({
            trade_type: next.id,
            duration: next.duration?.default ?? s.duration,
            digit: next.digit?.default ?? s.digit,
            barrier: '',
            barrier_high: '',
            barrier_low: '',
            barrier_choice: 2,
        });
    };

    const unit_label = (n: number) =>
        limits?.unit === 'm'
            ? n === 1
                ? localize('minute')
                : localize('minutes')
            : n === 1
              ? localize('tick')
              : localize('ticks');

    return (
        <aside className='vd-mt-side' aria-label={localize('Trade')}>
            <button
                type='button'
                className='vd-mt-side__learn'
                aria-expanded={show_help}
                onClick={() => setShowHelp(v => !v)}
            >
                {localize('Learn about this trade type')}
            </button>

            {/* Trade type: a native select under a styled row, so it works with touch and keyboard. */}
            <label className='vd-mt-side__box vd-mt-type'>
                <span className='vd-mt-type__back' aria-hidden='true' />
                <span className='vd-mt-type__icon' aria-hidden='true'>
                    <TypeIcon kind={is_accumulator ? 'range' : 'up'} />
                </span>
                <span className='vd-mt-type__name'>{localize(type.label)}</span>
                <select
                    className='vd-mt-type__select'
                    aria-label={localize('Trade type')}
                    value={type.id}
                    onChange={e => chooseType(e.target.value as TTradeTypeId)}
                >
                    {TRADE_GROUPS.map(group => {
                        const items = available_types.filter(t => t.group === group);
                        if (!items.length) return null;
                        return (
                            <optgroup key={group} label={localize(group)}>
                                {items.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {localize(t.label)}
                                    </option>
                                ))}
                            </optgroup>
                        );
                    })}
                    {!is_offered && <option value={type.id}>{localize(type.label)}</option>}
                </select>
            </label>
            {show_help && <p className='vd-mt-side__help'>{localize(type.description)}</p>}
            {!is_offered && (
                <p className='vd-mt-side__notice'>{localize('This trade type is not offered on this market.')}</p>
            )}

            {is_accumulator && (
                <div className='vd-mt-side__box'>
                    <span className='vd-mt-side__head'>
                        {localize('Growth rate')}
                        <i
                            title={localize(
                                'Your stake grows by this much every tick the price stays inside the range.'
                            )}
                        >
                            i
                        </i>
                    </span>
                    <div className='vd-mt-seg' role='radiogroup' aria-label={localize('Growth rate')}>
                        {(offering?.growth_rate_range ?? type.growth_rates ?? []).map(rate => (
                            <button
                                key={rate}
                                type='button'
                                role='radio'
                                aria-checked={s.growth_rate === rate}
                                className={classNames({ 'is-active': s.growth_rate === rate })}
                                onClick={() => update({ growth_rate: rate })}
                            >
                                {Math.round(rate * 100)}%
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {type.multiplier && (
                <div className='vd-mt-side__box'>
                    <span className='vd-mt-side__head'>{localize('Multiplier')}</span>
                    <div className='vd-mt-seg' role='radiogroup' aria-label={localize('Multiplier')}>
                        {multipliers.map(m => (
                            <button
                                key={m}
                                type='button'
                                role='radio'
                                aria-checked={multiplier === m}
                                className={classNames({ 'is-active': multiplier === m })}
                                onClick={() => update({ multiplier: m })}
                            >
                                x{m}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {type.digit && (
                <div className='vd-mt-side__box'>
                    <span className='vd-mt-side__head'>{localize('Last digit prediction')}</span>
                    <div className='vd-mt-digits' role='radiogroup' aria-label={localize('Digit')}>
                        {Array.from({ length: 10 }, (_, d) => (
                            <button
                                key={d}
                                type='button'
                                role='radio'
                                aria-checked={s.digit === d}
                                className={classNames({ 'is-active': s.digit === d })}
                                onClick={() => update({ digit: d })}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {type.selected_tick && (
                <div className='vd-mt-side__box'>
                    <span className='vd-mt-side__head'>{localize('Tick prediction')}</span>
                    <div className='vd-mt-seg' role='radiogroup' aria-label={localize('Tick prediction')}>
                        {[1, 2, 3, 4, 5].map(t => (
                            <button
                                key={t}
                                type='button'
                                role='radio'
                                aria-checked={s.selected_tick === t}
                                className={classNames({ 'is-active': s.selected_tick === t })}
                                onClick={() => update({ selected_tick: t })}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {limits && duration !== undefined && (
                <div className='vd-mt-side__box'>
                    <span className='vd-mt-side__head'>{localize('Duration')}</span>
                    <div className='vd-mt-stepper'>
                        <button
                            type='button'
                            aria-label={localize('Shorter')}
                            disabled={duration <= limits.min}
                            onClick={() => update({ duration: duration - 1 })}
                        >
                            −
                        </button>
                        <output>
                            {duration} {unit_label(duration)}
                        </output>
                        <button
                            type='button'
                            aria-label={localize('Longer')}
                            disabled={duration >= limits.max}
                            onClick={() => update({ duration: duration + 1 })}
                        >
                            +
                        </button>
                    </div>
                </div>
            )}

            {type.allow_equals && (
                <div className='vd-mt-side__box'>
                    <label className='vd-mt-check'>
                        <input
                            type='checkbox'
                            checked={s.allow_equals}
                            onChange={e => update({ allow_equals: e.target.checked })}
                        />
                        <span>{localize('Allow equals')}</span>
                        <i title={localize('Also win if the exit price equals the entry price (lower payout).')}>i</i>
                    </label>
                </div>
            )}

            {type.barrier === 'offset' && (
                <div className='vd-mt-side__box'>
                    <span className='vd-mt-side__head'>{localize('Barrier')}</span>
                    <input
                        className='vd-mt-side__input'
                        aria-label={localize('Barrier offset from the entry spot')}
                        placeholder={offering?.barrier ?? '+0.58'}
                        defaultValue={s.barrier}
                        key={`${type.id}-${symbol}`}
                        onBlur={e =>
                            update({ barrier: OFFSET_PATTERN.test(e.target.value.trim()) ? e.target.value.trim() : '' })
                        }
                    />
                    <small className='vd-mt-side__hint'>
                        {localize('Offset from the entry spot, e.g. +0.58 or -0.58. Now: {{b}}', { b: offset_barrier })}
                    </small>
                </div>
            )}

            {type.barrier === 'range' && (
                <div className='vd-mt-side__box'>
                    <span className='vd-mt-side__head'>{localize('Barriers')}</span>
                    <div className='vd-mt-side__pair'>
                        <input
                            className='vd-mt-side__input'
                            aria-label={localize('High barrier')}
                            placeholder={offering?.high_barrier ?? '+2.80'}
                            defaultValue={s.barrier_high}
                            key={`h-${type.id}-${symbol}`}
                            onBlur={e =>
                                update({
                                    barrier_high: OFFSET_PATTERN.test(e.target.value.trim())
                                        ? e.target.value.trim()
                                        : '',
                                })
                            }
                        />
                        <input
                            className='vd-mt-side__input'
                            aria-label={localize('Low barrier')}
                            placeholder={offering?.low_barrier ?? '-2.80'}
                            defaultValue={s.barrier_low}
                            key={`l-${type.id}-${symbol}`}
                            onBlur={e =>
                                update({
                                    barrier_low: OFFSET_PATTERN.test(e.target.value.trim())
                                        ? e.target.value.trim()
                                        : '',
                                })
                            }
                        />
                    </div>
                    <small className='vd-mt-side__hint'>
                        {localize('High {{h}} · Low {{l}} (from the entry spot)', { h: range_high, l: range_low })}
                    </small>
                </div>
            )}

            {(type.barrier === 'choices' || type.barrier === 'turbo') && (
                <div className='vd-mt-side__box'>
                    <span className='vd-mt-side__head'>
                        {type.barrier === 'choices' ? localize('Strike price') : localize('Barrier distance')}
                    </span>
                    {choice_count ? (
                        <select
                            className='vd-mt-side__input'
                            value={choice_index}
                            onChange={e => update({ barrier_choice: Number(e.target.value) })}
                        >
                            {(type.barrier === 'choices' ? vanilla_choices : turboChoices(first)).map((c, i) => (
                                <option key={c} value={i}>
                                    {type.barrier === 'turbo'
                                        ? localize('Level {{n}} · {{d}} from spot', {
                                              n: i + 1,
                                              d: c.replace(/^[+-]/, ''),
                                          })
                                        : c}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <small className='vd-mt-side__hint'>{localize('Loading choices…')}</small>
                    )}
                </div>
            )}

            <div className='vd-mt-side__box'>
                <span className='vd-mt-side__head'>{localize('Stake')}</span>
                <div className='vd-mt-stepper'>
                    <button type='button' aria-label={localize('Decrease stake')} onClick={() => stepStake(-1)}>
                        −
                    </button>
                    <label>
                        <span className='vd-sr-only'>{localize('Stake amount')}</span>
                        <input
                            inputMode='decimal'
                            value={stake_text}
                            onChange={e => setStakeText(e.target.value.replace(/[^0-9.]/g, ''))}
                            onBlur={e => commitStake(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && commitStake((e.target as HTMLInputElement).value)}
                        />
                        <span>{currency}</span>
                    </label>
                    <button type='button' aria-label={localize('Increase stake')} onClick={() => stepStake(1)}>
                        +
                    </button>
                </div>
                {min_stake > MIN_STAKE && (
                    <small className='vd-mt-side__hint'>
                        {localize('Minimum stake {{m}} {{c}}', { m: min_stake.toFixed(2), c: currency })}
                    </small>
                )}
            </div>

            {(is_accumulator || type.multiplier) && (
                <LimitField
                    label={localize('Take profit')}
                    hint={localize('The contract closes automatically when your profit reaches this amount.')}
                    enabled={s.use_take_profit}
                    value={s.take_profit}
                    currency={currency}
                    onToggle={use_take_profit => update({ use_take_profit })}
                    onValue={take_profit => update({ take_profit })}
                />
            )}

            {type.stop_loss && (
                <LimitField
                    label={localize('Stop loss')}
                    hint={localize('The contract closes automatically when your loss reaches this amount.')}
                    enabled={s.use_stop_loss}
                    value={s.stop_loss}
                    currency={currency}
                    disabled={Boolean(s.cancellation)}
                    disabled_note={localize('Not available with deal cancellation.')}
                    onToggle={use_stop_loss => update({ use_stop_loss })}
                    onValue={stop_loss => update({ stop_loss })}
                />
            )}

            {type.cancellation && cancellations.length > 0 && (
                <div className='vd-mt-side__box'>
                    <span className='vd-mt-side__head'>
                        {localize('Deal cancellation')}
                        <i title={localize('For a small fee, cancel within this time and get your full stake back.')}>
                            i
                        </i>
                    </span>
                    <select
                        className='vd-mt-side__input'
                        value={s.cancellation}
                        onChange={e => update({ cancellation: e.target.value })}
                    >
                        <option value=''>{localize('Off')}</option>
                        {cancellations.map(c => (
                            <option key={c} value={c}>
                                {c.replace('m', ' min')}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {is_accumulator && (
                <dl className='vd-mt-side__box vd-mt-facts'>
                    <div>
                        <dt>{localize('Max. payout')}</dt>
                        <dd>{formatMoney(first_proposal.max_payout, currency)}</dd>
                    </div>
                    <div>
                        <dt>{localize('Max. ticks')}</dt>
                        <dd>
                            {first_proposal.max_ticks ? localize('{{n}} ticks', { n: first_proposal.max_ticks }) : '—'}
                        </dd>
                    </div>
                </dl>
            )}

            {!can_trade && disabled_reason && <p className='vd-mt-side__notice'>{disabled_reason}</p>}

            <div className='vd-mt-side__buy'>
                <BuyButton
                    option={first}
                    type={type}
                    proposal={first_proposal}
                    stake={s.stake}
                    currency={currency}
                    is_buying={buying_contract_type === first_params.contract_type}
                    is_disabled={!can_trade || !is_offered || Boolean(buying_contract_type)}
                    onClick={() => onBuy(first_params)}
                />
                {second && second_params && (
                    <BuyButton
                        option={second}
                        type={type}
                        proposal={second_proposal}
                        stake={s.stake}
                        currency={currency}
                        is_buying={buying_contract_type === second_params.contract_type}
                        is_disabled={!can_trade || !is_offered || Boolean(buying_contract_type)}
                        onClick={() => onBuy(second_params)}
                    />
                )}
            </div>
        </aside>
    );
};

export default TradePanel;
