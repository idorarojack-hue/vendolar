import { AutoTrader, nextStake, TSessionSettings, TStrategy, validateSettings } from '../auto-trader';

// --- mocks -----------------------------------------------------------------
const tickListeners = new Map<string, (ticks: any[]) => void>();
jest.mock('../market-data', () => ({
    marketData: {
        subscribeTicks: (symbol: string, listener: (ticks: any[]) => void) => {
            tickListeners.set(symbol, listener);
            return () => tickListeners.delete(symbol);
        },
    },
}));

let contractWatchers: Record<number, (c: any) => void> = {};
let nextContractId = 1;
const buyContract = jest.fn(async (params: any) => ({
    contract_id: nextContractId++,
    buy_price: params.amount,
    payout: params.amount * 1.95,
    transaction_id: 1,
    balance_after: 0,
    longcode: '',
    start_time: 0,
}));
jest.mock('../trading', () => ({
    buyContract: (params: any) => buyContract(params),
    isLoggedInForTrading: () => true,
    watchContract: (id: number, cb: (c: any) => void) => {
        contractWatchers[id] = cb;
        return () => delete contractWatchers[id];
    },
}));

let accountId = 'DOT123';
jest.mock('@/utils/account-helpers', () => ({
    getAccountId: () => accountId,
    isDemoAccount: (id: string) => id.startsWith('DOT') || id.startsWith('VRTC'),
}));

// --- helpers ---------------------------------------------------------------
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
let epoch = 0;
const sendTick = (symbol = 'R_100') => {
    epoch += 1;
    tickListeners.get(symbol)?.([{ epoch, quote: 100 + epoch / 100, digit: epoch % 10 }]);
};
const closeContract = (id: number, profit: number) =>
    contractWatchers[id]?.({ contract_id: id, is_sold: 1, status: profit > 0 ? 'won' : 'lost', profit });

const alwaysTrade: TStrategy = {
    name: 'Always',
    markets: ['R_100'],
    history: 10,
    decide: ({ symbol }) => ({ symbol, contract_type: 'DIGITEVEN', reason: 'test' }),
};

const settings: TSessionSettings = {
    stake: 1,
    take_profit: 2,
    stop_loss: 10,
    martingale: true,
    multiplier: 2,
    max_stake: 8,
    currency: 'USD',
};

beforeEach(() => {
    tickListeners.clear();
    contractWatchers = {};
    nextContractId = 1;
    buyContract.mockClear();
    accountId = 'DOT123';
});

describe('validateSettings', () => {
    it('requires take profit, stop loss and a sane stake', () => {
        expect(validateSettings(settings)).toEqual([]);
        expect(validateSettings({ ...settings, take_profit: 0 })).toContain('Set a take profit above 0.');
        expect(validateSettings({ ...settings, stop_loss: 0 }).length).toBeGreaterThan(0);
        expect(validateSettings({ ...settings, stake: 0.1 }).length).toBeGreaterThan(0);
        expect(validateSettings({ ...settings, max_stake: 0.5 }).length).toBeGreaterThan(0);
        expect(validateSettings({ ...settings, multiplier: 1 }).length).toBeGreaterThan(0);
    });
});

describe('nextStake', () => {
    it('multiplies after a loss and resets after a win', () => {
        expect(nextStake(settings, 1, 'lost')).toBe(2);
        expect(nextStake(settings, 2, 'lost')).toBe(4);
        expect(nextStake(settings, 4, 'won')).toBe(1);
        expect(nextStake({ ...settings, martingale: false }, 1, 'lost')).toBe(1);
    });
});

describe('AutoTrader session', () => {
    it('trades, applies martingale and stops at take profit', async () => {
        const trader = new AutoTrader('test');
        trader.start(alwaysTrade, settings);
        expect(trader.getState().status).toBe('waiting');

        sendTick();
        await flush();
        expect(buyContract).toHaveBeenLastCalledWith(
            expect.objectContaining({ amount: 1, contract_type: 'DIGITEVEN' })
        );
        closeContract(1, -1);
        expect(trader.getState().current_stake).toBe(2);
        expect(trader.getState().status).toBe('waiting');

        sendTick();
        await flush();
        expect(buyContract).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 2 }));
        closeContract(2, 1.9);
        expect(trader.getState().current_stake).toBe(1);
        expect(trader.getState().profit).toBe(0.9);

        sendTick();
        await flush();
        closeContract(3, 1.2);
        expect(trader.getState().profit).toBe(2.1);
        expect(trader.getState().status).toBe('stopped');
        expect(trader.getState().stop_reason).toMatch(/Take profit/);
        expect(trader.getState().wins).toBe(2);
        expect(trader.getState().losses).toBe(1);
    });

    it('never places a trade that could take losses past the stop loss', async () => {
        const trader = new AutoTrader('test-sl');
        trader.start(alwaysTrade, { ...settings, stop_loss: 4, max_stake: 100 });
        sendTick();
        await flush();
        closeContract(1, -1); // loss 1, next stake 2 -> worst case 3 <= 4 OK
        sendTick();
        await flush();
        closeContract(2, -2); // loss 3, next stake 4 -> worst case 7 > 4: must stop
        sendTick();
        await flush();
        expect(buyContract).toHaveBeenCalledTimes(2);
        expect(trader.getState().status).toBe('stopped');
        expect(trader.getState().stop_reason).toMatch(/stop loss/);
    });

    it('stops instead of going above max stake', async () => {
        const trader = new AutoTrader('test-max');
        trader.start(alwaysTrade, { ...settings, max_stake: 3, stop_loss: 100 });
        sendTick();
        await flush();
        closeContract(1, -1); // next 2
        sendTick();
        await flush();
        closeContract(2, -2); // next 4 > max 3
        sendTick();
        await flush();
        expect(buyContract).toHaveBeenCalledTimes(2);
        expect(trader.getState().stop_reason).toMatch(/max stake/);
    });

    it('refuses a real-money account unless confirmed', () => {
        accountId = 'CR123';
        const trader = new AutoTrader('test-real');
        expect(() => trader.start(alwaysTrade, settings)).toThrow(/real-money/);
        expect(() => trader.start(alwaysTrade, { ...settings, allow_real_money: true })).not.toThrow();
        trader.stop();
    });

    it('records the open trade result after Stop, then ends stopped', async () => {
        const trader = new AutoTrader('test-stop');
        trader.start(alwaysTrade, settings);
        sendTick();
        await flush();
        trader.stop();
        expect(trader.getState().status).toBe('stopping');
        closeContract(1, 0.95);
        expect(trader.getState().status).toBe('stopped');
        expect(trader.getState().wins).toBe(1);
        sendTick();
        await flush();
        expect(buyContract).toHaveBeenCalledTimes(1);
    });
});
