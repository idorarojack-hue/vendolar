import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import NumberField from '@/components/vindolar/number-field';
import { MarketSelect } from '@/components/vindolar/pickers';
import { useTicks, useVolatilitySymbols } from '@/hooks/useMarketData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { computeDigitStats, getCurrentStreak, mostUnusual } from '@/services/vindolar/digit-stats';
import { TMarketSymbol } from '@/services/vindolar/market-data';
import { localize } from '@deriv-com/translations';
import './signals.scss';

type TMode = 'over_under' | 'watch';
type TTone = 'up' | 'down' | 'warn' | 'info';
type TLine = { id: number; tone: TTone; time: string; text: string };
type TDraft = Pick<TLine, 'tone' | 'text'>;

const toneForKind = (kind: string): TTone => (kind === 'even' || kind === 'over' || kind.endsWith('-hot') ? 'up' : 'down');

/** One market, Over/Under: each new digit, plus a running count every few ticks. */
const OverFeed = ({
    symbol,
    barrier,
    window_size,
    onLines,
}: {
    symbol: string;
    barrier: number;
    window_size: number;
    onLines: (lines: TDraft[]) => void;
}) => {
    const ticks = useTicks(symbol, window_size);
    const last_epoch = React.useRef(0);
    const logged = React.useRef(0);
    const last_streak = React.useRef(0);

    React.useEffect(() => {
        const fresh = ticks.filter(tick => tick.epoch > last_epoch.current);
        if (!fresh.length) return;
        last_epoch.current = fresh[fresh.length - 1].epoch;
        const stats = computeDigitStats(ticks, barrier);
        const digits = ticks.map(tick => tick.digit);
        const streak = getCurrentStreak(digits, digit => digit > barrier);
        const lines: TDraft[] = fresh.map(tick => ({
            tone: tick.digit > barrier ? 'up' : 'down',
            text: `${localize('Digit')} ${tick.digit} · ${tick.digit > barrier ? localize('Over {{n}}', { n: barrier }) : localize('Under {{n}}', { n: barrier + 1 })}`,
        }));
        logged.current += fresh.length;
        if (ticks.length >= 10 && logged.current % 5 < fresh.length) {
            lines.push({
                tone: Math.abs(stats.over - 50) >= 8 ? 'warn' : stats.over >= 50 ? 'up' : 'down',
                text: localize('Last {{n}} ticks · Over {{b}} {{over}}% · Under {{u}} {{under}}% · even {{even}}% (fair is 50%)', {
                    n: stats.sample,
                    b: barrier,
                    over: stats.over.toFixed(0),
                    u: barrier + 1,
                    under: stats.under.toFixed(0),
                    even: stats.even.toFixed(0),
                }),
            });
        }
        if (streak.length >= 4 && streak.length !== last_streak.current) {
            last_streak.current = streak.length;
            lines.push({
                tone: streak.value ? 'up' : 'down',
                text: localize('{{n}} in a row on {{side}}', {
                    n: streak.length,
                    side: streak.value ? localize('Over {{b}}', { b: barrier }) : localize('Under {{b}}', { b: barrier + 1 }),
                }),
            });
        }
        onLines(lines);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticks]);

    return null;
};

