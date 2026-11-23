/**
 * Strategy Tester: replays a strategy on real past ticks with the same session rules as the live
 * engine (martingale, max stake, take profit, stop loss) and real payouts.
 *
 * Contract model (tick contracts, one at a time):
 *  - decision on tick i → entry spot is tick i+1 → exit tick is i+1+duration
 *  - digits: win/lose by the last digit of the exit tick; Rise/Fall: exit vs entry price (equal = loss)
 *  - payout is stake × payout ratio for that contract (fetched from Deriv before the run)
 */
import { nextStake, TSessionSettings, TSessionState, TStrategy, TTradeDecision } from './auto-trader';
import { TTick } from './digit-stats';

export type TPayoutKey = string;
export const payoutKey = (d: Pick<TTradeDecision, 'contract_type' | 'digit' | 'duration'>) =>
    `${d.contract_type}|${d.digit ?? ''}|${d.duration ?? 1}`;

export const wins = (contract_type: string, digit: number | undefined, entry: TTick, exit: TTick) => {
    const last = exit.digit;
    switch (contract_type) {
        case 'DIGITEVEN':
            return last % 2 === 0;
        case 'DIGITODD':
            return last % 2 === 1;
        case 'DIGITOVER':
            return last > (digit ?? 0);
        case 'DIGITUNDER':
            return last < (digit ?? 9);
        case 'DIGITMATCH':
            return last === digit;
        case 'DIGITDIFF':
            return last !== digit;
        case 'CALL':
            return exit.quote > entry.quote;
        case 'PUT':
            return exit.quote < entry.quote;
        default:
            return false;
    }
};

export type TBacktestTrade = {
    index: number;
    contract_type: string;
    digit?: number;
    stake: number;
    payout_ratio: number;
    won: boolean;
    profit: number;
    balance: number;
};

export type TSessionSummary = { trades: number; profit: number; ended: string };

export type TBacktestResult = {
    ticks_used: number;
    trades: TBacktestTrade[];
    wins: number;
    losses: number;
    win_rate: number;
    /** Win rate needed to break even at the payouts traded (stake-weighted). */
    breakeven_win_rate: number;
    total_staked: number;
    net_profit: number;
    /** Net profit as a percentage of everything staked (the "edge"). */
    return_on_staked: number;
    max_drawdown: number;
    longest_losing_streak: number;
    highest_stake: number;
    /** Sessions run back-to-back through the data, each stopped by TP / SL / max stake. */
    sessions: TSessionSummary[];
    /** Balance after each trade (for the equity curve). */
    equity: number[];
    /** Contracts the strategy traded that had no payout in `payouts` (fetch them and run again). */
    missing: TTradeDecision[];
};

