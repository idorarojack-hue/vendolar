import React from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { loadBot, STRATEGY_LABELS, TBotConfig } from '@/services/vindolar/bot-loader';
import { LabelPairedArrowUpRightCaptionRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import '@/components/vindolar/vindolar.scss';
import '../analysis-tools/analysis-tools.scss';

type TFreeBot = { id: string; name: string; description: string; config: TBotConfig; contract_label: string; market_label: string };

/** Vindolar's free bots, built from the bundled strategy templates. */
const FREE_BOTS: TFreeBot[] = [
    {
        id: 'even-steady',
        name: 'Even Steady',
        description: 'Buys Even on every run. Doubles the stake after a loss (capped at max stake), resets after a win.',
        contract_label: 'Even · 1 tick',
        market_label: 'Volatility 100 Index',
        config: { strategy: 'MARTINGALE', symbol: 'R_100', tradetype: 'evenodd', contract: 'DIGITEVEN', stake: 1, duration: 1, profit: 5, loss: 15, size: 2, max_stake: 8 },
    },
    {
        id: 'odd-steady',
        name: 'Odd Steady',
        description: 'Buys Odd on every run with the same capped martingale as Even Steady.',
        contract_label: 'Odd · 1 tick',
        market_label: 'Volatility 100 (1s) Index',
        config: { strategy: 'MARTINGALE', symbol: '1HZ100V', tradetype: 'evenodd', contract: 'DIGITODD', stake: 1, duration: 1, profit: 5, loss: 15, size: 2, max_stake: 8 },
    },
    {
        id: 'over-two-grinder',
        name: 'Over 2 Grinder',
        description: "Buys Over 2 using Oscar's Grind: raises the stake by one unit only after wins, aiming for one unit of profit per cycle.",
        contract_label: 'Over 2 · 1 tick',
        market_label: 'Volatility 50 Index',
        config: { strategy: 'OSCARS_GRIND', symbol: 'R_50', tradetype: 'overunder', contract: 'DIGITOVER', prediction: 2, stake: 0.5, duration: 1, profit: 5, loss: 10, max_stake: 5 },
    },
    {
        id: 'under-seven-grinder',
        name: 'Under 7 Grinder',
        description: "Buys Under 7 using Oscar's Grind on Volatility 25.",
        contract_label: 'Under 7 · 1 tick',
        market_label: 'Volatility 25 Index',
        config: { strategy: 'OSCARS_GRIND', symbol: 'R_25', tradetype: 'overunder', contract: 'DIGITUNDER', prediction: 7, stake: 0.5, duration: 1, profit: 5, loss: 10, max_stake: 5 },
    },
    {
        id: 'rise-stepper',
        name: 'Rise Stepper',
        description: "Buys Rise for 5 ticks using D'Alembert: adds one unit after a loss, removes one after a win.",
        contract_label: 'Rise · 5 ticks',
        market_label: 'Volatility 100 (1s) Index',
        config: { strategy: 'D_ALEMBERT', symbol: '1HZ100V', tradetype: 'callput', contract: 'CALL', stake: 1, duration: 5, profit: 5, loss: 15, unit: 1, max_stake: 6 },
    },
    {
        id: 'fall-stepper',
        name: 'Fall Stepper',
        description: "Buys Fall for 5 ticks using D'Alembert, the mirror of Rise Stepper.",
        contract_label: 'Fall · 5 ticks',
        market_label: 'Volatility 75 (1s) Index',
        config: { strategy: 'D_ALEMBERT', symbol: '1HZ75V', tradetype: 'callput', contract: 'PUT', stake: 1, duration: 5, profit: 5, loss: 15, unit: 1, max_stake: 6 },
    },
    {
        id: 'sequence-even',
        name: 'Sequence 1-3-2-6',
        description: 'Buys Even following the 1-3-2-6 stake sequence after wins and starts over after any loss.',
        contract_label: 'Even · 1 tick',
        market_label: 'Volatility 75 Index',
        config: { strategy: 'STRATEGY_1_3_2_6', symbol: 'R_75', tradetype: 'evenodd', contract: 'DIGITEVEN', stake: 0.5, duration: 1, profit: 5, loss: 10 },
    },
    {
        id: 'differs-climber',
        name: 'Differs Climber',
        description: 'Buys Differs 5 with Reverse Martingale: doubles the stake after a win, resets after a loss.',
        contract_label: 'Differs 5 · 1 tick',
        market_label: 'Volatility 50 (1s) Index',
        config: { strategy: 'REVERSE_MARTINGALE', symbol: '1HZ50V', tradetype: 'matchesdiffers', contract: 'DIGITDIFF', prediction: 5, stake: 1, duration: 1, profit: 5, loss: 10, size: 2 },
    },
];

const FreeBots = observer(() => {
    const { quick_strategy, dashboard } = useStore();
    const [loading, setLoading] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const load = async (bot: TFreeBot) => {
        setError(null);
        setLoading(bot.id);
        try {
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            await loadBot(quick_strategy, bot.config);
        } catch (e: any) {
            dashboard.setActiveTab(DBOT_TABS.FREE_BOTS);
            setError(e?.message ?? localize('The bot could not be loaded.'));
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Bots')}
                title={localize('Free Bots')}
                subtitle={localize('Ready-made bots. Loading one opens it in the Bot Builder, where you can read every block before pressing Run.')}
            />
            <p className='vd-page__note'>
                {localize(
                    'Every bot has a take profit and stop loss already set. Start on your demo account, and remember that stake-sizing systems change how you win or lose, not your odds.'
                )}
            </p>
            {error && (
                <p role='alert' className='vd-message vd-message--error'>
                    {error}
                </p>
            )}
            <div className='vd-page__grid vd-preset-grid'>
                {FREE_BOTS.map(bot => (
                    <article key={bot.id} className='vd-card vd-preset'>
                        <div className='vd-preset__top'>
                            <span className='vd-field__label'>{localize('Free bot')}</span>
                            <span className='vd-card__badge vd-card__badge--teal'>{localize(STRATEGY_LABELS[bot.config.strategy])}</span>
                        </div>
                        <h3 className='vd-card__title'>{localize(bot.name)}</h3>
                        <p className='vd-card__text'>{localize(bot.description)}</p>
                        <dl className='vd-preset__facts'>
                            <div>
                                <dt>{localize('Market')}</dt>
                                <dd>{bot.market_label}</dd>
                            </div>
                            <div>
                                <dt>{localize('Contract')}</dt>
                                <dd>{bot.contract_label}</dd>
                            </div>
                            <div>
                                <dt>{localize('Stake / TP / SL')}</dt>
                                <dd>
                                    {bot.config.stake} / {bot.config.profit} / {bot.config.loss}
                                </dd>
                            </div>
                        </dl>
                        <button type='button' className='vd-primary-button vd-preset__open' disabled={!!loading} onClick={() => load(bot)}>
                            {loading === bot.id ? localize('Loading…') : localize('Load bot')}
                            <LabelPairedArrowUpRightCaptionRegularIcon height='16px' width='16px' fill='currentColor' />
                        </button>
                    </article>
                ))}
            </div>
        </div>
    );
});

export default FreeBots;
