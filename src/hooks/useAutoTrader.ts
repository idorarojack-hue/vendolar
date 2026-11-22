import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { getAutoTrader, getRunningSessions, subscribeToSessions, TSessionSettings } from '@/services/vindolar/auto-trader';

/** Live state of one tool's auto-trade session (keeps running across tab switches). */
export const useAutoTrader = (id: string) => {
    const trader = getAutoTrader(id);
    const state = useSyncExternalStore(trader.subscribe, trader.getState);
    return { trader, state };
};

/** Number of sessions running anywhere in the app. */
export const useRunningSessionCount = () => {
    const get = useCallback(() => getRunningSessions().length, []);
    return useSyncExternalStore(subscribeToSessions, get);
};

/** Running sessions with their live state (re-renders when any of them changes). */
export const useRunningSessions = () => {
    const get = useCallback(
        () =>
            getRunningSessions()
                .map(id => {
                    const s = getAutoTrader(id).getState();
                    return `${id}|${s.status}|${s.profit}|${s.wins + s.losses}`;
                })
                .join(';'),
        []
    );
    const snapshot = useSyncExternalStore(subscribeToSessions, get);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => getRunningSessions().map(id => ({ id, state: getAutoTrader(id).getState() })), [snapshot]);
};

export type TSessionFormValues = Omit<TSessionSettings, 'currency' | 'allow_real_money'>;

export const DEFAULT_SESSION: TSessionFormValues = {
    stake: 1,
    take_profit: 5,
    stop_loss: 10,
    martingale: false,
    multiplier: 2,
    max_stake: 8,
    max_trades: 0,
};

/** Session settings for a tool, remembered in this browser. */
export const useSessionSettings = (id: string, defaults: Partial<TSessionFormValues> = {}) => {
    const key = `vd_session_${id}`;
    const [values, setValues] = useState<TSessionFormValues>(() => {
        try {
            return { ...DEFAULT_SESSION, ...defaults, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
        } catch {
            return { ...DEFAULT_SESSION, ...defaults };
        }
    });

    const update = useCallback(
        (patch: Partial<TSessionFormValues>) =>
            setValues(previous => {
                const next = { ...previous, ...patch };
                try {
                    localStorage.setItem(key, JSON.stringify(next));
                } catch {
                    // Not remembering settings is fine.
                }
                return next;
            }),
        [key]
    );

    return [values, update] as const;
};
