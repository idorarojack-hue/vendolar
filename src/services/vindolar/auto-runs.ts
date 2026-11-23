/**
 * Deriv server-side automation (`auto_*`): Deriv itself runs a staking strategy (Martingale,
 * D'Alembert, …) on a contract template and stops at the take profit / stop loss you set.
 * Strategies are read on the public connection; runs need the logged-in connection.
 */
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { marketData } from './market-data';

export type TStrategyParameter = {
    name: string;
    type: 'string' | 'number' | 'integer';
    description?: string;
    required: boolean;
    maximum?: number;
    exclusive_minimum?: number;
};

export type TServerStrategy = {
    strategy_id: string;
    display_name: string;
    description: string;
    supported_contract_types: string[];
    parameters: TStrategyParameter[];
};

export type TContractTemplate = {
    amount: number;
    basis: 'stake';
    contract_type: string;
    currency: string;
    underlying_symbol: string;
    duration?: number;
    duration_unit?: 't';
    barrier?: string;
    growth_rate?: number;
};

export type TRun = {
    run_id: string;
    strategy_id: string;
    status: 'running' | 'paused' | 'stopped' | string;
    stop_reason?: string;
    stop_reason_code?: string;
    start_time?: number;
    stop_time?: number;
    contract_template?: TContractTemplate;
    strategy_parameters?: Record<string, unknown>;
    contracts?: unknown;
    total_stake?: number | string;
    total_payout?: number | string;
};

type TApi = NonNullable<typeof api_base.api>;

const getApi = (): TApi => {
    const api = api_base.api;
    if (!api || !api_base.is_authorized) throw new Error('Please log in to use server bots.');
    return api;
};

const send = (request: Record<string, unknown>) =>
    (getApi().send(request) as unknown as Promise<any>).catch(e => {
        throw new Error(e?.error?.message ?? e?.message ?? 'Request failed');
    });

/** Strategies Deriv can run for you, with their parameters (from each strategy's JSON schema). */
export const listServerStrategies = async (): Promise<TServerStrategy[]> => {
    const response = await marketData.send({ auto_list_strategies: 1 });
    return (response?.auto_list_strategies?.strategies ?? []).map((s: any) => {
        const schema = s.parameters ?? {};
        const required: string[] = schema.required ?? [];
        return {
            strategy_id: s.strategy_id,
            display_name: s.display_name ?? s.strategy_id,
            description: s.description ?? '',
            supported_contract_types: s.supported_contract_types ?? [],
            parameters: Object.entries(schema.properties ?? {}).map(([name, p]: [string, any]) => ({
                name,
                type: p.type ?? 'string',
                description: p.description,
                required: required.includes(name),
                maximum: p.maximum,
                exclusive_minimum: p.exclusiveMinimum,
            })),
        };
    });
};

/** Start a run. Strategy parameters typed "string" in the schema are sent as strings. */
export const startRun = async (
    strategy: TServerStrategy,
    template: TContractTemplate,
    values: Record<string, number | undefined>
): Promise<TRun> => {
    const strategy_parameters: Record<string, unknown> = {};
    strategy.parameters.forEach(p => {
        const value = values[p.name];
        if (value === undefined || Number.isNaN(value)) return;
        strategy_parameters[p.name] =
            p.type === 'string' ? String(value) : p.type === 'integer' ? Math.round(value) : value;
    });
    const response = await send({
        auto_start: 1,
        strategy_id: strategy.strategy_id,
        strategy_parameters,
        contract_template: template,
    });
    return response.auto_start;
};

export const listRuns = async (): Promise<TRun[]> => {
    const response = await send({ auto_list: 1 });
    return response?.auto_list?.runs ?? [];
};

export const pauseRun = async (run_id: string): Promise<TRun> => (await send({ auto_pause: 1, run_id })).auto_pause;
export const resumeRun = async (run_id: string): Promise<TRun> => (await send({ auto_resume: 1, run_id })).auto_resume;
export const stopRun = async (run_id: string): Promise<TRun> => (await send({ auto_stop: 1, run_id })).auto_stop;

/** Follow a run live (`auto_get` with subscribe). Returns a stop function. */
export const watchRun = (run_id: string, onUpdate: (run: TRun) => void) => {
    const api = getApi();
    let subscription_id: string | undefined;
    let is_active = true;
    const listener = api.onMessage().subscribe((message: any) => {
        const data = message?.data ?? message;
        const run = data?.auto_get;
        if (data?.msg_type !== 'auto_get' || !run || run.run_id !== run_id) return;
        onUpdate(run);
    });
    (api.send({ auto_get: 1, run_id, subscribe: 1 }) as unknown as Promise<any>)
        .then(response => {
            subscription_id = response?.subscription?.id;
            if (!is_active && subscription_id) api.send({ forget: subscription_id });
        })
        .catch(() => undefined);
    return () => {
        is_active = false;
        listener.unsubscribe();
        if (subscription_id) (api.send({ forget: subscription_id }) as unknown as Promise<any>).catch(() => undefined);
    };
};

export const runProfit = (run: TRun) => Number(run.total_payout ?? 0) - Number(run.total_stake ?? 0);
export const runContractCount = (run: TRun) =>
    Array.isArray(run.contracts) ? run.contracts.length : Number(run.contracts ?? 0) || 0;
