import React from 'react';
import { localize } from '@deriv-com/translations';

const STRIP_SELECTOR = '.dc-tabs__list--main__tabs';

/**
 * Left/right arrows over the ends of the navigation strip (desktop). They appear only when there are
 * more tabs in that direction, so it's obvious the strip scrolls.
 */
const TabStripArrows = () => {
    const [state, setState] = React.useState({ left: false, right: false, height: 0 });

    React.useEffect(() => {
        const strip = document.querySelector<HTMLElement>(STRIP_SELECTOR);
        if (!strip) return undefined;
        const update = () =>
            setState({
                left: strip.scrollLeft > 4,
                right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4,
                height: strip.offsetHeight,
            });
        update();
        strip.addEventListener('scroll', update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(strip);
        return () => {
            strip.removeEventListener('scroll', update);
            observer.disconnect();
        };
    }, []);

    const scroll = (direction: -1 | 1) => {
        const strip = document.querySelector<HTMLElement>(STRIP_SELECTOR);
        strip?.scrollBy({ left: direction * strip.clientWidth * 0.66, behavior: 'smooth' });
    };

    return (
        <>
            {state.left && (
                <button
                    type='button'
                    className='vd-strip-arrow vd-strip-arrow--left'
                    style={{ height: state.height }}
                    aria-label={localize('Show previous tabs')}
                    onClick={() => scroll(-1)}
                >
                    ‹
                </button>
            )}
            {state.right && (
                <button
                    type='button'
                    className='vd-strip-arrow vd-strip-arrow--right'
                    style={{ height: state.height }}
                    aria-label={localize('Show more tabs')}
                    onClick={() => scroll(1)}
                >
                    ›
                </button>
            )}
        </>
    );
};

export default TabStripArrows;
