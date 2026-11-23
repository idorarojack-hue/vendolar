import { getReturnPercent, getTradeType, toContractParameters, TRADE_TYPES } from '../contracts';

const base = { symbol: '1HZ100V', amount: 1, currency: 'USD' };

describe('toContractParameters', () => {
    it('builds a tick contract with duration in ticks', () => {
        expect(toContractParameters({ ...base, contract_type: 'CALL', duration: 5 })).toEqual({
            amount: 1,
            basis: 'stake',
            contract_type: 'CALL',
            currency: 'USD',
            underlying_symbol: '1HZ100V',
            duration: 5,
            duration_unit: 't',
        });
    });

    it('adds the digit as barrier for Over/Under and Matches/Differs only', () => {
        expect(toContractParameters({ ...base, contract_type: 'DIGITOVER', duration: 1, digit: 4 }).barrier).toBe('4');
        expect(toContractParameters({ ...base, contract_type: 'DIGITDIFF', duration: 1, digit: 0 }).barrier).toBe('0');
        expect(
            toContractParameters({ ...base, contract_type: 'DIGITEVEN', duration: 1, digit: 4 }).barrier
        ).toBeUndefined();
    });

    it('builds an accumulator without duration and with optional take profit', () => {
        const without_tp = toContractParameters({ ...base, contract_type: 'ACCU', growth_rate: 0.02 });
        expect(without_tp.growth_rate).toBe(0.02);
        expect(without_tp.duration).toBeUndefined();
        expect(without_tp.limit_order).toBeUndefined();

        const with_tp = toContractParameters({ ...base, contract_type: 'ACCU', growth_rate: 0.03, take_profit: 5 });
        expect(with_tp.limit_order).toEqual({ take_profit: 5 });
    });
});

describe('trade types', () => {
    it('every type has at least one contract and a known id', () => {
        TRADE_TYPES.forEach(type => {
            expect(type.contracts.length).toBeGreaterThan(0);
            expect(getTradeType(type.id)).toBe(type);
        });
    });

    it('calculates return on stake', () => {
        expect(getReturnPercent(1, 1.95)).toBeCloseTo(95);
        expect(getReturnPercent(0, 1.95)).toBe(0);
    });
});
