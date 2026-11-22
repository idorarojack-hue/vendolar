import React from 'react';
import './vindolar.scss';

/** Faint candlestick chart behind dark tool pages (decorative). */
export const PageBackdrop = () => (
    <svg className='vd-backdrop' viewBox='0 0 1200 600' preserveAspectRatio='none' aria-hidden='true'>
        <defs>
            <pattern id='vd-backdrop-grid' width='60' height='60' patternUnits='userSpaceOnUse'>
                <path d='M 60 0 L 0 0 0 60' fill='none' stroke='rgba(196,181,253,0.07)' strokeWidth='1' />
            </pattern>
        </defs>
        <rect width='1200' height='600' fill='url(#vd-backdrop-grid)' />
        <polyline
            points='0,470 90,440 180,455 270,400 360,420 450,350 540,370 630,300 720,330 810,260 900,280 990,210 1080,230 1200,160'
            fill='none'
            stroke='rgba(196,181,253,0.2)'
            strokeWidth='2'
        />
        {[
            [60, 400, 470, true],
            [170, 390, 450, false],
            [280, 350, 420, true],
            [390, 320, 380, true],
            [500, 300, 360, false],
            [610, 260, 320, true],
            [720, 250, 300, true],
            [830, 210, 270, false],
            [940, 180, 240, true],
            [1050, 150, 210, true],
            [1150, 120, 180, true],
        ].map(([x, top, bottom, up]) => (
            <g key={x as number} opacity='0.22'>
                <line x1={x as number} x2={x as number} y1={(top as number) - 20} y2={(bottom as number) + 20} stroke={up ? '#1cae9e' : '#c52852'} strokeWidth='2' />
                <rect x={(x as number) - 9} y={top as number} width='18' height={(bottom as number) - (top as number)} rx='2' fill={up ? '#1cae9e' : '#c52852'} />
            </g>
        ))}
    </svg>
);

/** Bold header for tool pages: eyebrow, orange title, subtitle, optional right-hand content. */
const ToolHero = ({
    eyebrow,
    title,
    subtitle,
    right,
}: {
    eyebrow: string;
    title: string;
    subtitle: React.ReactNode;
    right?: React.ReactNode;
}) => (
    <header className='vd-tool-hero'>
        <div className='vd-tool-hero__text'>
            <p className='vd-tool-hero__eyebrow'>
                <span aria-hidden='true' /> {eyebrow}
            </p>
            <h2 className='vd-tool-hero__title'>{title}</h2>
            <p className='vd-tool-hero__subtitle'>{subtitle}</p>
        </div>
        {right && <div className='vd-tool-hero__right'>{right}</div>}
    </header>
);

export default ToolHero;
