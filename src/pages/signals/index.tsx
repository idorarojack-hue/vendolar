import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useStore } from '@/hooks/useStore';
import { loadBot } from '@/services/vindolar/bot-loader';
import { marketData } from '@/services/vindolar/market-data';
import { localize } from '@deriv-com/translations';
import { createBeeper, TerminalRain } from './signal-fx';
import { rankSignals, scanMarket, STRATEGY_NAMES, TSignal, TSignalStrategy } from './signal-scan';
import './signals.scss';

type TView = 'setup' | 'scanning' | 'results';
type TLogLine = { id: number; text: string };

const WATCH_OFF = 'OFF';
const LINE_EVERY_MS = 230;
const MEDALS = ['🥇', '🥈', '🥉'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

/** Live last tick of the watched market. */
const LatestTick = ({ symbol, pip_size }: { symbol: string; pip_size: number }) => {
    const ticks = useTicks(symbol, 1);
    const tick = ticks[ticks.length - 1];
    if (!tick) return <>--</>;
    const text = tick.quote.toFixed(pip_size);
    return (
        <>
            {text.slice(0, -1)}
            <b>{text.slice(-1)}</b>
        </>
    );
};

const SignalAI = observer(() => {
    const { quick_strategy, dashboard } = useStore();
    const { symbols } = useVolatilitySymbols();
    const [strategy, setStrategy] = usePersistentState<TSignalStrategy>('vd_signal_ai_strategy', 'over_under');
    const [watch, setWatch] = usePersistentState('vd_signal_ai_watch', WATCH_OFF);
    const [tick_count, setTickCount] = usePersistentState('vd_signal_ai_tick_count', 3000);
    const [min_confidence, setMinConfidence] = usePersistentState('vd_signal_ai_min_confidence', 60);
    const [sound_on, setSoundOn] = usePersistentState('vd_signal_ai_sound', true);
    const [ticks_text, setTicksText] = React.useState(String(tick_count));
    const [confidence_text, setConfidenceText] = React.useState(String(min_confidence));

    const [view, setView] = React.useState<TView>('setup');
    const [lines, setLines] = React.useState<TLogLine[]>([]);
    const [results, setResults] = React.useState<TSignal[]>([]);
    const [load_error, setLoadError] = React.useState<string | null>(null);
    const [is_loading_bot, setIsLoadingBot] = React.useState(false);

    const queue = React.useRef<string[]>([]);
    const scan_done = React.useRef(false);
    const pending_results = React.useRef<TSignal[]>([]);
    const scan_id = React.useRef(0);
    const next_line_id = React.useRef(1);
    const beeper = React.useRef<ReturnType<typeof createBeeper>>(null);
    const log_ref = React.useRef<HTMLDivElement>(null);

    const watched = symbols.find(s => s.symbol === watch);
    const strategy_name = localize(STRATEGY_NAMES[strategy]);

    // Close the audio context when leaving the page.
    React.useEffect(
        () => () => {
            scan_id.current++;
            beeper.current?.close();
        },
        []
    );

    // Sound follows the scan and the mute button.
    React.useEffect(() => {
        if (view === 'scanning' && sound_on) beeper.current?.start();
        else beeper.current?.stop();
    }, [view, sound_on]);

    // Print queued log lines at a steady pace; show the results once the scan and the queue are done.
    React.useEffect(() => {
        if (view !== 'scanning') return undefined;
        const id = window.setInterval(() => {
            const text = queue.current.shift();
            if (text !== undefined) {
                setLines(previous => [...previous, { id: next_line_id.current++, text }].slice(-400));
            } else if (scan_done.current) {
                setResults(pending_results.current);
                setView('results');
            }
        }, LINE_EVERY_MS);
        return () => window.clearInterval(id);
    }, [view]);

    React.useEffect(() => {
        const node = log_ref.current;
        if (node) node.scrollTop = node.scrollHeight;
    }, [lines]);

    const say = (...texts: string[]) => queue.current.push(...texts);

    const runScan = async () => {
        const id = ++scan_id.current;
        const markets = watched ? [watched] : symbols;
        const count = clamp(Number(ticks_text) || tick_count, 100, 5000);
        const confidence = clamp(Number(confidence_text) || min_confidence, 1, 99);
        setTickCount(count);
        setMinConfidence(confidence);
        setTicksText(String(count));
        setConfidenceText(String(confidence));

        // The click is the user gesture browsers need before playing sound.
        if (!beeper.current) beeper.current = createBeeper();
        queue.current = [];
        pending_results.current = [];
        scan_done.current = false;
        setLines([]);
        setLoadError(null);
        setView('scanning');

        say(
            '[INFO] Connecting to Deriv WebSocket... OK',
            '[SECURITY] Encrypted channel (WSS)... OK',
            `[INFO] Strategy: ${STRATEGY_NAMES[strategy]} · ${count} ticks per market · min confidence ${confidence}%`
        );

        const found: TSignal[] = [];
        for (let i = 0; i < markets.length; i++) {
            const market = markets[i];
            say(`[INFO] Pass 1 - scanning ${market.name} (${i + 1}/${markets.length})...`);
            let last_reported = 0;
            try {
                // eslint-disable-next-line no-await-in-loop
                const ticks = await marketData.fetchTickHistory(market.symbol, count, loaded => {
                    if (loaded < count && loaded - last_reported >= 1000) {
                        last_reported = loaded;
                        say(`[INFO] Downloading tick history... ${loaded}/${count}`);
                    }
                });
                if (scan_id.current !== id) return;
                say(
                    `[OK] ${ticks.length} ticks received`,
                    '[INFO] Counting last-digit frequencies...',
                    '[INFO] Measuring hit rate for every contract...',
                    '[INFO] Comparing with fair odds...'
                );
                const signal = scanMarket(strategy, market, ticks, confidence);
                if (signal) {
                    found.push(signal);
                    say(
                        `[SUCCESS] ${market.name}: ${signal.trade} hit ${signal.hit.toFixed(1)}% (fair ${signal.fair}%)`
                    );
                } else {
                    say(`[INFO] ${market.name}: nothing reached ${confidence}%`);
                }
            } catch (e: any) {
                if (scan_id.current !== id) return;
                say(`[ERROR] ${market.name}: ${e?.error?.message ?? e?.message ?? 'no data'} - skipped`);
            }
        }
        if (scan_id.current !== id) return;
        say('[SUCCESS] Ranking candidate markets...', '[OK] Analysis complete.');
        pending_results.current = rankSignals(found);
        scan_done.current = true;
    };

    const stopScan = () => {
        scan_id.current++;
        queue.current = [];
        setView('setup');
    };

    const loadSignalBot = async (signal: TSignal) => {
        setLoadError(null);
        setIsLoadingBot(true);
        try {
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            await loadBot(quick_strategy, {
                strategy: 'MARTINGALE',
                symbol: signal.symbol,
                tradetype: signal.tradetype,
                contract: signal.contract,
                prediction: signal.prediction,
                stake: 0.5,
                duration: 1,
                profit: 5,
                loss: 10,
                size: 2,
                max_stake: 4,
            });
        } catch (e: any) {
            dashboard.setActiveTab(DBOT_TABS.SIGNALS);
            setLoadError(e?.message ?? localize('The bot could not be loaded.'));
        } finally {
            setIsLoadingBot(false);
        }
    };

    const best = results[0];

    const windowChrome = (title: React.ReactNode) => (
        <header className='vd-sig-win__bar'>
            <span className='vd-sig-win__dots' aria-hidden='true'>
                <i />
                <i />
                <i />
            </span>
            <button
                type='button'
                className='vd-sig-win__sound'
                aria-pressed={sound_on}
                aria-label={sound_on ? localize('Mute scanner sound') : localize('Turn scanner sound on')}
                title={sound_on ? localize('Sound on') : localize('Sound off')}
                onClick={() => setSoundOn(!sound_on)}
            >
                {sound_on ? '🔊' : '🔇'}
            </button>
            <button type='button' className='vd-sig-win__close' aria-label={localize('Close')} onClick={stopScan}>
                X
            </button>
            <h2 className='vd-sig-win__title'>{title}</h2>
        </header>
    );

    return (
        <div className='vd-sig'>
            <TerminalRain />

            {view === 'setup' && (
                <form
                    className='vd-sig-card'
                    onSubmit={event => {
                        event.preventDefault();
                        runScan();
                    }}
                >
                    <h2 className='vd-sig-card__title'>{localize('Signal AI')}</h2>
                    <div className='vd-sig-card__grid'>
                        <label className='vd-sig-field'>
                            <span>{localize('Select Strategy')}</span>
                            <select value={strategy} onChange={e => setStrategy(e.target.value as TSignalStrategy)}>
                                {(Object.keys(STRATEGY_NAMES) as TSignalStrategy[]).map(key => (
                                    <option key={key} value={key}>
                                        {localize(STRATEGY_NAMES[key])}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className='vd-sig-field'>
                            <span>{localize('Watch Market')}</span>
                            <select value={watch} onChange={e => setWatch(e.target.value)}>
                                <option value={WATCH_OFF}>{localize('— Off (scan all) —')}</option>
                                {symbols.map(s => (
                                    <option key={s.symbol} value={s.symbol}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className='vd-sig-field'>
                            <span>{localize('Ticks')}</span>
                            <input
                                inputMode='numeric'
                                value={ticks_text}
                                onChange={e => setTicksText(e.target.value.replace(/\D/g, ''))}
                                onBlur={() => setTicksText(String(clamp(Number(ticks_text) || tick_count, 100, 5000)))}
                            />
                        </label>
                        <label className='vd-sig-field'>
                            <span>{localize('Min Confidence %')}</span>
                            <input
                                inputMode='numeric'
                                value={confidence_text}
                                onChange={e => setConfidenceText(e.target.value.replace(/\D/g, ''))}
                                onBlur={() =>
                                    setConfidenceText(String(clamp(Number(confidence_text) || min_confidence, 1, 99)))
                                }
                            />
                        </label>
                    </div>
                    <div className='vd-sig-card__tick' aria-live='polite'>
                        {localize('Latest Tick:')}{' '}
                        {watched ? <LatestTick symbol={watched.symbol} pip_size={watched.pip_size} /> : '--'}
                    </div>
                    <button type='submit' className='vd-sig-btn vd-sig-btn--go' disabled={!symbols.length}>
                        {symbols.length ? localize('Analyse') : localize('Loading markets…')}
                    </button>
                </form>
            )}

            {view === 'scanning' && (
                <section className='vd-sig-win' aria-label={localize('Analysis')}>
                    {windowChrome(localize('Analysis Dashboard — {{strategy}} — Pass 1', { strategy: strategy_name }))}
                    <div className='vd-sig-win__log' ref={log_ref} role='log'>
                        {lines.map(line => (
                            <p key={line.id} className={classNames({ 'is-error': line.text.startsWith('[ERROR]') })}>
                                {line.text}
                            </p>
                        ))}
                        <p className='vd-sig-win__cursor' aria-hidden='true'>
                            _
                        </p>
                    </div>
                    <footer className='vd-sig-win__foot'>
                        <button type='button' className='vd-sig-btn vd-sig-btn--stop' onClick={stopScan}>
                            {localize('Stop Scanning')}
                        </button>
                    </footer>
                </section>
            )}

            {view === 'results' && (
                <section className='vd-sig-win' aria-label={localize('Analysis results')}>
                    {windowChrome(localize('Analysis Complete!'))}
                    <div className='vd-sig-win__body'>
                        {results.length === 0 ? (
                            <p className='vd-sig-empty'>
                                {localize(
                                    'No market reached {{min}}% on the last {{n}} ticks. Lower Min Confidence or read more ticks, then scan again.',
                                    { min: min_confidence, n: tick_count }
                                )}
                            </p>
                        ) : (
                            <>
                                <table className='vd-sig-table'>
                                    <thead>
                                        <tr>
                                            <th>{localize('Rank')}</th>
                                            <th>{localize('Market')}</th>
                                            <th>{localize('Signal')}</th>
                                            <th>{localize('Confidence')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.slice(0, 5).map((signal, i) => (
                                            <tr key={signal.symbol} className={classNames({ 'is-best': i === 0 })}>
                                                <td>{MEDALS[i] ?? `#${i + 1}`}</td>
                                                <td>{signal.market}</td>
                                                <td>{signal.trade}</td>
                                                <td>{signal.hit.toFixed(0)}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                <div className='vd-sig-best'>
                                    <h3>{localize('Best Opportunity')}</h3>
                                    <p>
                                        {localize('Market:')} <strong>{best.market}</strong>
                                    </p>
                                    <p>
                                        {localize('Trade:')} <strong>{best.trade}</strong>
                                    </p>
                                    <p>
                                        {localize('Confidence:')} <strong>{best.hit.toFixed(0)}%</strong>
                                    </p>
                                    <p>{localize('Reason:')}</p>
                                    <ul>
                                        <li>
                                            {localize('{{trade}} hit {{hit}}% of last {{n}} ticks', {
                                                trade: best.trade,
                                                hit: best.hit.toFixed(1),
                                                n: best.sample,
                                            })}
                                        </li>
                                        <li>
                                            {localize('Edge vs fair odds: {{edge}}% (fair is {{fair}}%)', {
                                                edge: `${best.edge >= 0 ? '+' : ''}${best.edge.toFixed(1)}`,
                                                fair: best.fair,
                                            })}
                                        </li>
                                        <li>
                                            {localize('Hot digits: {{digits}}', { digits: best.hot_digits.join(', ') })}
                                        </li>
                                    </ul>
                                </div>
                                <p className='vd-sig-note'>
                                    {localize(
                                        'Confidence is how often the trade would have won on past ticks. Volatility indices are random, so it does not predict the next tick.'
                                    )}
                                </p>
                            </>
                        )}
                        {load_error && (
                            <p className='vd-sig-empty' role='alert'>
                                {load_error}
                            </p>
                        )}
                        <div className='vd-sig-win__actions'>
                            <button type='button' className='vd-sig-btn vd-sig-btn--go' onClick={runScan}>
                                {localize('Scan Again')}
                            </button>
                            {best && (
                                <button
                                    type='button'
                                    className='vd-sig-btn vd-sig-btn--bot'
                                    disabled={is_loading_bot}
                                    onClick={() => loadSignalBot(best)}
                                >
                                    {is_loading_bot ? localize('Loading…') : localize('Load Signal Bot')}
                                </button>
                            )}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
});

export default SignalAI;
