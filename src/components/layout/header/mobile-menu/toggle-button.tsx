import { ComponentProps } from 'react';
import { LegacyMenuHamburger1pxIcon } from '@deriv/quill-icons/Legacy';
import { localize } from '@deriv-com/translations';

type TToggleButton = {
    onClick: ComponentProps<'button'>['onClick'];
};

const ToggleButton = ({ onClick }: TToggleButton) => (
    <button type='button' className='vd-menu-toggle' aria-label={localize('Open menu')} aria-haspopup='dialog' onClick={onClick}>
        <LegacyMenuHamburger1pxIcon iconSize='xs' fill='var(--text-general)' />
    </button>
);

export default ToggleButton;
