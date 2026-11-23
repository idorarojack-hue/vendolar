/**
 * Vindolar trading service: buy, sell and follow contracts on the logged-in connection (`api_base.api`).
 * Live price quotes for display come from the public connection (see market-data.ts).
 */
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { publishLiveBalance } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import { TContractParams, toContractParameters } from './contracts';
import { DAILY_LIMIT_MESSAGE, recordTradeResult, wouldBreachDailyLimit } from './daily-limit';
import { marketData } from './market-data';

export type TOpenContract = {
    contract_id: number;
    contract_type: string;
    underlying_symbol?: string;
    display_name?: string;
    buy_price: number;
    payout?: number;
    bid_price?: number;
    profit?: number;
    status?: 'open' | 'won' | 'lost' | 'sold' | string;
    is_sold?: number;
    is_expired?: number;
    is_valid_to_sell?: number;
    entry_spot?: number;
    current_spot?: number;
    exit_spot?: number;
    barrier?: string;
    high_barrier?: string;
    low_barrier?: string;
    tick_count?: number;
    tick_passed?: number;
    currency?: string;
    date_start?: number;
    longcode?: string;
    /** Multipliers / accumulators */
    multiplier?: number;
    is_valid_to_cancel?: number;
    is_valid_to_update?: number;
    limit_order?: {
        take_profit?: { order_amount?: number | null; value?: string };
        stop_loss?: { order_amount?: number | null; value?: string };
        stop_out?: { order_amount?: number | null; value?: string };
    };
    cancellation?: { ask_price?: number; date_expiry?: number };
    purchase_time?: number;
};

/**
 * Emitted with every update of a contract placed by the Vindolar tools (Manual Trader, Bulk Trader,
 * auto sessions...). The run panel listens so these trades show in Summary / Transactions too.
 */
export const TOOL_CONTRACT_EVENT = 'vindolar.contract';

export class TradingError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
        super(message);
        this.code = code;
    }
}

const toTradingError = (e: any) => {
    const error = e?.error ?? e;
    return new TradingError(error?.message ?? 'Something went wrong. Please try again.', error?.code);
};

type TApi = NonNullable<typeof api_base.api>;

const getApi = () => {
    const api = api_base.api;
    if (!api || !api_base.is_authorized) {
        throw new TradingError('Please log in to trade.', 'NotLoggedIn');
    }
    return api;
};

/** `api.send` returns a Promise at runtime (DerivAPIBasic), but the template types it as void. */
const send = (api: TApi, request: Record<string, unknown>) => api.send(request) as unknown as Promise<any>;

/** Push the balance Deriv returns after a buy or sell into the header immediately. */
const noteBalance = (balance_after: unknown) => {
    const amount = Number(balance_after);
    if (!Number.isFinite(amount)) return;
    const loginid = localStorage.getItem('active_loginid') || '';
    if (loginid) publishLiveBalance(loginid, amount);
    globalObserver.getState('client.store')?.setBalance?.(String(amount));
};

export const isLoggedInForTrading = () => Boolean(api_base.api && api_base.is_authorized);

// Deriv allows 360 proposal/buy/sell calls per minute per connection. Keep buys well under that so
// several tools running at once never get rate-limited mid-session.
const BUYS_PER_MINUTE = 300;
const recent_buys: number[] = [];

const waitForBuySlot = async () => {
    for (;;) {
        const now = Date.now();
        while (recent_buys.length && now - recent_buys[0] > 60_000) recent_buys.shift();
        if (recent_buys.length < BUYS_PER_MINUTE) {
            recent_buys.push(now);
            return;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 60_000 - (now - recent_buys[0]) + 50));
    }
};

/** Buy a contract at the stake price. Resolves with Deriv's `buy` response. */
export const buyContract = async (params: TContractParams) => {
    const api = getApi();
    if (wouldBreachDailyLimit(params.amount)) throw new TradingError(DAILY_LIMIT_MESSAGE, 'DailyLossLimit');
    await waitForBuySlot();
    try {
        const response: any = await send(api, {
            buy: '1',
            price: params.amount,
            parameters: toContractParameters(params),
        });
        noteBalance(response?.buy?.balance_after);
        return response.buy as {
            contract_id: number;
            transaction_id: number;
            buy_price: number;
            payout: number;
            balance_after: number;
            longcode: string;
            start_time: number;
        };
    } catch (e) {
        throw toTradingError(e);
    }
};

/** Sell an open contract at the market price. */
export const sellContract = async (contract_id: number) => {
    const api = getApi();
    try {
        const response: any = await send(api, { sell: contract_id, price: 0 });
        noteBalance(response?.sell?.balance_after);
        return response.sell as { sold_for: number; transaction_id: number; balance_after: number };
    } catch (e) {
        throw toTradingError(e);
    }
};

/**
 * Live price quote on the logged-in connection. Use this when logged in: prices on the logged-in
 * connection can differ from the public feed (e.g. app markup), and the quote shown must match
 * what the trade actually pays. `onUpdate` gets every update; errors come as `{ error }`.
 */
