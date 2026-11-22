/**
 * Vindolar's mascot for the dashboard hero: a robot at a laptop between two chart cards.
 * Original drawing, flat colours only (no gradients). Decorative — hidden from screen readers.
 */
const ORANGE = '#f97316';
const ORANGE_SOFT = '#fb8c3c';
const SHELL = '#eef0f6';
const SHELL_SHADE = '#c9cedb';
const VISOR = '#141a2e';

const RobotArt = ({ className = '' }: { className?: string }) => (
    <svg className={className} viewBox='0 0 340 250' fill='none' aria-hidden='true' focusable='false'>
        {/* sparkles */}
        <circle cx='52' cy='40' r='2.5' fill={ORANGE_SOFT} />
        <circle cx='118' cy='22' r='2' fill={ORANGE_SOFT} />
        <circle cx='262' cy='118' r='3' fill={ORANGE} />
        <circle cx='300' cy='176' r='2' fill={ORANGE_SOFT} />

        {/* left card: rising line chart */}
        <rect x='14' y='62' width='94' height='70' rx='8' fill='#3a1a06' stroke={ORANGE} strokeOpacity='0.7' strokeWidth='2' />
        <path d='M28 112 L48 96 L62 104 L92 76' stroke={ORANGE} strokeWidth='4' strokeLinecap='round' strokeLinejoin='round' />
        <path d='M84 76 H92 V84' stroke={ORANGE} strokeWidth='4' strokeLinecap='round' strokeLinejoin='round' />
        <rect x='26' y='72' width='26' height='4' rx='2' fill={ORANGE} fillOpacity='0.55' />

        {/* right card: bar chart */}
        <rect x='234' y='30' width='64' height='60' rx='8' fill='#3a1a06' stroke={ORANGE} strokeOpacity='0.7' strokeWidth='2' />
        <rect x='246' y='62' width='8' height='18' rx='2' fill={ORANGE} />
        <rect x='259' y='52' width='8' height='28' rx='2' fill={ORANGE} />
        <rect x='272' y='44' width='8' height='36' rx='2' fill={ORANGE} />
        <rect x='285' y='56' width='8' height='24' rx='2' fill={ORANGE_SOFT} />

        {/* bars rising from the desk */}
        <rect x='92' y='178' width='9' height='32' rx='2' fill={ORANGE} />
        <rect x='105' y='162' width='9' height='48' rx='2' fill={ORANGE} />
        <rect x='118' y='186' width='9' height='24' rx='2' fill={ORANGE_SOFT} />

        {/* antenna */}
        <line x1='184' y1='12' x2='184' y2='34' stroke={SHELL_SHADE} strokeWidth='4' strokeLinecap='round' />
        <circle cx='184' cy='10' r='7' fill={ORANGE} />

        {/* ears */}
        <rect x='132' y='60' width='14' height='30' rx='7' fill={ORANGE} />
        <rect x='222' y='60' width='14' height='30' rx='7' fill={ORANGE} />

        {/* head */}
        <rect x='140' y='32' width='88' height='84' rx='34' fill={SHELL} />
        <rect x='150' y='48' width='68' height='48' rx='22' fill={VISOR} />
        <ellipse cx='170' cy='72' rx='9' ry='11' fill={ORANGE} />
        <ellipse cx='198' cy='72' rx='9' ry='11' fill={ORANGE} />
        <ellipse cx='167' cy='68' rx='3' ry='3.5' fill='#fff' fillOpacity='0.85' />
        <ellipse cx='195' cy='68' rx='3' ry='3.5' fill='#fff' fillOpacity='0.85' />

        {/* neck + body */}
        <rect x='170' y='114' width='28' height='10' rx='4' fill={SHELL_SHADE} />
        <rect x='142' y='122' width='84' height='72' rx='22' fill={SHELL} />
        <rect x='128' y='134' width='18' height='46' rx='9' fill={SHELL_SHADE} />
        <rect x='222' y='134' width='18' height='46' rx='9' fill={SHELL_SHADE} />

        {/* laptop */}
        <rect x='150' y='140' width='68' height='50' rx='8' fill={VISOR} stroke={ORANGE} strokeWidth='4' />
        <path d='M160 176 L174 164 L184 170 L206 152' stroke={ORANGE_SOFT} strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' strokeOpacity='0.9' />

        {/* desk */}
        <rect x='112' y='206' width='146' height='8' rx='4' fill={ORANGE} />
        <rect x='122' y='214' width='126' height='20' rx='4' fill='#1a0c03' stroke={ORANGE} strokeOpacity='0.55' strokeWidth='2' />
    </svg>
);

export default RobotArt;
