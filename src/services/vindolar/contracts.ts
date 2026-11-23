/**
 * Contract types offered by Vindolar's own tools (Manual Trader, Digit Trader, automated tools).
 * Pure data + request builders; no network.
 */

export type TTradeTypeId =
    | 'rise_fall'
    | 'higher_lower'
    | 'touch'
    | 'even_odd'
    | 'over_under'
    | 'matches_differs'
    | 'accumulators'
    | 'multipliers'
    | 'turbos'
    | 'vanillas'
    | 'high_low_ticks'
    | 'only_ups_downs'
    | 'asians'
    | 'reset'
    | 'ends_between'
    | 'stays_between';

/**
 * How a trade type sets its barrier:
 * - offset: one barrier relative to the entry spot (e.g. "+0.58")
 * - range: high and low barriers relative to the entry spot
 * - choices: pick one of Deriv's barrier choices (vanillas strike)
 * - turbo: pick a distance level; turbo barriers move with the price, so the list is refreshed live
 */
export type TBarrierKind = 'offset' | 'range' | 'choices' | 'turbo';

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
    /** Duration unit when not ticks (vanillas and range contracts trade in minutes). */
    duration_unit?: 't' | 'm';
    barrier?: TBarrierKind;
    /** High/Low ticks: which tick (1-5) must be the highest / lowest. */
    selected_tick?: boolean;
    /** Multipliers: multiplier choice, take profit / stop loss, deal cancellation. */
    multiplier?: boolean;
    stop_loss?: boolean;
    cancellation?: boolean;
    /** Rise/Fall: allow equals (CALLE / PUTE). */
    allow_equals?: boolean;
    group: TTradeGroup;
};

export type TTradeGroup =
    | 'Ups & Downs'
    | 'Highs & Lows'
    | 'Digits'
    | 'Accumulators'
    | 'Multipliers'
    | 'Options'
    | 'In/Out';

export const TRADE_TYPES: TTradeType[] = [
    {
        id: 'rise_fall',
        group: 'Ups & Downs',
        label: 'Rise/Fall',
        description: 'Win if the exit price is higher (Rise) or lower (Fall) than the entry price.',
        contracts: [
            { contract_type: 'CALL', label: 'Rise', side: 'up' },
            { contract_type: 'PUT', label: 'Fall', side: 'down' },
        ],
        duration: { min: 1, max: 10, default: 5 },
        allow_equals: true,
    },
    {
        id: 'even_odd',
        group: 'Digits',
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
        group: 'Digits',
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
        group: 'Digits',
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
        group: 'Accumulators',
        label: 'Accumulators',
        description:
            'Your stake grows by the growth rate every tick the price stays inside a range. If the price leaves the range, you lose the stake. Sell any time to take the profit.',
        contracts: [{ contract_type: 'ACCU', label: 'Buy', side: 'up' }],
        growth_rates: [0.01, 0.02, 0.03, 0.04, 0.05],
    },
    {
        id: 'higher_lower',
        group: 'Ups & Downs',
        label: 'Higher/Lower',
        description:
            'Win if the exit price is higher (Higher) or lower (Lower) than the barrier you set relative to the entry price.',
        contracts: [
            { contract_type: 'HIGHER', label: 'Higher', side: 'up' },
            { contract_type: 'LOWER', label: 'Lower', side: 'down' },
        ],
        duration: { min: 5, max: 10, default: 5 },
        barrier: 'offset',
    },
    {
        id: 'touch',
        group: 'Highs & Lows',
        label: 'Touch/No Touch',
        description: 'Win if the price touches (Touch) or never touches (No Touch) the barrier during the contract.',
        contracts: [
            { contract_type: 'ONETOUCH', label: 'Touch', side: 'up' },
            { contract_type: 'NOTOUCH', label: 'No Touch', side: 'down' },
        ],
        duration: { min: 5, max: 10, default: 5 },
        barrier: 'offset',
    },
    {
        id: 'multipliers',
        group: 'Multipliers',
        label: 'Multipliers',
        description:
            'Your profit or loss is the price change multiplied by the multiplier. You can never lose more than your stake. Set take profit / stop loss, or buy deal cancellation to get your stake back within a time window.',
        contracts: [
            { contract_type: 'MULTUP', label: 'Up', side: 'up' },
            { contract_type: 'MULTDOWN', label: 'Down', side: 'down' },
        ],
        multiplier: true,
        stop_loss: true,
        cancellation: true,
    },
    {
        id: 'turbos',
        group: 'Options',
        label: 'Turbos',
        description:
            'Win a payout per point if the price ends above (Up) or below (Down) the barrier, provided it never touches the barrier. A closer barrier pays more per point but is easier to hit.',
        contracts: [
            { contract_type: 'TURBOSLONG', label: 'Up', side: 'up' },
            { contract_type: 'TURBOSSHORT', label: 'Down', side: 'down' },
        ],
        duration: { min: 5, max: 10, default: 5 },
        barrier: 'turbo',
    },
    {
        id: 'vanillas',
        group: 'Options',
        label: 'Vanillas',
        description:
            'Call wins if the final price is above the strike, Put if it is below. The payout grows with every point past the strike.',
        contracts: [
            { contract_type: 'VANILLALONGCALL', label: 'Call', side: 'up' },
            { contract_type: 'VANILLALONGPUT', label: 'Put', side: 'down' },
        ],
        duration: { min: 1, max: 60, default: 1 },
        duration_unit: 'm',
        barrier: 'choices',
    },
    {
        id: 'high_low_ticks',
        group: 'Highs & Lows',
        label: 'High/Low Ticks',
        description: 'Win if the tick you pick is the highest (High Tick) or lowest (Low Tick) of the next 5 ticks.',
        contracts: [
            { contract_type: 'TICKHIGH', label: 'High Tick', side: 'up' },
            { contract_type: 'TICKLOW', label: 'Low Tick', side: 'down' },
        ],
        duration: { min: 5, max: 5, default: 5 },
        selected_tick: true,
    },
    {
        id: 'only_ups_downs',
        group: 'Ups & Downs',
        label: 'Only Ups/Only Downs',
        description: 'Win if every tick rises (Only Ups) or falls (Only Downs) for the whole contract.',
        contracts: [
            { contract_type: 'RUNHIGH', label: 'Only Ups', side: 'up' },
            { contract_type: 'RUNLOW', label: 'Only Downs', side: 'down' },
        ],
        duration: { min: 2, max: 5, default: 3 },
    },
    {
        id: 'asians',
        group: 'Ups & Downs',
        label: 'Asians',
        description: 'Win if the last tick is higher (Asian Rise) or lower (Asian Fall) than the average of all ticks.',
        contracts: [
            { contract_type: 'ASIANU', label: 'Asian Rise', side: 'up' },
            { contract_type: 'ASIAND', label: 'Asian Fall', side: 'down' },
        ],
        duration: { min: 5, max: 10, default: 5 },
    },
    {
        id: 'reset',
        group: 'Ups & Downs',
        label: 'Reset Call/Put',
        description:
            'Like Rise/Fall, but halfway through the barrier resets to the current price if that makes winning more likely.',
        contracts: [
            { contract_type: 'RESETCALL', label: 'Reset Call', side: 'up' },
            { contract_type: 'RESETPUT', label: 'Reset Put', side: 'down' },
        ],
        duration: { min: 5, max: 10, default: 5 },
    },
    {
        id: 'ends_between',
        group: 'In/Out',
        label: 'Ends Between/Outside',
        description:
            'Win if the price ends between (Ends Between) or outside (Ends Outside) the high and low barriers.',
        contracts: [
            { contract_type: 'EXPIRYRANGE', label: 'Ends Between', side: 'up' },
            { contract_type: 'EXPIRYMISS', label: 'Ends Outside', side: 'down' },
        ],
        duration: { min: 2, max: 60, default: 2 },
        duration_unit: 'm',
        barrier: 'range',
    },
    {
        id: 'stays_between',
        group: 'In/Out',
        label: 'Stays Between/Goes Outside',
        description:
            'Win if the price stays between the barriers for the whole contract (Stays Between), or touches one (Goes Outside).',
        contracts: [
            { contract_type: 'RANGE', label: 'Stays Between', side: 'up' },
            { contract_type: 'UPORDOWN', label: 'Goes Outside', side: 'down' },
        ],
        duration: { min: 2, max: 60, default: 2 },
        duration_unit: 'm',
        barrier: 'range',
    },
];