export const subscribeAuthenticatedProposal = (request: Record<string, unknown>, onUpdate: (data: any) => void) => {
    const api = getApi();
    let subscription_id: string | undefined;
    let is_active = true;

    const listener = api.onMessage().subscribe((message: any) => {
        const data = message?.data ?? message;
        if (data?.msg_type !== 'proposal' || !subscription_id) return;
        if (data.subscription?.id === subscription_id || data.proposal?.id === subscription_id) onUpdate(data);
    });

    send(api, { proposal: 1, ...request, subscribe: 1 })
        .then((response: any) => {
            subscription_id = response?.subscription?.id ?? response?.proposal?.id;
            if (!is_active) {
                if (subscription_id) send(api, { forget: subscription_id }).catch(() => undefined);
                return;
            }
            onUpdate(response);
        })
        .catch((e: any) => {
            if (is_active) onUpdate({ error: e?.error ?? e });
        });

    return () => {
        is_active = false;
        listener.unsubscribe();
        if (subscription_id) send(api, { forget: subscription_id }).catch(() => undefined);
    };
};

/**
 * Follow a contract until it closes. `onUpdate` gets every `proposal_open_contract` update.
 * Returns a stop function.
 */
export const watchContract = (contract_id: number, onUpdate: (contract: TOpenContract) => void) => {
    const api = getApi();
    let own_subscription_id: string | undefined;
    let is_active = true;

    let is_recorded = false;
    const subscription = api.onMessage().subscribe((message: any) => {
        const data = message?.data ?? message;
        if (data?.msg_type !== 'proposal_open_contract') return;
        const contract = data.proposal_open_contract;
        if (!contract || Number(contract.contract_id) !== Number(contract_id)) return;
        const is_closed = Boolean(contract.is_sold) || (contract.status !== undefined && contract.status !== 'open');
        if (is_closed && !is_recorded && contract.profit !== undefined) {
            // Count the result once towards today's total for the daily loss limit.
            is_recorded = true;
            recordTradeResult(Number(contract.profit));
        }
        if (contract.transaction_ids?.buy) globalObserver.emit(TOOL_CONTRACT_EVENT, contract);
        onUpdate(contract);
    });

    // The app already streams all open contracts; ask for this one explicitly too so updates
    // start immediately. "AlreadySubscribed" is fine.
    send(api, { proposal_open_contract: 1, contract_id, subscribe: 1 })
        .then((response: any) => {
            own_subscription_id = response?.subscription?.id;
            if (!is_active && own_subscription_id) send(api, { forget: own_subscription_id }).catch(() => undefined);
        })
        .catch(() => undefined);

    return () => {
        is_active = false;
        subscription.unsubscribe();
        if (own_subscription_id) send(api, { forget: own_subscription_id }).catch(() => undefined);
    };
};

export type TCopySupport = { supported: boolean; code?: string; message?: string; traders?: unknown[] };

/**
 * Ask the logged-in connection whether Deriv copy trading is available.
 * Deriv's newer trading API may not offer it; the answer is shown to the user as-is.
 */
export const checkCopyTradingSupport = async (): Promise<TCopySupport> => {
    const api = getApi();
    try {
        const response: any = await send(api, { copytrading_list: 1 });
        return { supported: true, traders: response?.copytrading_list?.traders ?? [] };
    } catch (e: any) {
        const error = e?.error ?? e;
        const unsupported = ['UnknownMethod', 'UnrecognisedRequest', 'InputValidationFailed'].includes(error?.code);
        return { supported: !unsupported, code: error?.code, message: error?.message };
    }
};

/** Start copying a trader (needs the trader's read-only API token). */
export const startCopying = async (trader_token: string) => {
    const api = getApi();
    try {
        return await send(api, { copy_start: trader_token });
    } catch (e) {
        throw toTradingError(e);
    }
};

export const stopCopying = async (trader_token: string) => {
    const api = getApi();
    try {
        return await send(api, { copy_stop: trader_token });
    } catch (e) {
        throw toTradingError(e);
    }
};

/**
 * Payout ratio (payout ÷ stake) Deriv offers for a contract right now. Uses the logged-in connection
 * when available, so the ratio matches what this account is actually paid.
 */
export const getPayoutRatio = async (params: TContractParams): Promise<number> => {
    const request = { proposal: 1, ...toContractParameters(params) };
    try {
        const response: any = isLoggedInForTrading() ? await send(getApi(), request) : await marketData.send(request);
        const proposal = response?.proposal;
        return proposal ? Number(proposal.payout) / Number(proposal.ask_price) : 0;
    } catch (e) {
        throw toTradingError(e);
    }
};

export type TReportQuery = { limit?: number; offset?: number; date_from?: number; date_to?: number };

