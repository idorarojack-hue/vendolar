/**
 * Vindolar auto-trade engine.
 *
 * One engine runs one session: it watches markets, asks a strategy whether to trade on each tick,
 * places one contract at a time, and applies the session rules:
 *
 *  - Take profit and stop loss are required. The session stops when either is reached.
 *  - Stop loss is a hard cap: a trade is never placed if losing it could take the session past the stop loss.
 *  - Martingale (optional) multiplies the stake after a loss and resets after a win, but never above max stake.
 *  - Real-money accounts need `allow_real_money: true` (the UI asks the user to confirm).
 *
 * Engines live outside React (see `getAutoTrader`) so a session keeps running when the user switches tabs.
 */
import { getAccountId, isDemoAccount } from '@/utils/account-helpers';
import { TContractParams } from './contracts';
import { DAILY_LIMIT_MESSAGE, wouldBreachDailyLimit } from './daily-limit';
import { TTick } from './digit-stats';
import { marketData } from './market-data';
import { buyContract, isLoggedInForTrading, TOpenContract, watchContract } from './trading';

export const MIN_STAKE = 0.35;

export type TSessionSettings = {
    stake: number;
    take_profit: number;
    stop_loss: number;
    martingale: boolean;
    multiplier: number;
    max_stake: number;
    /** Optional: stop after this many trades (0 = no limit). */
    max_trades?: number;
    currency: string;
    allow_real_money?: boolean;
};

export type TTradeDecision = {
    symbol: string;
    contract_type: string;
    duration?: number;
    digit?: number;
    /** Short reason shown in the trade log, e.g. "Last 3 digits ≤ 4". */
    reason?: string;
};

export type TTradeResult = 'won' | 'lost';

export type TTradeRecord = {
    id: number;
    time: number;
    symbol: string;
    contract_type: string;
    digit?: number;
    stake: number;
    payout?: number;
    profit?: number;
    result?: TTradeResult;
    reason?: string;
};

export type TStrategyContext = {
    symbol: string;
    ticks: TTick[];
    /** Latest ticks of every watched market. */
    markets: Map<string, TTick[]>;
    session: Readonly<TSessionState>;
};

export type TStrategy = {
    name: string;
    /** Markets to watch. */
    markets: string[];
    /** Ticks of history the strategy needs per market. */
    history: number;
    /** Called on every new tick of a watched market while the session is waiting. Return a trade or null. */
    decide: (context: TStrategyContext) => TTradeDecision | null;
    /** Optional: called after every closed trade (e.g. to switch to a recovery rule). */
    onResult?: (record: TTradeRecord, session: Readonly<TSessionState>) => void;
};

export type TSessionStatus = 'idle' | 'waiting' | 'buying' | 'in_trade' | 'stopping' | 'stopped';

export type TSessionState = {
    status: TSessionStatus;
    strategy_name?: string;
    stop_reason?: string;
    started_at?: number;
    trades: TTradeRecord[];
    wins: number;
    losses: number;
    total_stake: number;
    profit: number;
    base_stake: number;
    current_stake: number;
    consecutive_losses: number;
    last_result?: TTradeResult;
    /** Ticks received since start, across all watched markets. */
    ticks_seen: number;
    open_trade?: TTradeRecord;
};

const EMPTY_STATE: TSessionState = {
    status: 'idle',
    trades: [],
    wins: 0,
    losses: 0,
    total_stake: 0,
    profit: 0,
    base_stake: 0,
    current_stake: 0,
    consecutive_losses: 0,
    ticks_seen: 0,
};

const MAX_LOG = 200;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Validate session settings. Returns a list of problems (empty when OK). */
export const validateSettings = (s: TSessionSettings): string[] => {
    const problems: string[] = [];
    if (!(s.stake >= MIN_STAKE)) problems.push(`Stake must be at least ${MIN_STAKE}.`);
    if (!(s.take_profit > 0)) problems.push('Set a take profit above 0.');
    if (!(s.stop_loss > 0)) problems.push('Set a stop loss above 0.');
    if (s.stop_loss < s.stake) problems.push('Stop loss must be at least one stake.');
    if (s.martingale && !(s.multiplier > 1)) problems.push('Martingale multiplier must be more than 1.');
    if (!(s.max_stake >= s.stake)) problems.push('Max stake must be at least the stake.');
    return problems;
};

