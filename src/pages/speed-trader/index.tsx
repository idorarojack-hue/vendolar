import React from 'react';
import AutoSession from '@/components/vindolar/auto-session';
import NumberField from '@/components/vindolar/number-field';
import { ContractPicker, MarketSelect, TContractChoice } from '@/components/vindolar/pickers';
import { useAutoTrader } from '@/hooks/useAutoTrader';
import { useTicks } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { TStrategy } from '@/services/vindolar/auto-trader';
import { computeDigitStats } from '@/services/vindolar/digit-stats';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import { DigitRings, LastDigits } from '../analysis-tools/components';

const ID = 'speed-trader';

const SpeedTrader = () => {
    const { state } = useAutoTrader(ID);
    const is_running = !['idle', 'stopped'].includes(state.status);
    const [symbol, setSymbol] = usePersistentState('vd_speed_symbol', '1HZ100V');
    const [contract, setContract] = usePersistentState<TContractChoice>('vd_speed_contract', { contract_type: 'DIGITEVEN' });
    const [duration, setDuration] = usePersistentState('vd_speed_duration', 1);
    const [every, setEvery] = usePersistentState('vd_speed_every', 1);

    const ticks = useTicks(symbol, 100);
    const stats = React.useMemo(() => computeDigitStats(ticks), [ticks]);

    const buildStrategy = (): TStrategy => {
        let ticks_waited = 0;
        return {
            name: 'Speed Trader',
            markets: [symbol],
            history: 10,
            decide: () => {
                ticks_waited += 1;
                if (ticks_waited < every) return null;
                ticks_waited = 0;
                return {
                    symbol,
                    contract_type: contract.contract_type,
                    digit: contract.digit,
                    duration,
                    reason: every === 1 ? 'Every tick' : `Every ${every} ticks`,
                };
            },
        };
    };

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Automation')}
                title={localize('Speedbot')}
                subtitle={localize('Places one contract after another on a fixed rhythm, within your session limits.')}
            />
            <p className='vd-page__note'>
                {localize(
                    'Fast trading multiplies the number of trades, not the odds. Each contract is independent; set a stop loss you are comfortable losing.'
                )}
            </p>

            <div className='vd-page__columns'>
                <div className='vd-card'>
                    <AutoSession id={ID} buildStrategy={buildStrategy} start_label={localize('Start speed trading')}>
                        <div className='vd-row'>
                            <MarketSelect value={symbol} onChange={setSymbol} disabled={is_running} />
                            <NumberField
                                label={localize('Duration (ticks)')}
                                value={duration}
                                min={1}
                                max={10}
                                decimals={0}
                                disabled={is_running}
                                onChange={setDuration}
                            />
                            <NumberField
                                label={localize('Trade every (ticks)')}
                                value={every}
                                min={1}
                                max={20}
                                decimals={0}
                                disabled={is_running}
                                onChange={setEvery}
                            />
                        </div>
                        <ContractPicker value={contract} onChange={setContract} disabled={is_running} />
                    </AutoSession>
                </div>

                <aside className='vd-card'>
                    <h3 className='vd-card__title'>{localize('Live digits')}</h3>
                    <DigitRings stats={stats} current_digit={ticks[ticks.length - 1]?.digit} size={44} />
                    <LastDigits digits={ticks.slice(-20).map(t => t.digit)} barrier={contract.digit ?? 4} />
                    <p className='vd-card__text'>{localize('Last 100 ticks. Statistics describe the past only.')}</p>
                </aside>
            </div>
        </div>
    );
};

export default SpeedTrader;
