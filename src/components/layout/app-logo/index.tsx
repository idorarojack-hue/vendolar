// Updated to use brand configuration from brand.config.json
// Logo is now customizable for white-labeling
import brandConfig from '@/../brand.config.json';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { BrandLogo } from './BrandLogo';
import './app-logo.scss';

export const AppLogo = () => {
    const { isDesktop } = useDevice();

    // Get logo configuration from brand.config.json
    const logoConfig = brandConfig.platform.logo;
    const logoUrl = logoConfig.link_url || '/';

    return (
        <a href={logoUrl} className='app-header__logo' aria-label={localize('Home')}>
            {isDesktop ? (
                <>
                    <BrandLogo wordmark={false} width={36} height={36} />
                    <span className='app-header__lockup'>
                        <span className='app-header__name'>{brandConfig.brand_name}</span>
                        <span className='app-header__powered'>
                            {localize('powered by')} <strong>deriv</strong>
                        </span>
                    </span>
                </>
            ) : (
                <>
                    <BrandLogo wordmark={false} width={32} height={32} />
                    {/* Hidden on phones once the account balance is shown, so the header fits the screen. */}
                    <span className='app-header__name app-header__name--mobile'>{brandConfig.brand_name}</span>
                </>
            )}
        </a>
    );
};
