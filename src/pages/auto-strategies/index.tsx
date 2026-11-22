import classNames from 'classnames';
import AutoSession from '@/components/vindolar/auto-session';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import { useAutoTrader } from '@/hooks/useAutoTrader';
import { usePersistentState } from '@/hooks/usePersistentState';
import { createPriceStrategy, PRICE_STRATEGIES } from '@/services/vindolar/indicators';
import { DIGIT_STRATEGIES, TDigitDefinition } from '@/services/vindolar/stat-strategies';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';

type TTab = 'rise_fall' | 'digits';

const StrategyCard = ({
    id,
    name,
    description,
    tags,
    is_selected,
    onLoad,
}: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    is_selected: boolean;
    onLoad: () => void;
}) => {
    const { state } = useAutoTrader(`auto-${id}`);
    const is_running = !['idle', 'stopped'].includes(state.status);
    return (
        <article className={classNames('vd-card', { 'vd-card--active': is_selected })}>
            <h3 className='vd-card__title'>
                {localize(name)}
                {is_running && <span className='vd-card__badge vd-card__badge--teal'>{localize('Running')}</span>}
            </h3>
            <p className='vd-card__text'>{localize(description)}</p>
            <div className='vd-preset__chips'>
                {tags.map(tag => (
                    <span key={tag} className='vd-card__badge'>
                        {tag}
                    </span>
                ))}
            </div>
            <button type='button' className='vd-primary-button' onClick={onLoad}>
                {is_selected ? localize('Loaded below') : localize('Load strategy')}
            </button>
        </article>
    );
};

const Runner = ({ tab, strategy_id }: { tab: TTab; strategy_id: string }) => {
    const id = `auto-${strategy_id}`;
    const { state } = useAutoTrader(id);
    const is_running = !['idle', 'stopped'].includes(state.status);
    const [symbol, setSymbol] = usePersistentState(`vd_${id}_symbol`, '1HZ100V');
    const [duration, setDuration] = usePersistentState(`vd_${id}_duration`, 5);
    const [cooldown, setCooldown] = usePersistentState(`vd_${id}_cooldown`, 5);
    const [window, setWindow] = usePersistentState(`vd_${id}_window`, 100);

    const price = PRICE_STRATEGIES.find(s => s.id === strategy_id);
    const digit = DIGIT_STRATEGIES.find(s => s.id === strategy_id);
    const name = price?.name ?? digit?.name ?? '';

    const buildStrategy = () =>
        price
            ? createPriceStrategy({ definition: price, symbol, duration, cooldown_ticks: cooldown })
            : (digit as TDigitDefinition).build(symbol, window, cooldown);

    return (
        <section className='vd-card' id='vd-auto-runner'>
            <h3 className='vd-card__title'>{localize(name)}</h3>
            <AutoSession id={id} buildStrategy={buildStrategy} start_label={localize('Start {{name}}', { name: localize(name) })}>
                <div className='vd-row'>
                    <MarketSelect value={symbol} onChange={setSymbol} disabled={is_running} />
                    {tab === 'rise_fall' ? (
                        <NumberField label={localize('Duration (ticks)')} value={duration} min={1} max={10} decimals={0} disabled={is_running} onChange={setDuration} />
                    ) : (
                        <NumberField label={localize('Statistics window (ticks)')} value={window} min={20} max={1000} decimals={0} disabled={is_running} onChange={setWindow} />
                    )}
                    <NumberField label={localize('Wait between trades (ticks)')} value={cooldown} min={0} max={100} decimals={0} disabled={is_running} onChange={setCooldown} />
                </div>
            </AutoSession>
        </section>
    );
};

const AutoStrategies = () => {
    const [tab, setTab] = usePersistentState<TTab>('vd_auto_tab', 'rise_fall');
    const [selected, setSelected] = usePersistentState<string | null>('vd_auto_selected', null);
    const list = tab === 'rise_fall' ? PRICE_STRATEGIES : DIGIT_STRATEGIES;
    const selected_in_tab = list.find(s => s.id === selected) ? selected : null;

    const load = (id: string) => {
        setSelected(id);
        requestAnimationFrame(() => document.getElementById('vd-auto-runner')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Automation')}
                title={localize('Auto Trading')}
                subtitle={localize('Rule-based strategies you can run automatically. Each card says exactly what it does.')}
                right={
                    <>
                        <div className='vd-segmented' role='tablist'>
                            {(['rise_fall', 'digits'] as TTab[]).map(t => (
                                <button key={t} type='button' role='tab' aria-selected={tab === t} className={classNames({ 'is-active': tab === t })} onClick={() => setTab(t)}>
                                    {t === 'rise_fall' ? localize('Rise/Fall') : localize('Digit Trader')}
                                </button>
                            ))}
                        </div>
                    </>
                }
            />
            <p className='vd-page__note'>
                {localize(
                    'Indicators describe recent price movement. On volatility indices, past movement does not predict the next tick, so treat these as rules for when to trade — not as forecasts.'
                )}
            </p>
            <div className='vd-page__grid vd-preset-grid'>
                {list.map(s => (
                    <StrategyCard key={s.id} {...s} is_selected={s.id === selected_in_tab} onLoad={() => load(s.id)} />
                ))}
            </div>
            {selected_in_tab && (
                <div style={{ marginTop: '1.6rem' }}>
                    <Runner key={selected_in_tab} tab={tab} strategy_id={selected_in_tab} />
                </div>
            )}
        </div>
    );
};

export default AutoStrategies;
