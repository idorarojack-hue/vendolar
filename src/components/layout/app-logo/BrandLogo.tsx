// Vindolar logo: brown tile with an orange rising-chart "V", followed by the wordmark.
// The wordmark uses the `fill` prop so it follows the theme's text colour (light/dark).

type TBrandLogoProps = {
    width?: number;
    height?: number;
    fill?: string;
    className?: string;
    /** Icon tile only. The header draws the wordmark in HTML so the caption can sit under it. */
    wordmark?: boolean;
};

const NAVY = '#542a0e';
const TEAL = '#ff9136';

export const BrandLogo = ({
    width = 120,
    height = 32,
    fill = 'currentColor',
    className = '',
    wordmark = true,
}: TBrandLogoProps) => {
    return (
        <svg
            width={width}
            height={height}
            viewBox={wordmark ? '0 0 120 32' : '0 0 32 32'}
            fill='none'
            xmlns='http://www.w3.org/2000/svg'
            className={className}
            role='img'
            aria-label='Vindolar'
        >
            {/* Icon tile */}
            <rect x='1' y='3' width='26' height='26' rx='6' fill={NAVY} />
            {/* "V" drawn as a chart line that dips and then rises past the start */}
            <path
                d='M7 10 L13.5 22 L21 7'
                stroke={TEAL}
                strokeWidth='3'
                strokeLinecap='round'
                strokeLinejoin='round'
                fill='none'
            />
            <circle cx='21' cy='7' r='2' fill='#ffffff' />

            {wordmark && (
                <text
                    x='33'
                    y='22'
                    fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif"
                    fontSize='17'
                    fontWeight='700'
                    letterSpacing='-0.2'
                    fill={fill}
                >
                    Vindolar
                </text>
            )}
        </svg>
    );
};
