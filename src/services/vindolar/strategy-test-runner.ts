/**
 * Runs a Strategy Tester backtest end to end: loads past ticks, fetches this account's payouts for every
 * contract the strategy trades, and replays it. Shared by the Strategy Tester page and the floating Scanner.
 */
import type { TSessionSettings } from './auto-trader';
import { payoutKey, runBacktest, TBacktestResult, TPayoutKey } from './backtest';
import { TTick } from './digit-stats';
import { marketData } from './market-data';
import { getCatalogEntry } from './strategy-catalog';
import { getPayoutRatio } from './trading';

const tick_cache = new Map<string, { ticks: TTick[]; time: number }>();
const CACHE_MS = 5 * 60 * 1000;

export type TStrategyTestOptions = {
    strategy_id: string;
    symbol: string;
    tick_count: number;
    duration: number;
    settings: Omit<TSessionSettings, 'currency'>;
    currency: string;
    repeat_sessions?: boolean;
    onProgress?: (message: string) => void;
};

export type TStrategyTestResult = TBacktestResult & { name: string; symbol: string };

export const runStrategyTest = async ({
    strategy_id,
    symbol,
    tick_count,
    duration,
    settings,
    currency,
    repeat_sessions = true,
    onProgress,
}: TStrategyTestOptions): Promise<TStrategyTestResult> => {
    const entry = getCatalogEntry(strategy_id);
    const cache_key = `${symbol}|${tick_count}`;
    const cached = tick_cache.get(cache_key);
    let ticks = cached && Date.now() - cached.time < CACHE_MS ? cached.ticks : undefined;
    if (!ticks) {
        onProgress?.(`Loading past ticks… 0 / ${tick_count}`);
        ticks = await marketData.fetchTickHistory(symbol, tick_count, loaded => onProgress?.(`Loading past ticks… ${loaded} / ${tick_count}`));
        tick_cache.set(cache_key, { ticks, time: Date.now() });
    }

    const payouts = new Map<TPayoutKey, number>();
    const options = {
        ticks,
        symbol,
        createStrategy: () => entry.create({ symbol, duration }),
        settings,
        payouts,
        warmup: 60,
        repeat_sessions,
    };

    // Run, fetch payouts for any contracts traded, run again (a strategy may switch contracts after a loss).
    let outcome = runBacktest(options);
    for (let pass = 0; outcome.missing.length && pass < 4; pass++) {
        onProgress?.('Getting your payouts from Deriv…');
        // eslint-disable-next-line no-await-in-loop
        const ratios = await Promise.all(
            outcome.missing.map(d =>
                getPayoutRatio({ contract_type: d.contract_type, symbol, amount: settings.stake, currency, duration: d.duration, digit: d.digit })
            )
        );
        outcome.missing.forEach((d, i) => payouts.set(payoutKey(d), ratios[i]));
        onProgress?.(`Replaying ${ticks.length} ticks…`);
        outcome = runBacktest(options);
    }
    return { ...outcome, name: entry.name, symbol };
};
