import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { TMarketSymbol } from '@/services/vindolar/market-data';
import './vindolar.scss';

type TVariant = 'default' | 'strip';

/** "Volatility 10 (1s) Index" → "VOL 10 (1s)" for the compact strip. */
const shortName = (name: string) => name.replace(/ Index$/, '').replace(/^Volatility /, 'VOL ');

const TickerItem = ({ market, variant }: { market: TMarketSymbol; variant: TVariant }) => {
    const ticks = useTicks(market.symbol, 2);
    const last = ticks[ticks.length - 1];
    const prev = ticks[ticks.length - 2];
    const up = !last || !prev || last.quote >= prev.quote;
    const name = variant === 'strip' ? shortName(market.name) : market.name.replace(/ Index$/, '');

    return (
        <span className={`vd-ticker__item ${up ? 'is-up' : 'is-down'}`}>
            <span className='vd-ticker__name'>{name}</span>
            <span className='vd-ticker__price'>
                {last ? last.quote.toFixed(market.pip_size) : '—'}
                {variant === 'strip' && last && prev && <span aria-hidden='true'>{up ? ' ▲' : ' ▼'}</span>}
            </span>
        </span>
    );
};

/** Slim scrolling price strip (landing page, and under the workspace tab strip). */
const MarketTicker = ({ variant = 'default' }: { variant?: TVariant }) => {
    const { symbols } = useVolatilitySymbols();
    const shown = symbols.slice(0, 14);
    if (shown.length === 0) return null;

    return (
        <div className={`vd-ticker${variant === 'strip' ? ' vd-ticker--strip' : ''}`} role='region' aria-label='Live market prices'>
            <div className='vd-ticker__track'>
                <div className='vd-ticker__set'>
                    {shown.map(market => (
                        <TickerItem key={market.symbol} market={market} variant={variant} />
                    ))}
                </div>
                <div className='vd-ticker__set' aria-hidden='true'>
                    {shown.map(market => (
                        <TickerItem key={`${market.symbol}-copy`} market={market} variant={variant} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MarketTicker;
