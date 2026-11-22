import React from 'react';
import { TTick } from '@/services/vindolar/digit-stats';

type TLine = { value: number; label: string; tone: 'entry' | 'barrier' };

type TTickChartProps = {
    ticks: TTick[];
    pip_size: number;
    lines?: TLine[];
    height?: number;
};

const PADDING = { top: 16, right: 76, bottom: 22, left: 8 };

const useElementWidth = <T extends HTMLElement>() => {
    const ref = React.useRef<T>(null);
    const [width, setWidth] = React.useState(0);
    React.useEffect(() => {
        if (!ref.current) return undefined;
        const observer = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)));
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    return [ref, width] as const;
};

/** Lightweight live line chart of recent ticks, with optional horizontal lines (entry spot, barriers). */
const TickChart = ({ ticks, pip_size, lines = [], height = 300 }: TTickChartProps) => {
    const [ref, width] = useElementWidth<HTMLDivElement>();

    const values = [...ticks.map(t => t.quote), ...lines.map(l => l.value)];
    const has_data = ticks.length > 1 && width > 0;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.abs(max) * 0.0001 || 1;
    const low = min - range * 0.1;
    const high = max + range * 0.1;

    const plot_w = Math.max(width - PADDING.left - PADDING.right, 1);
    const plot_h = height - PADDING.top - PADDING.bottom;
    const x = (i: number) => PADDING.left + (i / Math.max(ticks.length - 1, 1)) * plot_w;
    const y = (v: number) => PADDING.top + (1 - (v - low) / (high - low)) * plot_h;

    const line_path = ticks.map((t, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(t.quote).toFixed(1)}`).join(' ');
    const area_path = has_data
        ? `${line_path} L${x(ticks.length - 1).toFixed(1)},${PADDING.top + plot_h} L${PADDING.left},${PADDING.top + plot_h} Z`
        : '';
    const last = ticks[ticks.length - 1];
    const grid_values = [0, 1, 2, 3].map(i => low + ((high - low) * (i + 0.5)) / 4);

    return (
        <div ref={ref} className='vd-chart' style={{ height }}>
            {has_data ? (
                <svg width={width} height={height} role='img' aria-label={`Price ${last.quote.toFixed(pip_size)}`}>
                    {grid_values.map(v => (
                        <g key={v} className='vd-chart__grid'>
                            <line x1={PADDING.left} x2={PADDING.left + plot_w} y1={y(v)} y2={y(v)} />
                            <text x={PADDING.left + plot_w + 8} y={y(v) + 4}>
                                {v.toFixed(pip_size)}
                            </text>
                        </g>
                    ))}

                    <path d={area_path} fill='#ff9136' fillOpacity={0.1} />
                    <path d={line_path} className='vd-chart__line' />

                    {lines.map(line => (
                        <g key={`${line.label}-${line.value}`} className={`vd-chart__marker vd-chart__marker--${line.tone}`}>
                            <line x1={PADDING.left} x2={PADDING.left + plot_w} y1={y(line.value)} y2={y(line.value)} />
                            <text x={PADDING.left + 6} y={y(line.value) - 5}>
                                {line.label} {line.value.toFixed(pip_size)}
                            </text>
                        </g>
                    ))}

                    <circle cx={x(ticks.length - 1)} cy={y(last.quote)} r='4' className='vd-chart__dot' />
                    <g className='vd-chart__price'>
                        <rect x={PADDING.left + plot_w + 2} y={y(last.quote) - 11} width={PADDING.right - 4} height='22' rx='4' />
                        <text x={PADDING.left + plot_w + 8} y={y(last.quote) + 4}>
                            {last.quote.toFixed(pip_size)}
                        </text>
                    </g>
                </svg>
            ) : (
                <div className='vd-chart__loading'>Loading chart…</div>
            )}
        </div>
    );
};

export default TickChart;
