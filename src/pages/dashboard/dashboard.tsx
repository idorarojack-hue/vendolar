import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';
import ToolDirectory from './tool-directory';
import VindolarHero from './vindolar-hero';
import '@/components/vindolar/vindolar.scss';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client } = useStore();
    const { dashboard_strategies } = load_modal;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();

    return (
        <React.Fragment>
            <div
                className={classNames('tab__dashboard', {
                    'tab__dashboard--tour-active': active_tour,
                })}
            >
                <div className='tab__dashboard__content vd-home'>
                    {client.is_logged_in && (
                        <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                    )}
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
                        <Cards
                            has_dashboard_strategies={has_dashboard_strategies}
                            is_mobile={!isDesktop}
                            show_tiles={false}
                        />
                    </div>
                </div>
            </div>
            <InfoPanel />
            {active_tab === 0 && <OnboardTourHandler is_mobile={!isDesktop} />}
        </React.Fragment>
    );
});

export default DashboardComponent;
