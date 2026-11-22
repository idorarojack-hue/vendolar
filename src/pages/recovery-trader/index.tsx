import classNames from 'classnames';
import AutoSession from '@/components/vindolar/auto-session';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import { useAutoTrader } from '@/hooks/useAutoTrader';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { TMarketSymbol } from '@/services/vindolar/market-data';
import { getCurrentStreak } from '@/services/vindolar/digit-stats';
import { createDigitStrategy, parityRule, rangeBounceRule } from '@/services/vindolar/digit-strategies';
import { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import './recovery-trader.scss';

const ID = 'recovery-trader';

type TMode = 'over_under' | 'even_odd';

/** One market row: current run toward the trigger. */
const MarketRun = ({ market, mode, needed }: { market: TMarketSymbol; mode: TMode; needed: number }) => {
    const ticks = useTicks(market.symbol, 30);
    const digits = ticks.map(t => t.digit);
    const streak =
        mode === 'over_under' ? getCurrentStreak(digits, d => d <= 4) : getCurrentStreak(digits, d => d % 2 === 0);
    const label =
        mode === 'over_under'
            ? streak.value
                ? localize('{{n}} digits ≤ 4', { n: streak.length })
                : localize('{{n}} digits ≥ 5', { n: streak.length })
            : streak.value
              ? localize('{{n}} even', { n: streak.length })
              : localize('{{n}} odd', { n: streak.length });
    const progress = Math.min(streak.length / needed, 1);
    return (
        <li className={classNames('vd-runs__row', { 'vd-runs__row--ready': streak.length >= needed })}>
            <span className='vd-runs__name'>{market.name}</span>
            <span className='vd-runs__bar' aria-hidden='true'>
                <span style={{ width: `${progress * 100}%` }} />
            </span>
            <span className='vd-runs__label'>{ticks.length ? label : '…'}</span>
        </li>
    );
};

const RecoveryTrader = () => {
    const { symbols } = useVolatilitySymbols();
    const { state } = useAutoTrader(ID);
    const is_running = !['idle', 'stopped'].includes(state.status);
    const [mode, setMode] = usePersistentState<TMode>('vd_recovery_mode', 'over_under');
    const [confirmation, setConfirmation] = usePersistentState('vd_recovery_confirmation', 3);
    const [recovery_confirmation, setRecoveryConfirmation] = usePersistentState('vd_recovery_after_loss', 6);
    const [market, setMarket] = usePersistentState('vd_recovery_market', 'ALL');

    const markets = market === 'ALL' ? symbols.map(s => s.symbol) : [market];
    const needed = state.last_result === 'lost' && is_running ? recovery_confirmation : confirmation;

    const buildStrategy = () => {
        const make = (count: number) => (mode === 'over_under' ? rangeBounceRule(count, 4, 5) : parityRule(count, 'swap'));
        return createDigitStrategy({
            name: 'TickPulse',
            markets,
            rule: make(confirmation),
            recovery_rule: make(recovery_confirmation),
            history: Math.max(recovery_confirmation, 20),
        });
    };

    return (
        <div className='vd-page vd-page--dark vd-recovery-page'>
            <PageBackdrop />
            <div className='vd-page__columns vd-recovery'>
                <section className='vd-recovery__hero'>
                    <p className='vd-recovery__eyebrow'>{localize('Vindolar · Automated')}</p>
                    <h2>{localize('TickPulse')}</h2>
                    <p>
                        {mode === 'over_under'
                            ? localize(
                                  'Scans the volatility markets. When a market shows {{n}} digits in a row at 0-4 it trades Over 4; at 5-9 it trades Under 5.',
                                  { n: confirmation }
                              )
                            : localize(
                                  'Scans the volatility markets. When a market shows {{n}} even digits in a row it trades Odd; {{n}} odd digits, it trades Even.',
                                  { n: confirmation }
                              )}{' '}
                        {localize('After a loss it waits for {{r}} matching digits before the next trade.', { r: recovery_confirmation })}
                    </p>
                    <p className='vd-recovery__honest'>
                        {localize(
                            'Each digit is random, so waiting for a run does not improve the odds. With martingale on, losses grow quickly — the max stake and stop loss below are your protection.'
                        )}
                    </p>

                    <h3>
                        {localize('Live scan')} <small>{localize('needs {{n}} in a row', { n: needed })}</small>
                    </h3>
                    <ul className='vd-runs'>
                        {symbols
                            .filter(s => market === 'ALL' || s.symbol === market)
                            .map(s => (
                                <MarketRun key={s.symbol} market={s} mode={mode} needed={needed} />
                            ))}
                    </ul>
                </section>

                <div className='vd-card'>
                    <AutoSession
                        id={ID}
                        buildStrategy={buildStrategy}
                        defaults={{ martingale: true, multiplier: 2, stake: 0.5, take_profit: 5, stop_loss: 10, max_stake: 4 }}
                        compact
                        start_label={localize('Start TickPulse')}
                    >
                        <div className='vd-number'>
                            <span className='vd-field__label'>{localize('Recovery type')}</span>
                            <div className='vd-chip-select' role='radiogroup'>
                                {(['over_under', 'even_odd'] as TMode[]).map(m => (
                                    <button
                                        key={m}
                                        type='button'
                                        role='radio'
                                        aria-checked={mode === m}
                                        disabled={is_running}
                                        className={classNames({ 'is-active': mode === m })}
                                        onClick={() => setMode(m)}
                                    >
                                        {m === 'over_under' ? localize('Over 4 / Under 5') : localize('Even / Odd')}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className='vd-row'>
                            <MarketSelect value={market} onChange={setMarket} include_all disabled={is_running} />
                            <NumberField
                                label={localize('Digits in a row to enter')}
                                value={confirmation}
                                min={1}
                                max={10}
                                decimals={0}
                                disabled={is_running}
                                onChange={setConfirmation}
                            />
                            <NumberField
                                label={localize('After a loss, wait for')}
                                value={recovery_confirmation}
                                min={1}
                                max={12}
                                decimals={0}
                                disabled={is_running}
                                onChange={setRecoveryConfirmation}
                            />
                        </div>
                    </AutoSession>
                </div>
            </div>
        </div>
    );
};

export default RecoveryTrader;
