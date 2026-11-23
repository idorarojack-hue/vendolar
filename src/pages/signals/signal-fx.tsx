import React from 'react';

// ---------------------------------------------------------------------------
// Scanner sound: bursts of short high beeps (about 3.9 kHz, 60 ms on / 40 ms off,
// 7 beeps every 1.5 s), like a terminal working. Web Audio only — no sound files.
// ---------------------------------------------------------------------------
const BEEP_HZ = 3900;
const BEEP_ON = 0.06;
const BEEP_GAP = 0.04;
const BEEPS_PER_BURST = 7;
const BURST_EVERY_MS = 1500;
const VOLUME = 0.05;

type TBeeper = { start: () => void; stop: () => void; close: () => void };

export const createBeeper = (): TBeeper | null => {
    const AudioCtx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    let timer: number | undefined;

    const burst = () => {
        const t0 = ctx.currentTime + 0.02;
        for (let i = 0; i < BEEPS_PER_BURST; i++) {
            const at = t0 + i * (BEEP_ON + BEEP_GAP);
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = BEEP_HZ;
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(VOLUME, at + 0.005);
            gain.gain.setValueAtTime(VOLUME, at + BEEP_ON - 0.005);
            gain.gain.linearRampToValueAtTime(0, at + BEEP_ON);
            osc.connect(gain).connect(ctx.destination);
            osc.start(at);
            osc.stop(at + BEEP_ON + 0.01);
        }
    };

    return {
        start() {
            if (timer !== undefined) return;
            ctx.resume().catch(() => undefined);
            burst();
            timer = window.setInterval(burst, BURST_EVERY_MS);
        },
        stop() {
            window.clearInterval(timer);
            timer = undefined;
        },
        close() {
            this.stop();
            ctx.close().catch(() => undefined);
        },
    };
};

// ---------------------------------------------------------------------------
// Background: rows of terminal status text that keep changing behind the card.
// Purely decorative (aria-hidden); it does not describe the real scan.
// ---------------------------------------------------------------------------
const RAIN_PHRASES = [
    '[INFO] Analysing Volatility Index...',
    '[INFO] Fetching market data...',
    '[OK]',
    '[INFO] Connecting to server...',
    '[INFO] Data transmission complete...',
    '[SUCCESS] Data stream established...',
    '[INFO] Compiling results...',
    '[WARNING] High market volatility detected...',
    '[INFO] Reading last digit...',
    '[SECURITY] Encryption enabled...',
    '[INFO] Authenticating API key...',
    '[WARNING] Unstable connection detected...',
    '[ERROR] Connection timeout. Retrying...',
];
const RAIN_ROWS = 60;

const randomRow = () => {
    let row = '';
    while (row.length < 320) row += `${RAIN_PHRASES[Math.floor(Math.random() * RAIN_PHRASES.length)]} `;
    return row;
};

export const TerminalRain = () => {
    const [rows, setRows] = React.useState(() => Array.from({ length: RAIN_ROWS }, randomRow));

    React.useEffect(() => {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const id = window.setInterval(
            () => {
                setRows(previous => {
                    // Scroll up one row and rewrite a few others, so the wall keeps flickering.
                    const next = [...previous.slice(1), randomRow()];
                    for (let i = 0; i < 6; i++) next[Math.floor(Math.random() * next.length)] = randomRow();
                    return next;
                });
            },
            reduced ? 4000 : 160
        );
        return () => window.clearInterval(id);
    }, []);

    return (
        <div className='vd-sig__rain' aria-hidden='true'>
            {rows.map((row, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i}>{row}</div>
            ))}
        </div>
    );
};
