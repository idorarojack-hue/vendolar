import React from 'react';

/*
 * Full-screen boot screen shown while Vindolar starts.
 *
 * Its styles live in index.html (the `vd-boot` block), not in a .scss file, so the
 * very first paint — before any JavaScript has loaded — already shows this screen.
 * index.html contains a static copy of the same markup inside #root; React replaces it.
 *
 * Several loaders appear one after another while the app starts (route chunk, API
 * init, account + markets). Each one renders <BootScreen> with a higher `target`, and
 * the shown percentage is kept at module level so it never jumps backwards between them.
 */

/** The static HTML copy in index.html starts the bar here. */
const STATIC_START = 4;
let shown_progress = STATIC_START;

type TBootScreenProps = {
    /** The percentage this loading stage may climb to while it waits. */
    target: number;
    /** One short line describing what is loading right now. */
    status: string;
    /** When true the bar finishes at 100% and the screen fades out. */
    done?: boolean;
    /** Called once the fade-out has finished. */
    onExit?: () => void;
};

const BootScreen = ({ target, status, done = false, onExit }: TBootScreenProps) => {
    const [progress, setProgress] = React.useState(shown_progress);
    const [is_leaving, setIsLeaving] = React.useState(false);
    const on_exit_ref = React.useRef(onExit);
    on_exit_ref.current = onExit;

    // Ease towards the target. Inside a stage the bar slows as it nears its ceiling, so it
    // keeps moving while it waits but never claims a step is finished before it is.
    React.useEffect(() => {
        const goal = done ? 100 : Math.min(target, 99);
        const timer = window.setInterval(() => {
            setProgress(prev => {
                const step = done ? Math.max(4, (goal - prev) * 0.35) : (goal - prev) * 0.06;
                const next = Math.min(goal, prev + Math.max(step, 0));
                shown_progress = Math.max(shown_progress, next);
                return next;
            });
        }, 60);
        return () => window.clearInterval(timer);
    }, [target, done]);

    React.useEffect(() => {
        if (!done || progress < 100) return undefined;
        setIsLeaving(true);
        const timer = window.setTimeout(() => {
            shown_progress = STATIC_START;
            on_exit_ref.current?.();
        }, 380);
        return () => window.clearTimeout(timer);
    }, [done, progress]);

    const percent = Math.floor(progress);

    return (
        <div className={`vd-boot${is_leaving ? ' vd-boot--leaving' : ''}`} role='status' aria-live='polite'>
            <div className='vd-boot__scene' aria-hidden='true' />
            <div className='vd-boot__card'>
                <div className='vd-boot__brand'>
                    <span className='vd-boot__mark' aria-hidden='true'>
                        <svg viewBox='0 0 26 26' width='26' height='26'>
                            <path
                                d='M6 7 L12.5 19 L20 4'
                                stroke='#4db6ac'
                                strokeWidth='3'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                fill='none'
                            />
                            <circle cx='20' cy='4' r='2' fill='#fff' />
                        </svg>
                    </span>
                    <span className='vd-boot__names'>
                        <strong>Vindolar</strong>
                        <small>Vindolar Trading Workspace</small>
                    </span>
                    <span className='vd-boot__dots' aria-hidden='true'>
                        <i />
                        <i />
                        <i />
                    </span>
                </div>
                <p className='vd-boot__status'>{status}</p>
                <div className='vd-boot__meter'>
                    <div className='vd-boot__meter-head'>
                        <span>Boot sequence</span>
                        <span>{percent}%</span>
                    </div>
                    <div
                        className='vd-boot__bar'
                        role='progressbar'
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                        aria-label='Loading Vindolar'
                    >
                        <span style={{ width: `${progress}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BootScreen;
