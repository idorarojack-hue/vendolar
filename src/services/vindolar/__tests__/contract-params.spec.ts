import { toContractParameters } from '../contracts';
import { parseDuration, pickOffering, TOffering } from '../contracts-for';

jest.mock('../market-data', () => ({ marketData: { send: jest.fn() } }));

const base = { symbol: '1HZ100V', amount: 10, currency: 'USD' };

describe('toContractParameters', () => {
    it('sends multiplier, take profit and stop loss without a duration', () => {
        const p = toContractParameters({
            ...base,
            contract_type: 'MULTUP',
            multiplier: 200,
            take_profit: 5,
            stop_loss: 3,
        });
        expect(p).toMatchObject({
            contract_type: 'MULTUP',
            multiplier: 200,
            limit_order: { take_profit: 5, stop_loss: 3 },
        });
        expect(p.duration).toBeUndefined();
    });

    it('drops stop loss when deal cancellation is on (Deriv accepts only one)', () => {
        const p = toContractParameters({ ...base, contract_type: 'MULTDOWN', stop_loss: 3, cancellation: '5m' });
        expect(p.cancellation).toBe('5m');
        expect(p.limit_order).toBeUndefined();
    });

    it('passes barriers, minutes and the selected tick', () => {
        expect(
            toContractParameters({
                ...base,
                contract_type: 'EXPIRYRANGE',
                duration: 2,
                duration_unit: 'm',
                barrier: '+2.83',
                barrier2: '-2.82',
            })
        ).toMatchObject({ duration: 2, duration_unit: 'm', barrier: '+2.83', barrier2: '-2.82' });
        expect(
            toContractParameters({ ...base, contract_type: 'TICKHIGH', duration: 5, selected_tick: 3 })
        ).toMatchObject({ duration_unit: 't', selected_tick: 3 });
    });

    it('keeps digit barriers as before', () => {
        expect(toContractParameters({ ...base, contract_type: 'DIGITOVER', duration: 1, digit: 4 }).barrier).toBe('4');
    });
});

describe('contracts_for helpers', () => {
    it('parses durations', () => {
        expect(parseDuration('5t')).toEqual({ value: 5, unit: 't' });
        expect(parseDuration('15s')).toEqual({ value: 15, unit: 's' });
        expect(parseDuration('0')).toBeUndefined();
    });

    it('prefers tick expiry, then intraday, never daily', () => {
        const offerings = [
            { contract_type: 'CALL', category: 'callput', expiry_type: 'daily' },
            { contract_type: 'CALL', category: 'callput', expiry_type: 'intraday' },
            { contract_type: 'CALL', category: 'callput', expiry_type: 'tick' },
            { contract_type: 'VANILLALONGCALL', category: 'vanilla', expiry_type: 'daily' },
        ] as TOffering[];
        expect(pickOffering(offerings, 'CALL')?.expiry_type).toBe('tick');
        expect(pickOffering(offerings, 'VANILLALONGCALL')).toBeUndefined();
    });
});
