import React from 'react';
import { useTicks } from '@/hooks/useMarketData';
import { computeDigitStats } from '@/services/vindolar/digit-stats';
import { TMarketSymbol } from '@/services/vindolar/market-data';
import { localize } from '@deriv-com/translations';
import { DigitRings, LastDigits, SplitBar } from './components';

type TMarketCardProps = {
    market: TMarketSymbol;
    tick_count: number;
    barrier: number;
    onOpen: (symbol: string) => void;
};

const LAST_DIGITS_SHOWN = 10;

const MarketCard = ({ market, tick_count, barrier, onOpen }: TMarketCardProps) => {
    const ticks = useTicks(market.symbol, tick_count);
    const stats = React.useMemo(() => computeDigitStats(ticks, barrier), [ticks, barrier]);
    const latest = ticks[ticks.length - 1];
    const is_loading = ticks.length === 0;

    return (
        <article className='vd-market-card' aria-busy={is_loading}>
            <header className='vd-market-card__header'>
                <div>
                    <h3 className='vd-market-card__name'>{market.name}</h3>
                    <span className='vd-market-card__price'>
                        {latest ? latest.quote.toFixed(market.pip_size) : localize('Loading…')}
                    </span>
                </div>
                <button type='button' className='vd-market-card__open' onClick={() => onOpen(market.symbol)}>
                    {localize('Details')}
                </button>
            </header>

            <DigitRings stats={stats} current_digit={latest?.digit} size={40} />

            <LastDigits digits={ticks.slice(-LAST_DIGITS_SHOWN).map(t => t.digit)} barrier={barrier} />

            <div className='vd-market-card__bars'>
                <SplitBar left_label={localize('Even')} right_label={localize('Odd')} left={stats.even} right={stats.odd} />
                <SplitBar left_label={localize('Rise')} right_label={localize('Fall')} left={stats.rise} right={stats.fall} />
                <SplitBar
                    left_label={`${localize('Over')} ${barrier}`}
                    right_label={`${localize('Under')} ${barrier + 1}`}
                    left={stats.over}
                    right={stats.under}
                />
            </div>

            <footer className='vd-market-card__footer'>
                {localize('Based on the last {{count}} ticks', { count: stats.sample })}
            </footer>
        </article>
    );
};

export default React.memo(MarketCard);
