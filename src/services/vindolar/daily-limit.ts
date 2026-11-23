/**
 * Daily loss limit across all of Vindolar's trading tools (automated sessions and manual buys).
 * Today's realised result is kept in this browser and resets at local midnight.
 * A trade is refused if losing its stake could take today's loss past the limit.
 */
const LIMIT_KEY = 'vd_daily_loss_limit';
const RESULT_KEY = 'vd_daily_result';

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const read = <T>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
};

const write = (key: string, value: unknown) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage unavailable: the limit can't persist, but trading code still checks the in-memory value.
    }
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

export const subscribeDailyLimit = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/** 0 = no daily limit. */
export const getDailyLossLimit = () => Number(read(LIMIT_KEY, 0)) || 0;

export const setDailyLossLimit = (limit: number) => {
    write(LIMIT_KEY, Math.max(0, Math.round(limit * 100) / 100));
    notify();
};

/** Today's realised profit/loss from Vindolar trades (negative = loss). */
export const getTodayResult = () => {
    const saved = read<{ date: string; profit: number }>(RESULT_KEY, { date: today(), profit: 0 });
    return saved.date === today() ? saved.profit : 0;
};

export const recordTradeResult = (profit: number) => {
    const next = Math.round((getTodayResult() + profit) * 100) / 100;
    write(RESULT_KEY, { date: today(), profit: next });
    notify();
};

/** True if risking `stake` more could take today's loss past the daily limit. */
export const wouldBreachDailyLimit = (stake: number) => {
    const limit = getDailyLossLimit();
    if (!limit) return false;
    const loss_so_far = Math.max(0, -getTodayResult());
    return Math.round((loss_so_far + stake) * 100) / 100 > limit;
};

export const DAILY_LIMIT_MESSAGE =
    'Daily loss limit reached — no more trades today. You can change the limit in Reports.';
