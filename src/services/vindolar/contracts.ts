/**
 * Contract types offered by Vindolar's own tools (Manual Trader, Digit Trader, automated tools).
 * Pure data + request builders; no network.
 */

export type TTradeTypeId = 'rise_fall' | 'even_odd' | 'over_under' | 'matches_differs' | 'accumulators';

export type TContractOption = {
    contract_type: string;
    label: string;
    /** Visual side for buttons: 'up' (teal) or 'down' (navy). */
    side: 'up' | 'down';
};

export type TTradeType = {
    id: TTradeTypeId;
    label: string;
    description: string;
    contracts: TContractOption[];
    /** Duration in ticks; undefined for accumulators (they run until sold or knocked out). */
    duration?: { min: number; max: number; default: number };
    /** Needs a digit 0-9 (Over/Under, Matches/Differs). */
    digit?: { default: number };
    /** Accumulator growth rates (as fractions). */
    growth_rates?: number[];
};

export const TRADE_TYPES: TTradeType[] = [
    {
        id: 'rise_fall',
        label: 'Rise/Fall',
        description: 'Win if the exit price is higher (Rise) or lower (Fall) than the entry price.',
        contracts: [
            { contract_type: 'CALL', label: 'Rise', side: 'up' },
            { contract_type: 'PUT', label: 'Fall', side: 'down' },
        ],
        duration: { min: 1, max: 10, default: 5 },
    },
    {
        id: 'even_odd',
        label: 'Even/Odd',
        description: 'Win if the last digit of the last tick is even or odd.',
        contracts: [
            { contract_type: 'DIGITEVEN', label: 'Even', side: 'up' },
            { contract_type: 'DIGITODD', label: 'Odd', side: 'down' },
        ],
        duration: { min: 1, max: 10, default: 1 },
    },
    {
        id: 'over_under',
        label: 'Over/Under',
        description: 'Win if the last digit of the last tick is over or under your chosen digit.',
        contracts: [
            { contract_type: 'DIGITOVER', label: 'Over', side: 'up' },
            { contract_type: 'DIGITUNDER', label: 'Under', side: 'down' },
        ],
        duration: { min: 1, max: 10, default: 1 },
        digit: { default: 4 },
    },
    {
        id: 'matches_differs',
        label: 'Matches/Differs',
        description: 'Win if the last digit of the last tick matches, or differs from, your chosen digit.',
        contracts: [
            { contract_type: 'DIGITMATCH', label: 'Matches', side: 'up' },
            { contract_type: 'DIGITDIFF', label: 'Differs', side: 'down' },
        ],
        duration: { min: 1, max: 10, default: 1 },
        digit: { default: 5 },
    },
    {
        id: 'accumulators',
        label: 'Accumulators',
        description:
            'Your stake grows by the growth rate every tick the price stays inside a range. If the price leaves the range, you lose the stake. Sell any time to take the profit.',
        contracts: [{ contract_type: 'ACCU', label: 'Buy', side: 'up' }],
        growth_rates: [0.01, 0.02, 0.03, 0.04, 0.05],
    },
];

export const getTradeType = (id: TTradeTypeId) => TRADE_TYPES.find(t => t.id === id) ?? TRADE_TYPES[0];

export type TContractParams = {
    contract_type: string;
    symbol: string;
    amount: number;
    currency: string;
    duration?: number;
    digit?: number;
    growth_rate?: number;
    take_profit?: number;
};

/** Contract parameters in the format Deriv's `proposal` and `buy.parameters` expect. */
export const toContractParameters = ({
    contract_type,
    symbol,
    amount,
    currency,
    duration,
    digit,
    growth_rate,
    take_profit,
}: TContractParams) => {
    const parameters: Record<string, unknown> = {
        amount,
        basis: 'stake',
        contract_type,
        currency,
        underlying_symbol: symbol,
    };
    if (contract_type === 'ACCU') {
        parameters.growth_rate = growth_rate ?? 0.03;
        if (take_profit && take_profit > 0) parameters.limit_order = { take_profit };
    } else {
        parameters.duration = duration ?? 1;
        parameters.duration_unit = 't';
    }
    if (contract_type.startsWith('DIGIT') && !['DIGITEVEN', 'DIGITODD'].includes(contract_type)) {
        parameters.barrier = String(digit ?? 5);
    }
    return parameters;
};

/** Profit if the contract wins, as a percentage of the stake. */
export const getReturnPercent = (stake: number, payout: number) =>
    stake > 0 && payout > 0 ? ((payout - stake) / stake) * 100 : 0;
