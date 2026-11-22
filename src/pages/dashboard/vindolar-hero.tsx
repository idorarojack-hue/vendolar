import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import RobotArt from '@/components/vindolar/robot-art';
import { DBOT_TABS, NAV_TABS } from '@/constants/bot-contents';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { useStore } from '@/hooks/useStore';
import {
    LabelPairedArrowUpRightCaptionRegularIcon,
    LabelPairedClockThreeCaptionRegularIcon,
    LabelPairedFolderOpenCaptionRegularIcon,
    LabelPairedGlobeCaptionRegularIcon,
    LabelPairedGrid2CaptionRegularIcon,
    LabelPairedGridCaptionRegularIcon,
} from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import './vindolar-hero.scss';

const getGreeting = (hour: number) => {
    if (hour < 12) return localize('Good morning');
    if (hour < 18) return localize('Good afternoon');
    return localize('Good evening');
};

/** Free bots on the Free Bots tab. */
const FREE_BOT_COUNT = 8;
/** Every tab except Dashboard and Tutorials is a tool. */
const TOOL_COUNT = NAV_TABS.filter(tab => tab.key !== 'DASHBOARD' && tab.key !== 'TUTORIAL').length;

const OVERVIEW_SYMBOL = '1HZ100V';
/** Volatility 100 (1s) ticks once a second, so a window of N minutes is N × 60 ticks. */
const TIMEFRAMES = [
    { label: '1M', ticks: 60 },
    { label: '5M', ticks: 300 },
    { label: '15M', ticks: 900 },
    { label: '1H', ticks: 3600 },
];

const CHART_W = 320;
const CHART_H = 120;
const MAX_POINTS = 240;

