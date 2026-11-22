/**
 * Vindolar market data service.
 *
 * Opens its own read-only WebSocket to Deriv's public endpoint, so analysis tools can stream many
 * markets at once without touching the bot's logged-in connection (stopping a bot calls
 * `forgetAll('ticks')` on that connection, which would otherwise cut these streams off).
 *
 * Usage:
 *   const unsubscribe = marketData.subscribeTicks('1HZ100V', ticks => ..., { history: 120 });
 *   unsubscribe();
 */
import { isProduction, WS_SERVERS } from '@/components/shared/utils/config/config';
import { getLastDigit, sortVolatilitySymbols, TTick } from './digit-stats';

export type TMarketSymbol = {
    symbol: string;
    name: string;
    pip_size: number;
    market: string;
    submarket: string;
};

type TTickListener = (ticks: TTick[]) => void;

type TSymbolStream = {
    ticks: TTick[];
    pip_size: number;
    listeners: Set<TTickListener>;
    history_count: number;
    subscription_id?: string;
    is_requesting: boolean;
    /** A screen asked for more history while a request was in flight: reload when it finishes. */
    needs_more_history?: boolean;
};

type TPending = { resolve: (data: any) => void; reject: (error: any) => void; timer: ReturnType<typeof setTimeout> };

/** Ticks kept per market (enough for the largest analysis window). */
export const MAX_TICKS_KEPT = 1000;
const REQUEST_TIMEOUT_MS = 15000;
const PING_INTERVAL_MS = 30000;
const MAX_RECONNECT_DELAY_MS = 30000;