/** The stake for the next trade after a result (pure, for testing). */
export const nextStake = (settings: TSessionSettings, current: number, result: TTradeResult) => {
    if (result === 'won' || !settings.martingale) return settings.stake;
    return round2(current * settings.multiplier);
};

export class AutoTrader {
    readonly id: string;
    private state: TSessionState = { ...EMPTY_STATE };
    private listeners = new Set<() => void>();
    private settings?: TSessionSettings;
    private strategy?: TStrategy;
    private tick_unsubscribers: Array<() => void> = [];
    private contract_watcher?: () => void;
    private markets = new Map<string, TTick[]>();

    constructor(id: string) {
        this.id = id;
    }

    getState = () => this.state;

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    get isRunning() {
        return ['waiting', 'buying', 'in_trade', 'stopping'].includes(this.state.status);
    }

    private setState(patch: Partial<TSessionState>) {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach(l => l());
    }

    /** Start a session. Throws with a readable message if it can't start. */
    start(strategy: TStrategy, settings: TSessionSettings) {
        if (this.isRunning) throw new Error('This session is already running.');
        const problems = validateSettings(settings);
        if (problems.length) throw new Error(problems.join(' '));
        if (!isLoggedInForTrading()) throw new Error('Please log in to start.');
        const account_id = getAccountId() ?? '';
        if (!isDemoAccount(account_id) && !settings.allow_real_money) {
            throw new Error('You are on a real-money account. Confirm real-money trading first.');
        }

        this.strategy = strategy;
        this.settings = settings;
        this.markets = new Map();
        this.state = {
            ...EMPTY_STATE,
            status: 'waiting',
            strategy_name: strategy.name,
            started_at: Date.now(),
            base_stake: settings.stake,
            current_stake: settings.stake,
        };
        this.listeners.forEach(l => l());

        this.tick_unsubscribers = strategy.markets.map(symbol =>
            marketData.subscribeTicks(symbol, ticks => this.onTicks(symbol, ticks), { history: strategy.history })
        );
    }

    /** Stop placing trades. An open contract is still followed until it closes, so its result is recorded. */
    stop(reason = 'Stopped by you') {
        this.tick_unsubscribers.forEach(u => u());
        this.tick_unsubscribers = [];
        if (this.state.status === 'in_trade' || this.state.status === 'buying') {
            this.setState({ status: 'stopping', stop_reason: reason });
        } else if (this.state.status !== 'idle' && this.state.status !== 'stopped') {
            this.setState({ status: 'stopped', stop_reason: reason });
        }
    }

    /** Clear results of a stopped session. */
    reset() {
        if (this.isRunning) return;
        this.state = { ...EMPTY_STATE };
        this.listeners.forEach(l => l());
    }

    private onTicks(symbol: string, ticks: TTick[]) {
        const previous = this.markets.get(symbol);
        this.markets.set(symbol, ticks);
        const is_new_tick = !previous || previous[previous.length - 1]?.epoch !== ticks[ticks.length - 1]?.epoch;
        if (!is_new_tick) return;

        this.state = { ...this.state, ticks_seen: this.state.ticks_seen + 1 };
        if (this.state.status !== 'waiting' || !this.strategy || !this.settings) {
            this.listeners.forEach(l => l());
            return;
        }

        let decision: TTradeDecision | null = null;
        try {
            decision = this.strategy.decide({ symbol, ticks, markets: this.markets, session: this.state });
        } catch (error) {
            console.error('[AutoTrader] strategy error', error);
        }
        if (decision) this.place(decision);
        else this.listeners.forEach(l => l());
    }

