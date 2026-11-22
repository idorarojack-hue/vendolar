import { getTodayResult, recordTradeResult, setDailyLossLimit, wouldBreachDailyLimit } from '../daily-limit';

beforeEach(() => localStorage.clear());

describe('daily loss limit', () => {
    it('is off by default', () => {
        expect(wouldBreachDailyLimit(1000)).toBe(false);
    });

    it("adds up today's results", () => {
        recordTradeResult(-2);
        recordTradeResult(0.95);
        expect(getTodayResult()).toBeCloseTo(-1.05);
    });

    it('refuses a stake that could take the loss past the limit', () => {
        setDailyLossLimit(10);
        recordTradeResult(-8);
        expect(wouldBreachDailyLimit(2)).toBe(false); // 8 + 2 = 10, allowed
        expect(wouldBreachDailyLimit(2.5)).toBe(true); // 10.5 > 10
    });

    it("ignores a previous day's result", () => {
        localStorage.setItem('vd_daily_result', JSON.stringify({ date: '2000-01-01', profit: -500 }));
        setDailyLossLimit(10);
        expect(getTodayResult()).toBe(0);
        expect(wouldBreachDailyLimit(5)).toBe(false);
    });
});
