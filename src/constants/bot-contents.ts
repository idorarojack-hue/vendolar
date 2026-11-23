type TTabsTitle = {
    [key: string]: string | number;
};

type TDashboardTabIndex = {
    [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
    WORKSPACE: 'Workspace',
    CHART: 'Chart',
});

/**
 * Vindolar navigation, in display order. This list is the single source of truth:
 * tab index (DBOT_TABS), element id (TAB_IDS) and url hash (TAB_HASHES) all derive from it.
 * pages/main/main.tsx renders one tab per entry, in the same order.
 */
export const NAV_TABS = [
    { key: 'DASHBOARD', id: 'id-dbot-dashboard', hash: 'dashboard', label: 'Dashboard' },
    { key: 'BOT_BUILDER', id: 'id-bot-builder', hash: 'bot_builder', label: 'Bot Builder' },
    { key: 'DCIRCLES', id: 'id-dcircles', hash: 'dcircles', label: 'DCircles' },
    { key: 'AUTO_STRATEGIES', id: 'id-auto-strategies', hash: 'auto_strategies', label: 'Auto Trading' },
    { key: 'RECOVERY_TRADER', id: 'id-recovery-trader', hash: 'recovery_trader', label: 'TickPulse' },
    { key: 'STRATEGY_TESTER', id: 'id-strategy-tester', hash: 'strategy_tester', label: 'Confluence AI' },
    { key: 'MANUAL_TRADER', id: 'id-manual-trader', hash: 'manual_trader', label: 'Manual Trader' },
    { key: 'BULK_TRADER', id: 'id-bulk-trader', hash: 'bulk_trader', label: 'Bulk Trader' },
    { key: 'PATTERN_BOTS', id: 'id-pattern-bots', hash: 'pattern_bots', label: 'Premium AI Bots' },
    { key: 'FREE_BOTS', id: 'id-free-bots', hash: 'free_bots', label: 'Free Bots' },
    { key: 'SIGNALS', id: 'id-signals', hash: 'signals', label: 'Signal AI' },
    { key: 'COPY_TRADER', id: 'id-copy-trader', hash: 'copy_trader', label: 'Copy Trader' },
    { key: 'ANALYSIS_TOOLS', id: 'id-analysis-tools', hash: 'analysis_tools', label: 'Analysis Tools' },
    { key: 'SPEED_TRADER', id: 'id-speed-trader', hash: 'speed_trader', label: 'Speedbot' },
    { key: 'AUTOMATED', id: 'id-automated', hash: 'automated', label: 'Automated' },
    { key: 'CHART', id: 'id-charts', hash: 'chart', label: 'Chart' },
    { key: 'QUICK_BOT', id: 'id-quick-bot', hash: 'quick_bot', label: 'Premium Bots' },
    { key: 'HEDGING_TOOL', id: 'id-hedging-tool', hash: 'hedging_tool', label: 'Hedging' },
    { key: 'MARKET_SCANNER', id: 'id-market-scanner', hash: 'market_scanner', label: 'Pulse AI Scanner' },
    { key: 'REPORTS', id: 'id-reports', hash: 'reports', label: 'Reports' },
    { key: 'TUTORIAL', id: 'id-tutorials', hash: 'tutorial', label: 'Tutorials' },
] as const;

export type TNavTabKey = (typeof NAV_TABS)[number]['key'];

export const DBOT_TABS: TDashboardTabIndex = Object.freeze(
    Object.fromEntries(NAV_TABS.map((tab, index) => [tab.key, index]))
) as Record<TNavTabKey, number>;

export const MAX_STRATEGIES = 10;

export const TAB_IDS: string[] = NAV_TABS.map(tab => tab.id);

export const TAB_HASHES: string[] = NAV_TABS.map(tab => tab.hash);

// Last tab in the navigation bar; used for the mobile scroll shadow.
export const LAST_TAB_ID = TAB_IDS[TAB_IDS.length - 1];

export const DEBOUNCE_INTERVAL_TIME = 500;
