import { ema, highest, lowest, PRICE_STRATEGIES, rsi, sma } from '../indicators';

const up = Array.from({ length: 60 }, (_, i) => 100 + i);
const down = Array.from({ length: 60 }, (_, i) => 200 - i);

describe('indicators', () => {
    it('sma averages the last values', () => {
        expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
        expect(sma([1], 2)).toBeNaN();
    });

    it('ema follows the trend and is between min and max', () => {
        const value = ema(up, 10);
        expect(value).toBeGreaterThan(140);
        expect(value).toBeLessThanOrEqual(159);
    });

    it('rsi is high in a rising series, low in a falling one, 50 when flat', () => {
        expect(rsi(up, 14)).toBe(100);
        expect(rsi(down, 14)).toBe(0);
        expect(rsi(new Array(30).fill(5), 14)).toBe(50);
    });

    it('highest / lowest', () => {
        expect(highest([3, 9, 2])).toBe(9);
        expect(lowest([3, 9, 2])).toBe(2);
    });
});

describe('price strategies', () => {
    const get = (id: string) => PRICE_STRATEGIES.find(s => s.id === id)!;

    it('trend rider signals with the trend', () => {
        expect(get('trend-rider').signal(up)).toBe('CALL');
        expect(get('trend-rider').signal(down)).toBe('PUT');
    });

    it('breakouts fire when price leaves the range', () => {
        const flat_then_spike = [...new Array(30).fill(100), 105];
        const flat_then_drop = [...new Array(30).fill(100), 95];
        expect(get('momentum-breakout').signal(flat_then_spike)).toBe('CALL');
        expect(get('momentum-breakout').signal(flat_then_drop)).toBe('PUT');
        expect(get('momentum-breakout').signal(new Array(30).fill(100))).toBeNull();
    });

    it('pullback hunter buys a dip in an uptrend', () => {
        const dip = [...up.slice(0, 50), 148, 147, 146];
        expect(get('pullback-hunter').signal(dip)).toBe('CALL');
    });
});
