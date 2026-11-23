/**
 * What Deriv offers on a market (`contracts_for`): contract types, duration limits, default barriers,
 * barrier choices (turbos / vanillas), multiplier and deal-cancellation choices, growth rates.
 * Read on the public connection and cached per market for a few minutes.
 */
import { useEffect, useState } from 'react';
import { marketData } from './market-data';

export type TDurationUnit = 't' | 's' | 'm' | 'h' | 'd';
export type TDuration = { value: number; unit: TDurationUnit };

export type TOffering = {
    contract_type: string;
    category: string;
    /** tick | intraday | daily | no_expiry */
    expiry_type: string;
    min?: TDuration;
    max?: TDuration;
    barrier?: string;
    high_barrier?: string;
    low_barrier?: string;
    barrier_choices?: string[];
    multiplier_range?: number[];
    cancellation_range?: string[];
    growth_rate_range?: number[];
    min_stake?: number;
    max_stake?: number;
};

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<TOffering[]> }>();

export const parseDuration = (text?: string): TDuration | undefined => {
    const match = /^(\d+)([tsmhd])$/.exec(text ?? '');
    return match ? { value: Number(match[1]), unit: match[2] as TDurationUnit } : undefined;
};

/** Deriv's `contracts_for` for a market, cached. Resolves to [] if it cannot be read. */
export const getOfferings = (symbol: string): Promise<TOffering[]> => {
    const hit = cache.get(symbol);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    const promise = marketData
        .send({ contracts_for: symbol })
        .then((response: any) =>
            (response?.contracts_for?.available ?? []).map(
                (c: any): TOffering => ({
                    contract_type: c.contract_type,
                    category: c.contract_category,
                    expiry_type: c.expiry_type,
                    min: parseDuration(c.min_contract_duration),
                    max: parseDuration(c.max_contract_duration),
                    barrier: c.barrier,
                    high_barrier: c.high_barrier,
                    low_barrier: c.low_barrier,
                    barrier_choices: c.barrier_choices,
                    multiplier_range: c.multiplier_range,
                    cancellation_range: c.cancellation_range,
                    growth_rate_range: c.growth_rate_range,
                    min_stake: c.min_stake === undefined ? undefined : Number(c.min_stake),
                    max_stake: c.max_stake === undefined ? undefined : Number(c.max_stake),
                })
            )
        )
        .catch(() => {
            cache.delete(symbol);
            return [] as TOffering[];
        });
    cache.set(symbol, { at: Date.now(), promise });
    return promise;
};

/**
 * The offering for a contract type with the shortest expiry that fits: tick contracts first, then
 * intraday, then no-expiry (multipliers / accumulators). Daily (1 day+) contracts are not used.
 */
export const pickOffering = (offerings: TOffering[], contract_type: string): TOffering | undefined => {
    const order = ['tick', 'intraday', 'no_expiry'];
    return offerings
        .filter(o => o.contract_type === contract_type && order.includes(o.expiry_type))
        .sort((a, b) => order.indexOf(a.expiry_type) - order.indexOf(b.expiry_type))[0];
};

/** `contracts_for` for a market, loaded once per market (null while loading). */
export const useOfferings = (symbol?: string) => {
    const [offerings, setOfferings] = useState<TOffering[] | null>(null);
    useEffect(() => {
        if (!symbol) return undefined;
        let is_active = true;
        setOfferings(null);
        getOfferings(symbol).then(list => is_active && setOfferings(list));
        return () => {
            is_active = false;
        };
    }, [symbol]);
    return offerings;
};
