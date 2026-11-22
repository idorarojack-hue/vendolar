/**
 * Build a real Bot Builder bot from one of the bundled strategy templates (the same templates the
 * Quick Strategy form uses) and load it into the workspace.
 */
import ApiHelpers from '@/external/bot-skeleton/services/api/api-helpers';

export type TStrategyKey =
    | 'MARTINGALE'
    | 'D_ALEMBERT'
    | 'OSCARS_GRIND'
    | 'REVERSE_MARTINGALE'
    | 'REVERSE_D_ALEMBERT'
    | 'STRATEGY_1_3_2_6';

export const STRATEGY_LABELS: Record<TStrategyKey, string> = {
    MARTINGALE: 'Martingale',
    D_ALEMBERT: "D'Alembert",
    OSCARS_GRIND: "Oscar's Grind",
    REVERSE_MARTINGALE: 'Reverse Martingale',
    REVERSE_D_ALEMBERT: "Reverse D'Alembert",
    STRATEGY_1_3_2_6: '1-3-2-6',
};

export type TBotTradeType = 'callput' | 'evenodd' | 'overunder' | 'matchesdiffers';

export type TBotConfig = {
    strategy: TStrategyKey;
    symbol: string;
    tradetype: TBotTradeType;
    /** Contract to buy: CALL, PUT, DIGITEVEN, DIGITODD, DIGITOVER, DIGITUNDER, DIGITMATCH, DIGITDIFF. */
    contract: string;
    prediction?: number;
    stake: number;
    duration: number;
    profit: number;
    loss: number;
    /** Martingale multiplier (Martingale / Reverse Martingale). */
    size?: number;
    /** Step unit (D'Alembert / Reverse D'Alembert). */
    unit?: number;
    max_stake?: number;
};

type TQuickStrategyStore = {
    setSelectedStrategy: (key: string) => void;
    onSubmit: (data: Record<string, string | number | boolean>) => Promise<void>;
};

export class BotLoadError extends Error {}

/** Load a bot into the Bot Builder. Rejects with a readable message if the builder isn't ready. */
export const loadBot = async (quick_strategy: TQuickStrategyStore, config: TBotConfig, action: 'LOAD' | 'RUN' = 'LOAD') => {
    // api-helpers.js is untyped; `instance` is set once the Bot Builder has started.
    const helpers = (ApiHelpers as unknown as { instance?: { contracts_for?: unknown } }).instance;
    if (!helpers?.contracts_for || !(window as any).Blockly?.derivWorkspace) {
        throw new BotLoadError('The Bot Builder is still starting. Please wait a moment and try again.');
    }
    quick_strategy.setSelectedStrategy(config.strategy);
    await quick_strategy.onSubmit({
        symbol: config.symbol,
        tradetype: config.tradetype,
        type: config.contract,
        durationtype: 't',
        duration: String(config.duration),
        stake: String(config.stake),
        profit: String(config.profit),
        loss: String(config.loss),
        size: String(config.size ?? 2),
        unit: String(config.unit ?? 1),
        max_stake: config.max_stake ?? config.stake * 8,
        boolean_max_stake: config.max_stake !== undefined,
        last_digit_prediction: config.prediction ?? 1,
        action,
    });
};