/** Every market: a line when the most unusual reading changes. */
const WatchFeed = ({ market, onLines }: { market: TMarketSymbol; onLines: (lines: TDraft[]) => void }) => {
    const ticks = useTicks(market.symbol, 100);
    const previous = React.useRef('');

    React.useEffect(() => {
        if (ticks.length < 30) return;
        const unusual = mostUnusual(ticks);
        const key = `${unusual.kind}:${unusual.label}`;
        if (key === previous.current) return;
        previous.current = key;
        onLines([
            {
                tone: unusual.score >= 2 ? 'warn' : toneForKind(unusual.kind),
                text: `${market.name} · ${unusual.label} · ${unusual.score.toFixed(1)}σ`,
            },
        ]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticks]);

    return null;
};

const SignalAI = observer(() => {
    const { symbols } = useVolatilitySymbols();
    const [symbol, setSymbol] = usePersistentState('vd_signal_ai_symbol', '1HZ100V');
    const [mode, setMode] = usePersistentState<TMode>('vd_signal_ai_mode', 'over_under');
    const [ticks, setTicks] = usePersistentState('vd_signal_ai_ticks', 20);
    const [barrier, setBarrier] = usePersistentState('vd_signal_ai_barrier', 3);
    const [running, setRunning] = React.useState(false);
    const [lines, setLines] = React.useState<TLine[]>([]);
    const next_id = React.useRef(1);
    const log_ref = React.useRef<HTMLDivElement>(null);

    const market_name = symbols.find(item => item.symbol === symbol)?.name ?? symbol;

    const push = React.useCallback((incoming: TDraft[]) => {
        const time = new Date().toLocaleTimeString();
        setLines(previous => {
            const stamped = incoming.map(line => ({ ...line, id: next_id.current++, time }));
            return [...previous, ...stamped].slice(-220);
        });
    }, []);

    React.useEffect(() => {
        const node = log_ref.current;
        if (node) node.scrollTop = node.scrollHeight;
    }, [lines]);

    const start = () => {
        next_id.current = 1;
        setLines([
            {
                id: next_id.current++,
                tone: 'info',
                time: new Date().toLocaleTimeString(),
                text:
                    mode === 'over_under'
                        ? localize('Reading the last {{n}} ticks on {{market}}. Over {{b}} is green, under it is red.', {
                              n: ticks,
                              market: market_name,
                              b: barrier,
                          })
                        : localize('Watching every volatility market. Green is ahead of fair odds, red is behind. Unusual is not a prediction.'),
            },
        ]);
        setRunning(true);
    };

    const stop = () => setRunning(false);

    return (
        <div className='vd-page vd-page--dark vd-signal-ai'>
            {running && mode === 'over_under' && <OverFeed symbol={symbol} barrier={barrier} window_size={ticks} onLines={push} />}
            {running &&
                mode === 'watch' &&
                symbols.map(market => <WatchFeed key={market.symbol} market={market} onLines={push} />)}

            {!running ? (
                <form
                    className='vd-signal-ai__setup'
                    onSubmit={event => {
                        event.preventDefault();
                        start();
                    }}
                >
                    <h2>{localize('Signal AI')}</h2>
                    <p>
                        {localize(
                            'Pick a market and read the last ticks. Green means that side is ahead of a fair split. Red means it is behind. Neither one says what the next tick will be.'
                        )}
                    </p>
                    <MarketSelect label={localize('Volatility')} value={symbol} onChange={setSymbol} />
                    <div className='vd-segmented' role='tablist'>
                        <button type='button' className={classNames({ 'is-active': mode === 'over_under' })} onClick={() => setMode('over_under')}>
                            {localize('Over & Under')}
                        </button>
                        <button type='button' className={classNames({ 'is-active': mode === 'watch' })} onClick={() => setMode('watch')}>
                            {localize('Watch market')}
                        </button>
                    </div>
                    <div className='vd-signal-ai__row'>
                        <NumberField label={localize('Ticks')} value={ticks} min={10} max={500} decimals={0} onChange={setTicks} />
                        {mode === 'over_under' && (
                            <label className='vd-number'>
                                <span className='vd-field__label'>{localize('Barrier')}</span>
                                <select className='vd-select' value={barrier} onChange={event => setBarrier(Number(event.target.value))}>
                                    {Array.from({ length: 9 }, (_, digit) => (
                                        <option key={digit} value={digit}>
                                            {localize('Over {{n}}', { n: digit })}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>
                    <button type='submit' className='vd-primary-button vd-signal-ai__go'>
                        {localize('Analyze')}
                    </button>
                </form>
            ) : (
                <section className='vd-signal-ai__window' aria-label={localize('Analysis')}>
                    <header className='vd-signal-ai__bar'>
                        <span className='vd-signal-ai__dots' aria-hidden='true'>
                            <i />
                            <i />
                            <i />
                        </span>
                        <h2>
                            {mode === 'over_under'
                                ? localize('Analysis · Over & Under · barrier {{n}}', { n: barrier })
                                : localize('Analysis · All markets')}
                        </h2>
                        <button type='button' className='vd-signal-ai__close' aria-label={localize('Stop scanning')} onClick={stop}>
                            ×
                        </button>
                    </header>
                    <div className='vd-signal-ai__log' ref={log_ref}>
                        {lines.map(line => (
                            <p key={line.id} className={`is-${line.tone}`}>
                                <time>{line.time}</time>
                                {line.text}
                            </p>
                        ))}
                    </div>
                    <footer>
                        <button type='button' className='vd-signal-ai__stop' onClick={stop}>
                            {localize('Stop scanning')}
                        </button>
                    </footer>
                </section>
            )}
        </div>
    );
});

export default SignalAI;