/** Trade type groups in menu order. */
export const TRADE_GROUPS: TTradeGroup[] = [
    'Ups & Downs',
    'Highs & Lows',
    'Digits',
    'Accumulators',
    'Multipliers',
    'Options',
    'In/Out',
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
    /** Multipliers */
    stop_loss?: number;
    multiplier?: number;
    /** Deal cancellation window, e.g. "5m" (multipliers; not together with stop loss). */
    cancellation?: string;
    /** Barriers for non-digit contracts (relative "+0.58" or absolute). */
    barrier?: string;
    barrier2?: string;
    /** High/Low ticks */
    selected_tick?: number;
    duration_unit?: 't' | 'm';
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
    stop_loss,
    multiplier,
    cancellation,
    barrier,
    barrier2,
    selected_tick,
    duration_unit,
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
    } else if (contract_type === 'MULTUP' || contract_type === 'MULTDOWN') {
        parameters.multiplier = multiplier ?? 100;
        const limit_order: Record<string, number> = {};
        if (take_profit && take_profit > 0) limit_order.take_profit = take_profit;
        // Deriv accepts either stop loss or deal cancellation, not both.
        if (stop_loss && stop_loss > 0 && !cancellation) limit_order.stop_loss = stop_loss;
        if (Object.keys(limit_order).length) parameters.limit_order = limit_order;
        if (cancellation) parameters.cancellation = cancellation;
    } else {
        parameters.duration = duration ?? 1;
        parameters.duration_unit = duration_unit ?? 't';
    }
    if (contract_type.startsWith('DIGIT') && !['DIGITEVEN', 'DIGITODD'].includes(contract_type)) {
        parameters.barrier = String(digit ?? 5);
    } else if (barrier !== undefined && barrier !== '') {
        parameters.barrier = barrier;
        if (barrier2 !== undefined && barrier2 !== '') parameters.barrier2 = barrier2;
    }
    if (selected_tick !== undefined) parameters.selected_tick = selected_tick;
    return parameters;
};

/** Profit if the contract wins, as a percentage of the stake. */
export const getReturnPercent = (stake: number, payout: number) =>
    stake > 0 && payout > 0 ? ((payout - stake) / stake) * 100 : 0;
