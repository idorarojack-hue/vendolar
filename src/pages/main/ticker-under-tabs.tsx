import React from 'react';
import { createPortal } from 'react-dom';
import MarketTicker from '@/components/vindolar/market-ticker';

/**
 * Shows the price ticker directly under the main tab strip (header → tabs → ticker → page).
 * The tab strip is rendered by the shared Tabs component, so the ticker is portalled into
 * a slot appended to the tab header.
 */
const TickerUnderTabs = () => {
    const [slot, setSlot] = React.useState<HTMLElement | null>(null);

    React.useLayoutEffect(() => {
        const header = document.querySelector('.main .dc-tabs__list--header--main__tabs');
        if (!header) return undefined;
        const element = document.createElement('div');
        element.className = 'vd-ticker-slot';
        header.appendChild(element);
        setSlot(element);
        return () => {
            element.remove();
        };
    }, []);

    return slot ? createPortal(<MarketTicker variant='strip' />, slot) : null;
};

export default TickerUnderTabs;
