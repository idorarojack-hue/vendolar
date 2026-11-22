import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import Cards from './cards';
import ToolDirectory from './tool-directory';
import VindolarHero from './vindolar-hero';
import '@/components/vindolar/vindolar.scss';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

/*
 * Vindolar dashboard. The template's Announcements button, onboarding tour (and its
 * "Welcome — take a quick tour" pop-up) and the welcome info panel are removed on purpose:
 * nothing pops up when the page loads.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DashboardComponent = observer((_props: TMobileIconGuide) => {
    const { load_modal, dashboard } = useStore();
    const { dashboard_strategies } = load_modal;
    const { active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop } = useDevice();

    return (
        <div
            className={classNames('tab__dashboard', {
                'tab__dashboard--tour-active': active_tour,
            })}
        >
            <div className='tab__dashboard__content vd-home'>
                <VindolarHero />
                <ToolDirectory />
                <div className='quick-panel'>
                    {has_dashboard_strategies && (
                        <div
                            className={classNames('tab__dashboard__header', {
                                'tab__dashboard__header--listed': isDesktop,
                            })}
                        >
                            <Text
                                as='p'
                                color='prominent'
                                lineHeight='s'
                                size={isDesktop ? 's' : 'xxs'}
                                className='subtitle subtitle__has-list'
                            >
                                {localize('Your recent bots')}
                            </Text>
                        </div>
                    )}
                    {/* Tiles are replaced by the hero cards; this keeps the saved-bot list and load dialogs. */}
                    <Cards has_dashboard_strategies={has_dashboard_strategies} is_mobile={!isDesktop} show_tiles={false} />
                </div>
            </div>
        </div>
    );
});

export default DashboardComponent;