    private async place(decision: TTradeDecision) {
        const settings = this.settings;
        if (!settings) return;
        const stake = this.state.current_stake;

        if (stake > settings.max_stake) {
            this.stop(`Next stake ${stake.toFixed(2)} would be above your max stake ${settings.max_stake.toFixed(2)}`);
            return;
        }
        // Daily loss limit across all tools (also enforced inside buyContract).
        if (wouldBreachDailyLimit(stake)) {
            this.stop(DAILY_LIMIT_MESSAGE);
            return;
        }
        // Hard stop-loss cap: never risk more than what's left of the stop loss.
        const loss_so_far = Math.max(0, -this.state.profit);
        if (round2(loss_so_far + stake) > settings.stop_loss) {
            this.stop(`Next stake ${stake.toFixed(2)} could take losses past your stop loss`);
            return;
        }

        const record: TTradeRecord = {
            id: 0,
            time: Date.now(),
            symbol: decision.symbol,
            contract_type: decision.contract_type,
            digit: decision.digit,
            stake,
            reason: decision.reason,
        };
        this.setState({ status: 'buying', open_trade: record });

        const params: TContractParams = {
            contract_type: decision.contract_type,
            symbol: decision.symbol,
            amount: stake,
            currency: settings.currency,
            duration: decision.duration ?? 1,
            digit: decision.digit,
        };

        try {
            const bought = await buyContract(params);
            const open: TTradeRecord = { ...record, id: bought.contract_id, payout: Number(bought.payout), stake: Number(bought.buy_price) };
            this.setState({
                status: this.state.status === 'stopping' ? 'stopping' : 'in_trade',
                open_trade: open,
                total_stake: round2(this.state.total_stake + open.stake),
            });
            this.contract_watcher = watchContract(bought.contract_id, contract => this.onContractUpdate(open, contract));
        } catch (error: any) {
            this.setState({ open_trade: undefined });
            this.tick_unsubscribers.forEach(u => u());
            this.tick_unsubscribers = [];
            this.setState({ status: 'stopped', stop_reason: `Trade failed: ${error?.message ?? 'unknown error'}` });
        }
    }

    private onContractUpdate(open: TTradeRecord, contract: TOpenContract) {
        const is_closed = Boolean(contract.is_sold) || (contract.status !== undefined && contract.status !== 'open');
        if (!is_closed || this.state.open_trade?.id !== open.id) return;

        this.contract_watcher?.();
        this.contract_watcher = undefined;

        const settings = this.settings;
        if (!settings) return;
        const profit = round2(Number(contract.profit ?? 0));
        const result: TTradeResult = profit > 0 ? 'won' : 'lost';
        const closed: TTradeRecord = { ...open, profit, result };
        const session_profit = round2(this.state.profit + profit);
        const was_stopping = this.state.status === 'stopping';

        this.setState({
            // The trade is over: leave 'in_trade' now so the checks below can stop the session cleanly.
            status: was_stopping ? 'stopping' : 'waiting',
            open_trade: undefined,
            trades: [closed, ...this.state.trades].slice(0, MAX_LOG),
            wins: this.state.wins + (result === 'won' ? 1 : 0),
            losses: this.state.losses + (result === 'lost' ? 1 : 0),
            profit: session_profit,
            consecutive_losses: result === 'lost' ? this.state.consecutive_losses + 1 : 0,
            last_result: result,
            current_stake: nextStake(settings, this.state.current_stake, result),
        });

        try {
            this.strategy?.onResult?.(closed, this.state);
        } catch (error) {
            console.error('[AutoTrader] onResult error', error);
        }

        if (was_stopping) {
            this.setState({ status: 'stopped' });
            return;
        }
        const trade_count = this.state.wins + this.state.losses;
        if (session_profit >= settings.take_profit) this.stop(`Take profit reached (+${session_profit.toFixed(2)})`);
        else if (-session_profit >= settings.stop_loss) this.stop(`Stop loss reached (${session_profit.toFixed(2)})`);
        else if (settings.max_trades && trade_count >= settings.max_trades) this.stop(`Trade limit reached (${trade_count})`);
        else this.setState({ status: 'waiting' });
    }
}

const registry = new Map<string, AutoTrader>();
const registry_listeners = new Set<() => void>();

/** Engine for a tool (one per id), kept for the whole app session. */
export const getAutoTrader = (id: string) => {
    let trader = registry.get(id);
    if (!trader) {
        trader = new AutoTrader(id);
        trader.subscribe(() => registry_listeners.forEach(l => l()));
        registry.set(id, trader);
    }
    return trader;
};

/** Ids of sessions currently running anywhere in the app. */
export const getRunningSessions = () => [...registry.values()].filter(t => t.isRunning).map(t => t.id);

export const subscribeToSessions = (listener: () => void) => {
    registry_listeners.add(listener);
    return () => {
        registry_listeners.delete(listener);
    };
};

/** Stop every running session (e.g. on logout or account switch). */
export const stopAllSessions = (reason = 'Stopped') => registry.forEach(t => t.isRunning && t.stop(reason));