const formatTime = (epoch: number) => {
    const d = new Date(epoch * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const MarketOverview = () => {
    const [frame, setFrame] = React.useState(TIMEFRAMES[1]);
    const ticks = useTicks(OVERVIEW_SYMBOL, frame.ticks);

    const step = Math.max(1, Math.ceil(ticks.length / MAX_POINTS));
    const shown = ticks.filter((_, i) => i % step === 0 || i === ticks.length - 1);
    const first = ticks[0];
    const last = ticks[ticks.length - 1];
    const change = first && last ? last.quote - first.quote : 0;
    const change_pct = first && last ? (change / first.quote) * 100 : 0;
    const up = change >= 0;

    const quotes = shown.map(t => t.quote);
    const low = Math.min(...quotes);
    const high = Math.max(...quotes);
    const span = high - low || 1;
    const x = (i: number) => (shown.length < 2 ? 0 : (i / (shown.length - 1)) * CHART_W);
    const y = (q: number) => CHART_H - ((q - low) / span) * (CHART_H - 12) - 6;
    const line = shown.map((t, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(t.quote).toFixed(1)}`).join(' ');
    const area = shown.length > 1 ? `${line} L${CHART_W} ${CHART_H} L0 ${CHART_H} Z` : '';
    const levels = [0, 1, 2, 3].map(i => high - (span * i) / 3);
    const times = shown.length > 1 ? [0, 0.25, 0.5, 0.75, 1].map(p => shown[Math.round(p * (shown.length - 1))].epoch) : [];

    return (
        <aside className='vd-dash__market' aria-label={localize('Market overview')}>
            <div className='vd-dash__market-head'>
                <h2>{localize('Market Overview')}</h2>
                <div className='vd-dash__frames' role='group' aria-label={localize('Time window')}>
                    {TIMEFRAMES.map(tf => (
                        <button
                            key={tf.label}
                            type='button'
                            aria-pressed={frame.label === tf.label}
                            className={classNames({ 'is-active': frame.label === tf.label })}
                            onClick={() => setFrame(tf)}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
            </div>
            <p className='vd-dash__market-name'>{localize('Volatility 100 (1s)')}</p>
            <p className='vd-dash__market-price'>
                {last ? last.quote.toFixed(2) : '—'}
                {first && last && (
                    <span className={up ? 'is-up' : 'is-down'}>
                        {up ? '+' : ''}
                        {change.toFixed(2)} ({up ? '+' : ''}
                        {change_pct.toFixed(2)}%)
                    </span>
                )}
            </p>
            <div className='vd-dash__chart'>
                {shown.length > 1 ? (
                    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio='none' className={up ? 'is-up' : 'is-down'} aria-hidden='true'>
                        <path d={area} className='vd-dash__chart-area' />
                        <path d={line} className='vd-dash__chart-line' vectorEffect='non-scaling-stroke' />
                    </svg>
                ) : (
                    <p className='vd-dash__chart-empty'>{localize('Loading prices…')}</p>
                )}
                {shown.length > 1 && (
                    <ul className='vd-dash__levels' aria-hidden='true'>
                        {levels.map(level => (
                            <li key={level}>{level.toFixed(2)}</li>
                        ))}
                    </ul>
                )}
                {last && shown.length > 1 && (
                    <span className={classNames('vd-dash__last', up ? 'is-up' : 'is-down')} style={{ top: `${(y(last.quote) / CHART_H) * 100}%` }}>
                        {last.quote.toFixed(2)}
                    </span>
                )}
            </div>
            <ul className='vd-dash__times' aria-hidden='true'>
                {times.map((epoch, i) => (
                    <li key={`${epoch}-${i}`}>{formatTime(epoch)}</li>
                ))}
            </ul>
        </aside>
    );
};

type TStat = {
    value: string | number;
    title: string;
    note: string;
    tone: string;
    icon: React.ReactNode;
    onClick: () => void;
};

const VindolarHero = observer(() => {
    const { dashboard, load_modal } = useStore();
    const { isDesktop } = useDevice();
    const { setActiveTab } = dashboard;
    const { symbols } = useVolatilitySymbols();

    const openLoad = () => {
        load_modal.toggleLoadModal();
        load_modal.setActiveTabIndex(isDesktop ? 1 : 0);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const icon_props = { height: '24px', width: '24px', fill: 'currentColor' };
    const stats: TStat[] = [
        {
            value: FREE_BOT_COUNT,
            title: localize('Free Bots'),
            note: localize('Ready to load'),
            tone: 'blue',
            icon: <LabelPairedGridCaptionRegularIcon {...icon_props} />,
            onClick: () => setActiveTab(DBOT_TABS.FREE_BOTS),
        },
        {
            value: TOOL_COUNT,
            title: localize('Trading Tools'),
            note: localize('In one workspace'),
            tone: 'purple',
            icon: <LabelPairedGrid2CaptionRegularIcon {...icon_props} />,
            onClick: () => document.getElementById('vd-tools-title')?.scrollIntoView({ behavior: 'smooth' }),
        },
        {
            value: symbols.length || '—',
            title: localize('Volatility Markets'),
            note: localize('Live markets'),
            tone: 'teal',
            icon: <LabelPairedGlobeCaptionRegularIcon {...icon_props} />,
            onClick: () => setActiveTab(DBOT_TABS.ANALYSIS_TOOLS),
        },
        {
            value: '24/7',
            title: localize('Synthetic Markets'),
            note: localize('Always open'),
            tone: 'violet',
            icon: <LabelPairedClockThreeCaptionRegularIcon {...icon_props} />,
            onClick: () => setActiveTab(DBOT_TABS.CHART),
        },
    ];

    return (
        <>
            <section className='vd-dash__hero' aria-labelledby='vd-hero-title'>
                <p className='vd-dash__live'>
                    <span aria-hidden='true' />
                    {localize('Markets Live')}
                </p>
                <div className='vd-dash__intro'>
                    <p className='vd-dash__eyebrow'>{localize('Vindolar Workspace')}</p>
                    <h1 id='vd-hero-title'>
                        {getGreeting(new Date().getHours())}, <em>{localize('trader')}</em>
                    </h1>
                    <p className='vd-dash__lead'>
                        {localize('Build bots, test them on real ticks and trade with limits you set. Plan the trade, then trade the plan.')}
                    </p>
                    <div className='vd-dash__actions'>
                        <button type='button' className='vd-dash__btn vd-dash__btn--orange' onClick={() => setActiveTab(DBOT_TABS.FREE_BOTS)}>
                            {localize('Browse Free Bots')}
                            <span aria-hidden='true'>→</span>
                        </button>
                        <button type='button' className='vd-dash__btn vd-dash__btn--dark' onClick={openLoad}>
                            <LabelPairedFolderOpenCaptionRegularIcon height='18px' width='18px' fill='currentColor' aria-hidden='true' />
                            {localize('Load a Strategy')}
                        </button>
                    </div>
                </div>
                <RobotArt className='vd-dash__robot' />
                <MarketOverview />
            </section>

            <div className='vd-dash__stats'>
                {stats.map(stat => (
                    <button key={stat.title} type='button' className='vd-dash__stat' onClick={stat.onClick}>
                        <span className={`vd-dash__icon vd-dash__icon--${stat.tone}`} aria-hidden='true'>
                            {stat.icon}
                        </span>
                        <span className='vd-dash__stat-text'>
                            <strong>{stat.value}</strong>
                            <span>{stat.title}</span>
                            <small>{stat.note}</small>
                        </span>
                        <LabelPairedArrowUpRightCaptionRegularIcon className='vd-dash__stat-arrow' height='16px' width='16px' fill='currentColor' aria-hidden='true' />
                    </button>
                ))}
            </div>
        </>
    );
});

export default VindolarHero;
