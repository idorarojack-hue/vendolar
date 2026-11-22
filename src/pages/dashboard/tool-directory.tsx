import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS, TNavTabKey } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import {
    LabelPairedArrowsRotateCaptionRegularIcon,
    LabelPairedChartCandlestickCaptionRegularIcon,
    LabelPairedChartLineUpDownCaptionRegularIcon,
    LabelPairedChartMixedCaptionRegularIcon,
    LabelPairedChartTrendUpCaptionRegularIcon,
    LabelPairedFileChartColumnCaptionRegularIcon,
    LabelPairedFolderOpenCaptionRegularIcon,
    LabelPairedGaugeMaxCaptionRegularIcon,
    LabelPairedGridCaptionRegularIcon,
    LabelPairedHandGestureTapRightCaptionRegularIcon,
    LabelPairedLightChartLineUpDownClockCaptionRegularIcon,
    LabelPairedMagnifyingGlassPlusCaptionRegularIcon,
    LabelPairedPlaybackSpeedCaptionRegularIcon,
    LabelPairedPuzzlePieceTwoCaptionRegularIcon,
    LabelPairedShieldCheckCaptionRegularIcon,
    LabelPairedSignalCaptionRegularIcon,
    LabelPairedSlidersCaptionRegularIcon,
    LabelPairedSquareListCaptionRegularIcon,
    LabelPairedUsersCaptionRegularIcon,
} from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import './tool-directory.scss';

type TCategory = 'Trading' | 'Analysis' | 'Automation' | 'Risk Management';
type TIcon = typeof LabelPairedGridCaptionRegularIcon;
type TTool = {
    /** Tab to open, or 'LOAD' for the load-a-strategy dialog. */
    key: TNavTabKey | 'LOAD';
    name: string;
    description: string;
    action: string;
    tone: string;
    Icon: TIcon;
    categories: TCategory[];
};

const TOOLS: TTool[] = [
    { key: 'MARKET_SCANNER', name: 'Pulse AI Scanner', description: 'Rank every market live and trade the first one that matches your rules.', action: 'Open Scanner', tone: 'teal', Icon: LabelPairedMagnifyingGlassPlusCaptionRegularIcon, categories: ['Analysis', 'Automation'] },
    { key: 'FREE_BOTS', name: 'Free Bots', description: 'Ready-made strategies you can load in one click.', action: 'Explore', tone: 'blue', Icon: LabelPairedGridCaptionRegularIcon, categories: ['Automation'] },
    { key: 'BOT_BUILDER', name: 'Bot Builder', description: 'Build, edit and run your own strategy with blocks.', action: 'Open Builder', tone: 'purple', Icon: LabelPairedPuzzlePieceTwoCaptionRegularIcon, categories: ['Automation'] },
    { key: 'LOAD', name: 'Load a Strategy', description: 'Open a bot file from your computer or Google Drive.', action: 'Load', tone: 'amber', Icon: LabelPairedFolderOpenCaptionRegularIcon, categories: ['Automation'] },
    { key: 'SPEED_TRADER', name: 'Speedbot', description: 'Trade on a fixed rhythm, every few ticks.', action: 'Open', tone: 'red', Icon: LabelPairedPlaybackSpeedCaptionRegularIcon, categories: ['Trading'] },
    { key: 'ANALYSIS_TOOLS', name: 'Analysis Tools', description: 'Digit statistics and market patterns for all 13 markets.', action: 'Analyze', tone: 'green', Icon: LabelPairedChartMixedCaptionRegularIcon, categories: ['Analysis'] },
    { key: 'CHART', name: 'Charts', description: 'Live price charts with indicators for every market.', action: 'Open Charts', tone: 'sky', Icon: LabelPairedChartCandlestickCaptionRegularIcon, categories: ['Analysis'] },
    { key: 'COPY_TRADER', name: 'Copy Trader', description: 'Copy another trader’s contracts, when Deriv supports it.', action: 'Set Up', tone: 'violet', Icon: LabelPairedUsersCaptionRegularIcon, categories: ['Trading'] },
    { key: 'MANUAL_TRADER', name: 'Manual Trader', description: 'Place trades yourself with full control and live payouts.', action: 'Trade', tone: 'pink', Icon: LabelPairedHandGestureTapRightCaptionRegularIcon, categories: ['Trading'] },
    { key: 'BULK_TRADER', name: 'Bulk Trader', description: 'Place several contracts in one go.', action: 'Open', tone: 'teal', Icon: LabelPairedSquareListCaptionRegularIcon, categories: ['Trading'] },
    { key: 'AUTOMATED', name: 'Automated', description: 'Hands-free rules: “if this happens, trade that”.', action: 'Open', tone: 'purple', Icon: LabelPairedSlidersCaptionRegularIcon, categories: ['Automation'] },
    { key: 'PATTERN_BOTS', name: 'Premium AI Bots', description: 'Eight preset digit-pattern bots with stop-loss limits.', action: 'View', tone: 'amber', Icon: LabelPairedChartLineUpDownCaptionRegularIcon, categories: ['Automation'] },
    { key: 'HEDGING_TOOL', name: 'Hedging', description: 'Balance positions and see every outcome before you buy.', action: 'Open', tone: 'teal', Icon: LabelPairedShieldCheckCaptionRegularIcon, categories: ['Trading', 'Risk Management'] },
    { key: 'RECOVERY_TRADER', name: 'TickPulse', description: 'Switch market after a loss, always inside your stop loss.', action: 'Open', tone: 'orange', Icon: LabelPairedArrowsRotateCaptionRegularIcon, categories: ['Automation', 'Risk Management'] },
    { key: 'AUTO_STRATEGIES', name: 'Auto Trading', description: 'Trend and breakout rules for Rise/Fall.', action: 'Open', tone: 'green', Icon: LabelPairedChartTrendUpCaptionRegularIcon, categories: ['Automation'] },
    { key: 'STRATEGY_TESTER', name: 'Confluence AI', description: 'Replay a strategy on real past ticks before risking money.', action: 'Test', tone: 'sky', Icon: LabelPairedLightChartLineUpDownClockCaptionRegularIcon, categories: ['Analysis', 'Risk Management'] },
    { key: 'SIGNALS', name: 'Signal AI', description: 'Watch one market or every market and read the last ticks in a live log.', action: 'Analyze', tone: 'pink', Icon: LabelPairedSignalCaptionRegularIcon, categories: ['Analysis'] },
    { key: 'QUICK_BOT', name: 'Premium Bots', description: 'Fill in a short form and get a working bot.', action: 'Build', tone: 'red', Icon: LabelPairedGaugeMaxCaptionRegularIcon, categories: ['Automation'] },
    { key: 'REPORTS', name: 'Reports', description: 'Profit table, statement and your daily loss limit.', action: 'View', tone: 'blue', Icon: LabelPairedFileChartColumnCaptionRegularIcon, categories: ['Risk Management'] },
];

