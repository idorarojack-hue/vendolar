import React from 'react';
import classNames from 'classnames';
import { TProposalState, useProposal } from '@/hooks/useProposal';
import {
    getReturnPercent,
    getTradeType,
    TContractOption,
    TContractParams,
    TRADE_TYPES,
    TTradeTypeId,
} from '@/services/vindolar/contracts';
import { localize } from '@deriv-com/translations';

export type TTradeSettings = {
    trade_type: TTradeTypeId;
    stake: number;
    duration: number;
    digit: number;
    growth_rate: number;
    take_profit: number;
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
};

const MIN_STAKE = 0.35;

const formatMoney = (value: number | undefined, currency: string) =>
    value === undefined || Number.isNaN(value) ? '—' : `${value.toFixed(2)} ${currency}`;

const BuyButton = ({
    option,
    proposal,
    stake,
    currency,
    is_accumulator,
    is_buying,
    is_disabled,
    onClick,
}: {
    option: TContractOption;
    proposal: TProposalState;
    stake: number;
    currency: string;
    is_accumulator: boolean;
    is_buying: boolean;
    is_disabled: boolean;
    onClick: () => void;
}) => {
    const has_error = Boolean(proposal.error);
    return (
        <div className='vd-buy'>
            <button
                type='button'
                className={classNames('vd-buy__button', `vd-buy__button--${option.side}`)}
                disabled={is_disabled || has_error || proposal.is_loading || is_buying}
                onClick={onClick}
                aria-busy={is_buying}
            >
                <span className='vd-buy__label'>{is_buying ? localize('Buying…') : localize(option.label)}</span>
                {!is_accumulator && (
                    <span className='vd-buy__payout'>
                        {proposal.is_loading ? '…' : formatMoney(proposal.payout, currency)}
                        {!proposal.is_loading && proposal.payout ? (
                            <small>+{getReturnPercent(stake, proposal.payout).toFixed(1)}%</small>
                        ) : null}
                    </span>
                )}
            </button>
            {has_error && <p className='vd-buy__error'>{proposal.error}</p>}
        </div>
    );
};

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
}: TTradePanelProps) => {
    const trade_type = getTradeType(settings.trade_type);
    const is_accumulator = trade_type.id === 'accumulators';
    const [stake_text, setStakeText] = React.useState(String(settings.stake));
    const update = (patch: Partial<TTradeSettings>) => onSettingsChange({ ...settings, ...patch });

    React.useEffect(() => setStakeText(String(settings.stake)), [settings.stake]);

    const params = (option: TContractOption): TContractParams => ({
        contract_type: option.contract_type,
        symbol,
        amount: settings.stake,
        currency,
        duration: trade_type.duration ? settings.duration : undefined,
        digit: trade_type.digit ? settings.digit : undefined,
        growth_rate: is_accumulator ? settings.growth_rate : undefined,
        take_profit: is_accumulator && settings.take_profit > 0 ? settings.take_profit : undefined,
    });

    const first = trade_type.contracts[0];
    const second = trade_type.contracts[1];
    const first_params = params(first);
    const second_params = second ? params(second) : null;
    const first_proposal = useProposal(first_params, { is_logged_in });
    const second_proposal = useProposal(second_params, { is_logged_in });

    const commitStake = (text: string) => {
        const value = Math.round(Number(text) * 100) / 100;
        if (Number.isFinite(value) && value >= MIN_STAKE) update({ stake: value });
        else setStakeText(String(settings.stake));
    };

    const stepStake = (delta: number) => update({ stake: Math.max(MIN_STAKE, Math.round((settings.stake + delta) * 100) / 100) });

    return (
        <aside className='vd-trade-panel' aria-label={localize('Trade')}>
            <div className='vd-trade-panel__types' role='radiogroup' aria-label={localize('Trade type')}>
                {TRADE_TYPES.map(type => (
                    <button
                        key={type.id}
                        type='button'
                        role='radio'
                        aria-checked={type.id === trade_type.id}
                        className={classNames({ 'is-active': type.id === trade_type.id })}
                        onClick={() =>
                            update({
                                trade_type: type.id,
                                duration: type.duration?.default ?? settings.duration,
                                digit: type.digit?.default ?? settings.digit,
                            })
                        }
                    >
                        {localize(type.label)}
                    </button>
                ))}
            </div>

            <p className='vd-trade-panel__description'>{localize(trade_type.description)}</p>

            {trade_type.digit && (
                <fieldset className='vd-trade-panel__group'>
                    <legend>{localize('Digit')}</legend>
                    <div className='vd-digit-picker'>
                        {Array.from({ length: 10 }, (_, d) => (
                            <button
                                key={d}
                                type='button'
                                aria-pressed={settings.digit === d}
                                className={classNames({ 'is-active': settings.digit === d })}
                                onClick={() => update({ digit: d })}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </fieldset>
            )}

            {trade_type.duration && (
                <fieldset className='vd-trade-panel__group'>
                    <legend>{localize('Duration (ticks)')}</legend>
                    <div className='vd-stepper'>
                        <button
                            type='button'
                            aria-label={localize('Fewer ticks')}
                            disabled={settings.duration <= trade_type.duration.min}
                            onClick={() => update({ duration: settings.duration - 1 })}
                        >
                            −
                        </button>
                        <output>
                            {settings.duration} {settings.duration === 1 ? localize('tick') : localize('ticks')}
                        </output>
                        <button
                            type='button'
                            aria-label={localize('More ticks')}
                            disabled={settings.duration >= trade_type.duration.max}
                            onClick={() => update({ duration: settings.duration + 1 })}
                        >
                            +
                        </button>
                    </div>
                </fieldset>
            )}

            {is_accumulator && (
                <fieldset className='vd-trade-panel__group'>
                    <legend>{localize('Growth rate')}</legend>
                    <div className='vd-digit-picker vd-digit-picker--wide'>
                        {trade_type.growth_rates?.map(rate => (
                            <button
                                key={rate}
                                type='button'
                                aria-pressed={settings.growth_rate === rate}
                                className={classNames({ 'is-active': settings.growth_rate === rate })}
                                onClick={() => update({ growth_rate: rate })}
                            >
                                {Math.round(rate * 100)}%
                            </button>
                        ))}
                    </div>
                </fieldset>
            )}

            <fieldset className='vd-trade-panel__group'>
                <legend>{localize('Stake')}</legend>
                <div className='vd-stepper vd-stepper--input'>
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
                        <span className='vd-stepper__unit'>{currency}</span>
                    </label>
                    <button type='button' aria-label={localize('Increase stake')} onClick={() => stepStake(1)}>
                        +
                    </button>
                </div>
            </fieldset>

            {is_accumulator && (
                <fieldset className='vd-trade-panel__group'>
                    <legend>{localize('Take profit (optional)')}</legend>
                    <div className='vd-stepper vd-stepper--input'>
                        <label>
                            <span className='vd-sr-only'>{localize('Take profit amount')}</span>
                            <input
                                inputMode='decimal'
                                placeholder={localize('Off')}
                                defaultValue={settings.take_profit || ''}
                                onBlur={e => update({ take_profit: Math.max(0, Number(e.target.value) || 0) })}
                            />
                            <span className='vd-stepper__unit'>{currency}</span>
                        </label>
                    </div>
                    <dl className='vd-trade-panel__facts'>
                        <div>
                            <dt>{localize('Max. payout')}</dt>
                            <dd>{formatMoney(first_proposal.max_payout, currency)}</dd>
                        </div>
                        <div>
                            <dt>{localize('Max. ticks')}</dt>
                            <dd>{first_proposal.max_ticks ?? '—'}</dd>
                        </div>
                    </dl>
                </fieldset>
            )}

            {!can_trade && disabled_reason && <p className='vd-trade-panel__notice'>{disabled_reason}</p>}

            <div className={classNames('vd-trade-panel__buy', { 'vd-trade-panel__buy--single': !second })}>
                <BuyButton
                    option={first}
                    proposal={first_proposal}
                    stake={settings.stake}
                    currency={currency}
                    is_accumulator={is_accumulator}
                    is_buying={buying_contract_type === first.contract_type}
                    is_disabled={!can_trade || Boolean(buying_contract_type)}
                    onClick={() => onBuy(first_params)}
                />
                {second && second_params && (
                    <BuyButton
                        option={second}
                        proposal={second_proposal}
                        stake={settings.stake}
                        currency={currency}
                        is_accumulator={is_accumulator}
                        is_buying={buying_contract_type === second.contract_type}
                        is_disabled={!can_trade || Boolean(buying_contract_type)}
                        onClick={() => onBuy(second_params)}
                    />
                )}
            </div>
        </aside>
    );
};

export default TradePanel;