type TOptions = {
    ticks: TTick[];
    symbol: string;
    /** Fresh strategy instance (strategies keep internal state). */
    createStrategy: () => TStrategy;
    settings: Omit<TSessionSettings, 'currency'>;
    /** Payout ratio (payout / stake) per contract key. */
    payouts: Map<TPayoutKey, number>;
    /** Ticks needed before the strategy can decide. */
    warmup?: number;
    /** Restart a new session after TP/SL (true) or stop at the first one (false). */
    repeat_sessions?: boolean;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Contract keys a run will need payouts for: run the strategy without settling to collect decisions. */
export const collectContractKeys = (ticks: TTick[], createStrategy: () => TStrategy, warmup = 30) => {
    const strategy = createStrategy();
    const keys = new Map<TPayoutKey, TTradeDecision>();
    const session = { status: 'waiting', profit: 0, trades: [] } as unknown as TSessionState;
    for (let i = warmup; i < ticks.length - 2; i++) {
        const window = ticks.slice(Math.max(0, i + 1 - strategy.history), i + 1);
        const d = strategy.decide({ symbol: '', ticks: window, markets: new Map(), session });
        if (d) keys.set(payoutKey(d), d);
        if (keys.size > 40) break;
    }
    return [...keys.values()];
};

export const runBacktest = ({
    ticks,
    symbol,
    createStrategy,
    settings,
    payouts,
    warmup = 30,
    repeat_sessions = true,
}: TOptions): TBacktestResult => {
    const trades: TBacktestTrade[] = [];
    const sessions: TSessionSummary[] = [];
    const equity: number[] = [0];
    const missing = new Map<TPayoutKey, TTradeDecision>();
    let balance = 0;
    let peak = 0;
    let max_drawdown = 0;
    let losing_streak = 0;
    let longest_losing_streak = 0;
    let highest_stake = 0;
    let breakeven_weighted = 0;

    let strategy = createStrategy();
    let session_profit = 0;
    let session_trades = 0;
    let stake = settings.stake;
    let session_state = {
        status: 'waiting',
        trades: [],
        wins: 0,
        losses: 0,
        profit: 0,
        consecutive_losses: 0,
        current_stake: stake,
    } as unknown as TSessionState;

    const endSession = (ended: string) => {
        sessions.push({ trades: session_trades, profit: round2(session_profit), ended });
        session_profit = 0;
        session_trades = 0;
        stake = settings.stake;
        strategy = createStrategy();
        session_state = {
            ...session_state,
            profit: 0,
            consecutive_losses: 0,
            current_stake: stake,
            last_result: undefined,
        };
    };

    let i = Math.max(warmup, 0);
    let stopped = false;
    while (i < ticks.length - 1 && !stopped) {
        const window = ticks.slice(Math.max(0, i + 1 - strategy.history), i + 1);
        const decision = strategy.decide({
            symbol,
            ticks: window,
            markets: new Map([[symbol, window]]),
            session: session_state,
        });
        if (!decision) {
            i += 1;
            continue;
        }

        const duration = Math.max(1, decision.duration ?? 1);
        const entry_index = i + 1;
        const exit_index = entry_index + duration;
        if (exit_index >= ticks.length) break;

        // Same guards as the live engine.
        if (stake > settings.max_stake) {
            endSession('Max stake');
            if (!repeat_sessions) stopped = true;
            i += 1;
            continue;
        }
        if (round2(Math.max(0, -session_profit) + stake) > settings.stop_loss) {
            endSession('Stop loss');
            if (!repeat_sessions) stopped = true;
            i += 1;
            continue;
        }

        const key = payoutKey({ ...decision, duration });
        const known_ratio = payouts.get(key);
        if (known_ratio === undefined) missing.set(key, { ...decision, duration });
        const ratio = known_ratio ?? 0;
        const won = ratio > 0 && wins(decision.contract_type, decision.digit, ticks[entry_index], ticks[exit_index]);
        const profit = round2(won ? stake * ratio - stake : -stake);

        balance = round2(balance + profit);
        session_profit = round2(session_profit + profit);
        session_trades += 1;
        highest_stake = Math.max(highest_stake, stake);
        if (ratio > 0) breakeven_weighted += stake / ratio;
        peak = Math.max(peak, balance);
        max_drawdown = Math.max(max_drawdown, peak - balance);
        losing_streak = won ? 0 : losing_streak + 1;
        longest_losing_streak = Math.max(longest_losing_streak, losing_streak);
        trades.push({
            index: entry_index,
            contract_type: decision.contract_type,
            digit: decision.digit,
            stake,
            payout_ratio: ratio,
            won,
            profit,
            balance,
        });
        equity.push(balance);

        const result = won ? 'won' : 'lost';
        session_state = {
            ...session_state,
            profit: session_profit,
            last_result: result,
            consecutive_losses: won ? 0 : session_state.consecutive_losses + 1,
        };
        strategy.onResult?.(
            { id: trades.length, time: 0, symbol, contract_type: decision.contract_type, stake, profit, result },
            session_state
        );
        stake = nextStake({ ...settings, currency: '' }, stake, result);
        session_state = { ...session_state, current_stake: stake };

        if (session_profit >= settings.take_profit) {
            endSession('Take profit');
            if (!repeat_sessions) stopped = true;
        } else if (-session_profit >= settings.stop_loss) {
            endSession('Stop loss');
            if (!repeat_sessions) stopped = true;
        } else if (settings.max_trades && session_trades >= settings.max_trades) {
            endSession('Trade limit');
            if (!repeat_sessions) stopped = true;
        }
        // Like the live engine: the result arrives with the exit tick, the next decision is on the tick after.
        i = exit_index + 1;
    }
    if (session_trades > 0)
        sessions.push({ trades: session_trades, profit: round2(session_profit), ended: 'End of data' });

    const total_staked = round2(trades.reduce((s, t) => s + t.stake, 0));
    const win_count = trades.filter(t => t.won).length;
    return {
        ticks_used: ticks.length,
        trades,
        wins: win_count,
        losses: trades.length - win_count,
        win_rate: trades.length ? (win_count / trades.length) * 100 : 0,
        breakeven_win_rate: total_staked ? (breakeven_weighted / total_staked) * 100 : 0,
        total_staked,
        net_profit: balance,
        return_on_staked: total_staked ? (balance / total_staked) * 100 : 0,
        max_drawdown: round2(max_drawdown),
        longest_losing_streak,
        highest_stake,
        sessions,
        equity,
        missing: [...missing.values()],
    };
};

/** z-score of the win count against the break-even win rate (|z| < 2: no evidence of an edge either way). */
export const edgeZScore = (result: Pick<TBacktestResult, 'wins' | 'trades' | 'breakeven_win_rate'>) => {
    const n = result.trades.length;
    const p = result.breakeven_win_rate / 100;
    if (!n || p <= 0 || p >= 1) return 0;
    return (result.wins - n * p) / Math.sqrt(n * p * (1 - p));
};