const FILTERS: { id: 'All' | TCategory; label: string }[] = [
    { id: 'All', label: 'All Tools' },
    { id: 'Trading', label: 'Trading' },
    { id: 'Analysis', label: 'Analysis' },
    { id: 'Automation', label: 'Automation' },
    { id: 'Risk Management', label: 'Risk Management' },
];

const ToolDirectory = observer(() => {
    const { dashboard, load_modal } = useStore();
    const { isDesktop } = useDevice();
    const [filter, setFilter] = useState<'All' | TCategory>('All');
    const tools = TOOLS.filter(tool => filter === 'All' || tool.categories.includes(filter));

    const open = (tool: TTool) => {
        if (tool.key === 'LOAD') {
            load_modal.toggleLoadModal();
            load_modal.setActiveTabIndex(isDesktop ? 1 : 0);
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            return;
        }
        dashboard.setActiveTab(DBOT_TABS[tool.key]);
    };

    return (
        <section className='vd-tools' aria-labelledby='vd-tools-title'>
            <div className='vd-tools__head'>
                <div>
                    <h2 id='vd-tools-title' className='vd-tools__title'>
                        {localize('Tools & Features')}
                    </h2>
                    <p>{localize('Everything in your workspace, in one place')}</p>
                </div>
                <div className='vd-tools__filters' role='group' aria-label={localize('Filter tools')}>
                    {FILTERS.map(({ id, label }) => (
                        <button
                            key={id}
                            type='button'
                            aria-pressed={filter === id}
                            className={filter === id ? 'is-active' : undefined}
                            onClick={() => setFilter(id)}
                        >
                            {localize(label)}
                        </button>
                    ))}
                </div>
            </div>
            {/* id is used by the onboarding tour to highlight the dashboard tools */}
            <ul className='vd-tools__grid' id='tab__dashboard__table__tiles'>
                {tools.map(tool => (
                    <li key={tool.key}>
                        <button type='button' onClick={() => open(tool)}>
                            <span className={`vd-dash__icon vd-dash__icon--${tool.tone}`} aria-hidden='true'>
                                <tool.Icon height='24px' width='24px' fill='currentColor' />
                            </span>
                            <span className='vd-tools__text'>
                                <strong>{localize(tool.name)}</strong>
                                <span>{localize(tool.description)}</span>
                            </span>
                            <em>
                                {localize(tool.action)} <span aria-hidden='true'>→</span>
                            </em>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
});

export default ToolDirectory;
