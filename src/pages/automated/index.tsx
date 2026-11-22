import React from 'react';
import classNames from 'classnames';
import AutoSession from '@/components/vindolar/auto-session';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import { useAutoTrader } from '@/hooks/useAutoTrader';
import { useTicks } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { createRuleStrategy, describeCondition, evaluateCondition, TCondition, TRuleTrade } from '@/services/vindolar/rules';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import { LastDigits } from '../analysis-tools/components';

type TVariant = 'eo_digits' | 'eo_percent' | 'ou_digits' | 'ou_percent' | 'rf_percent' | 'md_percent';

type TParams = {
    symbol: string;
    count: number;
    window: number;
    threshold: number;
    op: '>=' | '<=';
    /** even | odd | over | under | rise | fall — what the condition looks at. */
    test: string;
    /** Barrier / digit used by the condition. */
    value: number;
    /** Contract traded and its digit. */
    trade_type: string;
    trade_digit: number;
    duration: number;
    pause_ticks: number;
};

const BASE: TParams = {
    symbol: '1HZ100V',
    count: 5,
    window: 100,
    threshold: 60,
    op: '>=',
    test: 'even',
    value: 4,
    trade_type: 'DIGITEVEN',
    trade_digit: 4,
    duration: 1,
    pause_ticks: 3,
};

const CARDS: { variant: TVariant; title: string; defaults: Partial<TParams> }[] = [
    { variant: 'eo_digits', title: 'Even/Odd (Digits)', defaults: { count: 5, test: 'odd', trade_type: 'DIGITEVEN' } },
    { variant: 'eo_percent', title: 'Even/Odd (Percentages)', defaults: { window: 100, test: 'even', op: '>=', threshold: 60, trade_type: 'DIGITEVEN' } },
    { variant: 'ou_digits', title: 'Over/Under (Digits)', defaults: { count: 3, test: 'under', value: 5, trade_type: 'DIGITOVER', trade_digit: 4 } },
    { variant: 'ou_percent', title: 'Over/Under (Percentages)', defaults: { window: 100, test: 'over', value: 4, op: '>=', threshold: 60, trade_type: 'DIGITOVER', trade_digit: 4 } },
    { variant: 'rf_percent', title: 'Rise/Fall', defaults: { window: 50, test: 'rise', op: '>=', threshold: 60, trade_type: 'CALL', duration: 5 } },
    { variant: 'md_percent', title: 'Matches/Differs', defaults: { window: 100, value: 5, op: '<=', threshold: 7, trade_type: 'DIGITDIFF', trade_digit: 5 } },
];

const toCondition = (variant: TVariant, p: TParams): TCondition => {
    switch (variant) {
        case 'eo_digits':
            return { kind: 'last_digits', count: p.count, test: p.test as 'even' | 'odd' };
        case 'ou_digits':
            return { kind: 'last_digits', count: p.count, test: p.test as 'over' | 'under', value: p.value };
        case 'eo_percent':
        case 'ou_percent':
        case 'rf_percent':
            return { kind: 'percent', window: p.window, metric: p.test as 'even', value: p.value, op: p.op, threshold: p.threshold };
        case 'md_percent':
        default:
            return { kind: 'percent', window: p.window, metric: 'digit', value: p.value, op: p.op, threshold: p.threshold };
    }
};

const toTrade = (variant: TVariant, p: TParams): TRuleTrade => {
    if (variant === 'rf_percent') return { contract_type: p.trade_type, duration: p.duration };
    if (variant === 'ou_digits' || variant === 'ou_percent' || variant === 'md_percent') {
        return { contract_type: p.trade_type, digit: p.trade_digit, duration: 1 };
    }
    return { contract_type: p.trade_type, duration: 1 };
};