/** Closed contracts with buy/sell prices (Deriv `profit_table`, max 500 per call). */
export const getProfitTable = async ({ limit = 50, offset = 0, date_from, date_to }: TReportQuery = {}) => {
    const api = getApi();
    try {
        const response: any = await send(api, {
            profit_table: 1,
            description: 1,
            sort: 'DESC',
            limit,
            offset,
            ...(date_from ? { date_from } : {}),
            ...(date_to ? { date_to } : {}),
        });
        return (response?.profit_table?.transactions ?? []) as any[];
    } catch (e) {
        throw toTradingError(e);
    }
};

/** Account statement: every balance movement (Deriv `statement`). */
export const getStatement = async ({ limit = 50, offset = 0, date_from, date_to }: TReportQuery = {}) => {
    const api = getApi();
    try {
        const response: any = await send(api, {
            statement: 1,
            description: 1,
            limit,
            offset,
            ...(date_from ? { date_from } : {}),
            ...(date_to ? { date_to } : {}),
        });
        return (response?.statement?.transactions ?? []) as any[];
    } catch (e) {
        throw toTradingError(e);
    }
};

// ---------------------------------------------------------------------------
// Open positions, live account transactions, contract changes
// ---------------------------------------------------------------------------

export type TPortfolioContract = {
    contract_id: number;
    contract_type: string;
    buy_price: number;
    payout?: number;
    underlying_symbol?: string;
    symbol?: string;
    longcode?: string;
    purchase_time?: number;
    currency?: string;
};

/** Open contracts on the logged-in account (`portfolio`), e.g. to show them again after a page reload. */
export const getOpenContracts = async (): Promise<TPortfolioContract[]> => {
    const api = getApi();
    try {
        const response: any = await send(api, { portfolio: 1 });
        return (response?.portfolio?.contracts ?? []).map((c: any) => ({
            ...c,
            contract_id: Number(c.contract_id),
            buy_price: Number(c.buy_price),
            payout: c.payout === undefined ? undefined : Number(c.payout),
        }));
    } catch (e) {
        throw toTradingError(e);
    }
};

export type TAccountTransaction = {
    action: 'buy' | 'sell' | 'deposit' | 'withdrawal' | string;
    amount: number;
    balance: number;
    contract_id?: number;
    currency?: string;
    longcode?: string;
    underlying_symbol?: string;
    transaction_id?: number;
};

/**
 * Live stream of every transaction on the account (`transaction`): buys and sells from any tool, tab or
 * app, plus deposits and withdrawals. Returns a stop function.
 */
export const subscribeTransactions = (onTransaction: (transaction: TAccountTransaction) => void) => {
    const api = getApi();
    let subscription_id: string | undefined;
    let is_active = true;

    const listener = api.onMessage().subscribe((message: any) => {
        const data = message?.data ?? message;
        if (data?.msg_type !== 'transaction' || !data.transaction?.action) return;
        if (subscription_id && data.subscription?.id && data.subscription.id !== subscription_id) return;
        const t = data.transaction;
        noteBalance(t.balance);
        onTransaction({
            ...t,
            amount: Number(t.amount),
            balance: Number(t.balance),
            contract_id: t.contract_id === undefined ? undefined : Number(t.contract_id),
        });
    });

    send(api, { transaction: 1, subscribe: 1 })
        .then((response: any) => {
            subscription_id = response?.subscription?.id;
            if (!is_active && subscription_id) send(api, { forget: subscription_id }).catch(() => undefined);
        })
        .catch(() => undefined);

    return () => {
        is_active = false;
        listener.unsubscribe();
        if (subscription_id) send(api, { forget: subscription_id }).catch(() => undefined);
    };
};

/**
 * Change take profit / stop loss on an open multiplier or accumulator contract (`contract_update`).
 * Pass `null` to remove one; leave a field out to keep it as it is.
 */
export const updateContractLimits = async (
    contract_id: number,
    limits: { take_profit?: number | null; stop_loss?: number | null }
) => {
    const api = getApi();
    try {
        const response: any = await send(api, { contract_update: 1, contract_id, limit_order: limits });
        return response.contract_update;
    } catch (e) {
        throw toTradingError(e);
    }
};

/** Cancel a multiplier contract during its deal-cancellation window (`cancel`): the stake is refunded. */
export const cancelContract = async (contract_id: number) => {
    const api = getApi();
    try {
        const response: any = await send(api, { cancel: contract_id });
        noteBalance(response?.cancel?.balance_after);
        return response.cancel as { sold_for: number; balance_after: number; transaction_id: number };
    } catch (e) {
        throw toTradingError(e);
    }
};

/** Past take profit / stop loss changes of a contract (`contract_update_history`), newest first. */
export const getContractUpdateHistory = async (contract_id: number) => {
    const api = getApi();
    try {
        const response: any = await send(api, { contract_update_history: 1, contract_id, limit: 50 });
        return (response?.contract_update_history ?? []) as {
            display_name: string;
            order_amount: string | number;
            order_date: number;
            order_type: string;
            value?: string;
        }[];
    } catch (e) {
        throw toTradingError(e);
    }
};