const toWebSocketUrl = (url: string) => url.replace(/^http(s?):\/\//, (_m, s) => `ws${s}://`);

class MarketDataService {
    private socket: WebSocket | null = null;
    private connecting: Promise<WebSocket> | null = null;
    private next_req_id = 1;
    private pending = new Map<number, TPending>();
    private streams = new Map<string, TSymbolStream>();
    private subscription_to_symbol = new Map<string, string>();
    /** Generic subscriptions (e.g. price proposals): subscription id -> handler for every update. */
    private generic_subscriptions = new Map<string, (data: any) => void>();
    private symbols_promise: Promise<TMarketSymbol[]> | null = null;
    private ping_timer: ReturnType<typeof setInterval> | null = null;
    private reconnect_delay = 1000;
    private reconnect_timer: ReturnType<typeof setTimeout> | null = null;
    private status_listeners = new Set<(is_connected: boolean) => void>();

    get url() {
        return toWebSocketUrl(isProduction() ? WS_SERVERS.PRODUCTION : WS_SERVERS.STAGING);
    }

    get isConnected() {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    onStatusChange(listener: (is_connected: boolean) => void) {
        this.status_listeners.add(listener);
        return () => this.status_listeners.delete(listener);
    }

    /** All open volatility indices (synthetic random indices), 1-second ones first. */
    getVolatilitySymbols(): Promise<TMarketSymbol[]> {
        if (!this.symbols_promise) {
            this.symbols_promise = this.send({ active_symbols: 'brief' })
                .then(response => {
                    const symbols: TMarketSymbol[] = (response.active_symbols ?? [])
                        .filter(
                            (s: any) =>
                                s.submarket === 'random_index' && s.exchange_is_open !== 0 && !s.is_trading_suspended
                        )
                        .map((s: any) => ({
                            symbol: s.underlying_symbol ?? s.symbol,
                            name: s.underlying_symbol_name ?? s.display_name,
                            pip_size: Math.round(-Math.log10(Number(s.pip_size ?? s.pip ?? 0.01))),
                            market: s.market,
                            submarket: s.submarket,
                        }));
                    return sortVolatilitySymbols(symbols);
                })
                .catch(error => {
                    this.symbols_promise = null;
                    throw error;
                });
        }
        return this.symbols_promise;
    }

    /**
     * Stream ticks for a market. The listener gets the latest ticks (oldest first) right away if
     * already loaded, then on every new tick. Returns an unsubscribe function.
     */
    subscribeTicks(symbol: string, listener: TTickListener, { history = 120 }: { history?: number } = {}) {
        let stream = this.streams.get(symbol);
        const wanted = Math.min(Math.max(history, 1), MAX_TICKS_KEPT);

        if (!stream) {
            stream = { ticks: [], pip_size: 2, listeners: new Set(), history_count: wanted, is_requesting: false };
            this.streams.set(symbol, stream);
        }
        stream.listeners.add(listener);

        if (stream.ticks.length) listener(stream.ticks);

        if (!stream.subscription_id && !stream.is_requesting) {
            stream.history_count = Math.max(stream.history_count, wanted);
            this.startStream(symbol);
        } else if (wanted > stream.history_count) {
            // A screen wants a longer window than currently loaded: restart the stream with more history
            // (or right after the request that is already in flight).
            stream.history_count = wanted;
            if (stream.is_requesting) stream.needs_more_history = true;
            else this.restartStream(symbol);
        }

        return () => this.unsubscribe(symbol, listener);
    }

    /**
     * Past ticks for a market, oldest first, paged backwards in batches of 2,000 (Deriv returns at most
     * 2,000 ticks per request, measured). `onProgress` reports how many ticks have been loaded so far.
     */
    async fetchTickHistory(symbol: string, count: number, onProgress?: (loaded: number) => void): Promise<TTick[]> {
        const BATCH = 2000;
        const batches: TTick[][] = [];
        let end: number | 'latest' = 'latest';
        let loaded = 0;
        while (loaded < count) {
            const size = Math.min(count - loaded, BATCH);
            // eslint-disable-next-line no-await-in-loop
            const response = await this.send({ ticks_history: symbol, count: size, end, style: 'ticks' });
            const prices: number[] = response.history?.prices ?? [];
            const times: number[] = response.history?.times ?? [];
            const pip_size = Number(response.pip_size ?? 2);
            if (!prices.length) break;
            batches.unshift(
                prices.map((quote, i) => ({
                    epoch: Number(times[i]),
                    quote: Number(quote),
                    digit: getLastDigit(Number(quote), pip_size),
                }))
            );
            loaded += prices.length;
            onProgress?.(loaded);
            end = Number(times[0]) - 1;
            if (prices.length < size) break;
        }
        return batches.flat();
    }

    /**
     * Subscribe to any streaming request on the public connection (e.g. a `proposal` for live payouts).
     * `onUpdate` gets the first response and every update; errors are passed as `{ error }`.
     * Returns an unsubscribe function. Not resubscribed automatically after a reconnect —
     * callers re-subscribe when their inputs change or `onStatusChange` reports a reconnect.
     */
    subscribe(request: Record<string, unknown>, onUpdate: (data: any) => void) {
        let subscription_id: string | undefined;
        let is_active = true;

        this.send({ ...request, subscribe: 1 })
            .then(response => {
                subscription_id = response.subscription?.id;
                if (!is_active) {
                    if (subscription_id) this.send({ forget: subscription_id }).catch(() => undefined);
                    return;
                }
                if (subscription_id) this.generic_subscriptions.set(subscription_id, onUpdate);
                onUpdate(response);
            })
            .catch(error => {
                if (is_active) onUpdate({ error: error?.error ?? error });
            });

        return () => {
            is_active = false;
            if (subscription_id) {
                this.generic_subscriptions.delete(subscription_id);
                this.send({ forget: subscription_id }).catch(() => undefined);
            }
        };
    }

    private unsubscribe(symbol: string, listener: TTickListener) {
        const stream = this.streams.get(symbol);
        if (!stream) return;
        stream.listeners.delete(listener);
        if (stream.listeners.size === 0) {
            if (stream.subscription_id) {
                this.subscription_to_symbol.delete(stream.subscription_id);
                this.send({ forget: stream.subscription_id }).catch(() => undefined);
            }
            this.streams.delete(symbol);
        }
    }

    private async restartStream(symbol: string) {
        const stream = this.streams.get(symbol);
        if (!stream) return;
        if (stream.subscription_id) {
            const id = stream.subscription_id;
            this.subscription_to_symbol.delete(id);
            stream.subscription_id = undefined;
            await this.send({ forget: id }).catch(() => undefined);
        }
        this.startStream(symbol);
    }

    private async startStream(symbol: string) {
        const stream = this.streams.get(symbol);
        if (!stream || stream.is_requesting) return;
        stream.is_requesting = true;
        try {
            const response = await this.send({
                ticks_history: symbol,
                count: stream.history_count,
                end: 'latest',
                style: 'ticks',
                subscribe: 1,
            });
            // The screen may have unsubscribed while we waited.
            if (this.streams.get(symbol) !== stream) {
                if (response.subscription?.id) this.send({ forget: response.subscription.id }).catch(() => undefined);
                return;
            }
            const pip_size = Number(response.pip_size ?? stream.pip_size);
            const { prices = [], times = [] } = response.history ?? {};
            stream.pip_size = pip_size;
            stream.ticks = prices.map((quote: number, i: number) => ({
                epoch: Number(times[i]),
                quote: Number(quote),
                digit: getLastDigit(Number(quote), pip_size),
            }));
            if (response.subscription?.id) {
                stream.subscription_id = response.subscription.id;
                this.subscription_to_symbol.set(response.subscription.id, symbol);
            }
            this.notify(stream);
        } catch (error) {
            // Retry later; the reconnect logic also restarts streams after a dropped connection.
            setTimeout(() => {
                if (this.streams.get(symbol) === stream && !stream.subscription_id) this.startStream(symbol);
            }, 5000);
        } finally {
            stream.is_requesting = false;
            if (stream.needs_more_history && this.streams.get(symbol) === stream) {
                stream.needs_more_history = false;
                this.restartStream(symbol);
            }
        }
    }

    private onTick(tick: any) {
        const symbol = this.subscription_to_symbol.get(tick.id) ?? tick.symbol;
        const stream = this.streams.get(symbol);
        if (!stream) return;
        const epoch = Number(tick.epoch);
        const last = stream.ticks[stream.ticks.length - 1];
        if (last && last.epoch >= epoch) return;
        const pip_size = Number(tick.pip_size ?? stream.pip_size);
        const next = { epoch, quote: Number(tick.quote), digit: getLastDigit(Number(tick.quote), pip_size) };
        const ticks = stream.ticks.length >= MAX_TICKS_KEPT ? stream.ticks.slice(1) : stream.ticks.slice();
        ticks.push(next);
        stream.ticks = ticks;
        this.notify(stream);
    }

    private notify(stream: TSymbolStream) {
        stream.listeners.forEach(listener => {
            try {
                listener(stream.ticks);
            } catch (error) {
                console.error('[MarketData] listener error', error);
            }
        });
    }

    send(request: Record<string, unknown>): Promise<any> {
        return this.connect().then(
            socket =>
                new Promise((resolve, reject) => {
                    const req_id = this.next_req_id++;
                    const timer = setTimeout(() => {
                        this.pending.delete(req_id);
                        reject(new Error(`Request timed out: ${Object.keys(request)[0]}`));
                    }, REQUEST_TIMEOUT_MS);
                    this.pending.set(req_id, { resolve, reject, timer });
                    socket.send(JSON.stringify({ ...request, req_id }));
                })
        );
    }

    private connect(): Promise<WebSocket> {
        if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
        if (this.connecting) return this.connecting;

        this.connecting = new Promise<WebSocket>((resolve, reject) => {
            const socket = new WebSocket(this.url);
            this.socket = socket;

            socket.onopen = () => {
                this.connecting = null;
                this.reconnect_delay = 1000;
                this.startPing();
                this.status_listeners.forEach(l => l(true));
                resolve(socket);
            };
            socket.onmessage = event => this.onMessage(event);
            socket.onerror = () => {
                if (this.connecting) {
                    this.connecting = null;
                    reject(new Error('Could not connect to market data'));
                }
            };
            socket.onclose = () => {
                if (this.socket !== socket) return;
                this.socket = null;
                this.connecting = null;
                this.stopPing();
                this.status_listeners.forEach(l => l(false));
                this.pending.forEach(p => {
                    clearTimeout(p.timer);
                    p.reject(new Error('Connection closed'));
                });
                this.pending.clear();
                this.subscription_to_symbol.clear();
                this.generic_subscriptions.clear();
                this.streams.forEach(stream => {
                    stream.subscription_id = undefined;
                    stream.is_requesting = false;
                });
                this.scheduleReconnect();
            };
        });
        return this.connecting;
    }

    private scheduleReconnect() {
        if (this.reconnect_timer || this.streams.size === 0) return;
        this.reconnect_timer = setTimeout(() => {
            this.reconnect_timer = null;
            this.connect()
                .then(() => this.streams.forEach((_stream, symbol) => this.startStream(symbol)))
                .catch(() => {
                    this.reconnect_delay = Math.min(this.reconnect_delay * 2, MAX_RECONNECT_DELAY_MS);
                    this.scheduleReconnect();
                });
        }, this.reconnect_delay);
    }

    private onMessage(event: MessageEvent) {
        let data: any;
        try {
            data = JSON.parse(event.data);
        } catch {
            return;
        }
        if (data.msg_type === 'tick' && data.tick) {
            this.onTick(data.tick);
            return;
        }
        const pending = data.req_id ? this.pending.get(data.req_id) : undefined;
        // Updates for generic subscriptions (first response is handled by `pending` below).
        if (!pending && data.subscription?.id && this.generic_subscriptions.has(data.subscription.id)) {
            this.generic_subscriptions.get(data.subscription.id)?.(data);
            return;
        }
        if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(data.req_id);
            if (data.error) pending.reject(data.error);
            else pending.resolve(data);
        }
    }

    private startPing() {
        this.stopPing();
        this.ping_timer = setInterval(() => {
            if (this.isConnected) this.send({ ping: 1 }).catch(() => undefined);
        }, PING_INTERVAL_MS);
    }

    private stopPing() {
        if (this.ping_timer) clearInterval(this.ping_timer);
        this.ping_timer = null;
    }
}

export const marketData = new MarketDataService();