const Select = ({
    label,
    value,
    options,
    onChange,
    disabled,
}: {
    label: string;
    value: string | number;
    options: { value: string | number; label: string }[];
    onChange: (value: string) => void;
    disabled?: boolean;
}) => (
    <label className='vd-number'>
        <span className='vd-field__label'>{label}</span>
        <select className='vd-select' value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
            {options.map(o => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    </label>
);

const DIGITS = Array.from({ length: 10 }, (_, d) => ({ value: d, label: String(d) }));
const OPS = [
    { value: '>=', label: '≥' },
    { value: '<=', label: '≤' },
];

const RuleCard = ({ variant, title, defaults }: { variant: TVariant; title: string; defaults: Partial<TParams> }) => {
    const id = `automated-${variant}`;
    const { state } = useAutoTrader(id);
    const is_running = !['idle', 'stopped'].includes(state.status);
    const [p, setP] = usePersistentState<TParams>(`vd_${id}`, { ...BASE, ...defaults });
    const set = (patch: Partial<TParams>) => setP(previous => ({ ...previous, ...patch }));

    const condition = toCondition(variant, p);
    const history = condition.kind === 'percent' ? condition.window : Math.max(condition.count, 20);
    const ticks = useTicks(p.symbol, history);
    const evaluation = evaluateCondition(ticks, condition);

    const buildStrategy = () =>
        createRuleStrategy({
            name: title,
            markets: [p.symbol],
            condition: toCondition(variant, p),
            trade: toTrade(variant, p),
            pause_ticks: p.pause_ticks,
        });

    const d = is_running;
    let inputs: React.ReactNode = null;

    if (variant === 'eo_digits') {
        inputs = (
            <>
                <NumberField label={localize('Last digits')} value={p.count} min={1} max={10} decimals={0} disabled={d} onChange={count => set({ count })} />
                <Select label={localize('All are')} value={p.test} disabled={d} onChange={test => set({ test })} options={[{ value: 'even', label: localize('Even') }, { value: 'odd', label: localize('Odd') }]} />
                <Select label={localize('Then trade')} value={p.trade_type} disabled={d} onChange={trade_type => set({ trade_type })} options={[{ value: 'DIGITEVEN', label: localize('Even') }, { value: 'DIGITODD', label: localize('Odd') }]} />
            </>
        );
    } else if (variant === 'eo_percent') {
        inputs = (
            <>
                <Select label={localize('If')} value={p.test} disabled={d} onChange={test => set({ test })} options={[{ value: 'even', label: localize('Even %') }, { value: 'odd', label: localize('Odd %') }]} />
                <Select label={localize('Is')} value={p.op} disabled={d} onChange={op => set({ op: op as TParams['op'] })} options={OPS} />
                <NumberField label={localize('Percent')} unit='%' value={p.threshold} min={0} max={100} decimals={0} disabled={d} onChange={threshold => set({ threshold })} />
                <NumberField label={localize('Over ticks')} value={p.window} min={10} max={1000} decimals={0} disabled={d} onChange={window => set({ window })} />
                <Select label={localize('Then trade')} value={p.trade_type} disabled={d} onChange={trade_type => set({ trade_type })} options={[{ value: 'DIGITEVEN', label: localize('Even') }, { value: 'DIGITODD', label: localize('Odd') }]} />
            </>
        );
    } else if (variant === 'ou_digits') {
        inputs = (
            <>
                <NumberField label={localize('Last digits')} value={p.count} min={1} max={10} decimals={0} disabled={d} onChange={count => set({ count })} />
                <Select label={localize('All are')} value={p.test} disabled={d} onChange={test => set({ test })} options={[{ value: 'over', label: localize('Greater than') }, { value: 'under', label: localize('Less than') }]} />
                <Select label={localize('Digit')} value={p.value} disabled={d} onChange={value => set({ value: Number(value) })} options={DIGITS} />
                <Select label={localize('Then trade')} value={p.trade_type} disabled={d} onChange={trade_type => set({ trade_type, trade_digit: trade_type === 'DIGITOVER' ? Math.min(p.trade_digit, 8) : Math.max(p.trade_digit, 1) })} options={[{ value: 'DIGITOVER', label: localize('Over') }, { value: 'DIGITUNDER', label: localize('Under') }]} />
                <Select label={localize('Prediction')} value={p.trade_digit} disabled={d} onChange={v => set({ trade_digit: Number(v) })} options={DIGITS.filter(o => (p.trade_type === 'DIGITOVER' ? o.value <= 8 : o.value >= 1))} />
            </>
        );
    } else if (variant === 'ou_percent') {
        inputs = (
            <>
                <Select label={localize('If')} value={p.test} disabled={d} onChange={test => set({ test })} options={[{ value: 'over', label: localize('Over %') }, { value: 'under', label: localize('Under %') }]} />
                <Select label={localize('Barrier')} value={p.value} disabled={d} onChange={value => set({ value: Number(value) })} options={DIGITS.slice(0, 9).map(o => ({ value: o.value, label: `${localize('Over')} ${o.value} / ${localize('Under')} ${o.value + 1}` }))} />
                <Select label={localize('Is')} value={p.op} disabled={d} onChange={op => set({ op: op as TParams['op'] })} options={OPS} />
                <NumberField label={localize('Percent')} unit='%' value={p.threshold} min={0} max={100} decimals={0} disabled={d} onChange={threshold => set({ threshold })} />
                <NumberField label={localize('Over ticks')} value={p.window} min={10} max={1000} decimals={0} disabled={d} onChange={window => set({ window })} />
                <Select label={localize('Then trade')} value={p.trade_type} disabled={d} onChange={trade_type => set({ trade_type, trade_digit: trade_type === 'DIGITOVER' ? Math.min(p.trade_digit, 8) : Math.max(p.trade_digit, 1) })} options={[{ value: 'DIGITOVER', label: localize('Over') }, { value: 'DIGITUNDER', label: localize('Under') }]} />
                <Select label={localize('Prediction')} value={p.trade_digit} disabled={d} onChange={v => set({ trade_digit: Number(v) })} options={DIGITS.filter(o => (p.trade_type === 'DIGITOVER' ? o.value <= 8 : o.value >= 1))} />
            </>
        );
    } else if (variant === 'rf_percent') {
        inputs = (
            <>
                <Select label={localize('If')} value={p.test} disabled={d} onChange={test => set({ test })} options={[{ value: 'rise', label: localize('Rise %') }, { value: 'fall', label: localize('Fall %') }]} />
                <Select label={localize('Is')} value={p.op} disabled={d} onChange={op => set({ op: op as TParams['op'] })} options={OPS} />
                <NumberField label={localize('Percent')} unit='%' value={p.threshold} min={0} max={100} decimals={0} disabled={d} onChange={threshold => set({ threshold })} />
                <NumberField label={localize('Over ticks')} value={p.window} min={10} max={1000} decimals={0} disabled={d} onChange={window => set({ window })} />
                <Select label={localize('Then trade')} value={p.trade_type} disabled={d} onChange={trade_type => set({ trade_type })} options={[{ value: 'CALL', label: localize('Rise') }, { value: 'PUT', label: localize('Fall') }]} />
                <NumberField label={localize('Duration (ticks)')} value={p.duration} min={1} max={10} decimals={0} disabled={d} onChange={duration => set({ duration })} />
            </>
        );
    } else {
        inputs = (
            <>
                <Select label={localize('If digit')} value={p.value} disabled={d} onChange={value => set({ value: Number(value), trade_digit: Number(value) })} options={DIGITS} />
                <Select label={localize('Appears')} value={p.op} disabled={d} onChange={op => set({ op: op as TParams['op'] })} options={OPS} />
                <NumberField label={localize('Percent')} unit='%' value={p.threshold} min={0} max={100} decimals={0} disabled={d} onChange={threshold => set({ threshold })} />
                <NumberField label={localize('Over ticks')} value={p.window} min={10} max={1000} decimals={0} disabled={d} onChange={window => set({ window })} />
                <Select label={localize('Then trade')} value={p.trade_type} disabled={d} onChange={trade_type => set({ trade_type })} options={[{ value: 'DIGITDIFF', label: localize('Differs') }, { value: 'DIGITMATCH', label: localize('Matches') }]} />
            </>
        );
    }

    return (
        <article className={classNames('vd-card', { 'vd-card--active': is_running })}>
            <h3 className='vd-card__title'>
                {localize(title)}
                {is_running && <span className='vd-card__badge vd-card__badge--teal'>{localize('Running')}</span>}
            </h3>
            <AutoSession id={id} buildStrategy={buildStrategy} compact start_label={localize('Start auto trading')}>
                <div className='vd-row'>
                    <MarketSelect value={p.symbol} disabled={d} onChange={symbol => set({ symbol })} />
                    <NumberField
                        label={localize('Pause after trade (ticks)')}
                        value={p.pause_ticks}
                        min={0}
                        max={100}
                        decimals={0}
                        disabled={d}
                        onChange={pause_ticks => set({ pause_ticks })}
                    />
                </div>
                <div className='vd-row'>{inputs}</div>
                <div className={classNames('vd-rule-preview', { 'vd-rule-preview--met': evaluation.met })}>
                    <strong>{evaluation.met ? localize('Condition met now') : localize('Condition not met')}</strong>
                    <span>
                        {describeCondition(condition)} — {evaluation.detail}
                    </span>
                    {condition.kind === 'last_digits' && <LastDigits digits={ticks.slice(-10).map(t => t.digit)} barrier={p.value} />}
                </div>
            </AutoSession>
        </article>
    );
};

const Automated = () => (
    <div className='vd-page vd-page--dark'>
        <PageBackdrop />
        <ToolHero
            eyebrow={localize('Vindolar · Automation')}
            title={localize('Automated')}
            subtitle={localize('Rule cards: each trades automatically when its condition is met, within its own session limits.')}
        />
        <p className='vd-page__note'>
            {localize(
                'A rule only decides when to trade. It does not change the odds of the next digit: volatility indices are random. Several cards can run at the same time — each has its own stop loss.'
            )}
        </p>
        <div className='vd-page__grid vd-page__grid--wide'>
            {CARDS.map(card => (
                <RuleCard key={card.variant} {...card} />
            ))}
        </div>
    </div>
);

export default Automated;
