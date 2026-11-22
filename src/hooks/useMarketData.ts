import { useEffect, useState } from 'react';
import { TTick } from '@/services/vindolar/digit-stats';
import { marketData, TMarketSymbol } from '@/services/vindolar/market-data';

/** Live ticks for one market: the latest `count` ticks, oldest first. */
export const useTicks = (symbol: string | undefined, count: number) => {
    const [ticks, setTicks] = useState<TTick[]>([]);

    useEffect(() => {
        if (!symbol) return undefined;
        setTicks([]);
        return marketData.subscribeTicks(symbol, all => setTicks(all.length > count ? all.slice(-count) : all), {
            history: count,
        });
    }, [symbol, count]);

    return ticks;
};

/** Open volatility indices (loaded once and cached). */
export const useVolatilitySymbols = () => {
    const [symbols, setSymbols] = useState<TMarketSymbol[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let is_mounted = true;
        marketData
            .getVolatilitySymbols()
            .then(list => is_mounted && setSymbols(list))
            .catch(e => is_mounted && setError(e?.message ?? 'Could not load markets'));
        return () => {
            is_mounted = false;
        };
    }, []);

    return { symbols, error };
};

/** Whether the market data connection is open. */
export const useMarketDataStatus = () => {
    const [is_connected, setIsConnected] = useState(marketData.isConnected);
    useEffect(() => {
        const unsubscribe = marketData.onStatusChange(setIsConnected);
        return () => {
            unsubscribe();
        };
    }, []);
    return is_connected;
};
