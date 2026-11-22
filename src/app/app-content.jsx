import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ToastContainer } from 'react-toastify';
import AuthLoadingWrapper from '@/components/auth-loading-wrapper';
import useLiveChat from '@/components/chat/useLiveChat';
import { getUrlBase } from '@/components/shared';
import TransactionDetailsModal from '@/components/transaction-details';
import BootScreen from '@/components/vindolar/boot-screen';
import Landing from '@/components/vindolar/landing/landing';
import { api_base, ApiHelpers, ServerTime } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import useDevMode from '@/hooks/useDevMode';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { ThemeProvider } from '@deriv-com/quill-ui';
import { setSmartChartsPublicPath } from '@deriv-com/smartcharts-champion';
import { localize } from '@deriv-com/translations';
import Audio from '../components/audio';
import BlocklyLoading from '../components/blockly-loading';
import BotStopped from '../components/bot-stopped';
import BotBuilder from '../pages/bot-builder';
import Main from '../pages/main';
import './app.scss';
import 'react-toastify/dist/ReactToastify.css';
import '../components/bot-notification/bot-notification.scss';

/** Set when a visitor chooses "Explore tools" on the landing page (this browser tab only). */
const GUEST_KEY = 'vd_guest';
/** Longest the boot screen waits for a saved session to be verified. */
const AUTH_WAIT_MS = 10000;
const hasOAuthCode = () => new URLSearchParams(window.location.search).has('code');

const AppContent = observer(() => {
    const [is_api_initialized, setIsApiInitialized] = React.useState(false);
    const [is_loading, setIsLoading] = React.useState(true);

    const store = useStore();
    const { app, transactions, common, client } = store;
    const { is_dark_mode_on } = useThemeSwitcher();

    const { recovered_transactions, recoverPendingContracts } = transactions;
    const is_subscribed_to_msg_listener = React.useRef(false);
    const msg_listener = React.useRef(null);
    const { connectionStatus } = useApiBase();

    // Initialize dev mode keyboard shortcuts
    useDevMode();

    const livechat_client_information = {
        is_client_store_initialized: client?.is_logged_in ? true : !!client,
        is_logged_in: client?.is_logged_in,
        loginid: client?.loginid,
        currency: client?.currency,
        residence: client?.residence,
        email: '',
        first_name: '',
        last_name: '',
    };

    useLiveChat(livechat_client_information);

    // NOTE: Disabled Intercom until further notice
    // const token = V2GetActiveToken() ?? null;
    // useIntercom(token);

    useEffect(() => {
        if (connectionStatus === CONNECTION_STATUS.OPENED) {
            setIsApiInitialized(true);
            common.setSocketOpened(true);
        } else if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            common.setSocketOpened(false);
        }
    }, [common, connectionStatus]);

    const { current_language } = common;
    const html = document.documentElement;
    React.useEffect(() => {
        html?.setAttribute('lang', current_language.toLowerCase());
        html?.setAttribute('dir', current_language.toLowerCase() === 'ar' ? 'rtl' : 'ltr');
    }, [current_language, html]);

    const handleMessage = React.useCallback(
        ({ data }) => {
            if (data?.msg_type === 'proposal_open_contract' && !data?.error) {
                const { proposal_open_contract } = data;
                if (
                    proposal_open_contract?.status !== 'open' &&
                    !recovered_transactions?.includes(proposal_open_contract?.contract_id)
                ) {
                    recoverPendingContracts(proposal_open_contract);
                }
            }
        },
        [recovered_transactions, recoverPendingContracts]
    );

    React.useEffect(() => {
        setSmartChartsPublicPath(getUrlBase('/js/smartcharts/'));
    }, []);

    React.useEffect(() => {
        // Check if api is initialized and then subscribe to the api messages
        // Also we should only subscribe to the messages once user is logged in
        // And is not already subscribed to the messages
        if (!is_subscribed_to_msg_listener.current && client.is_logged_in && is_api_initialized && api_base?.api) {
            is_subscribed_to_msg_listener.current = true;
            msg_listener.current = api_base.api.onMessage()?.subscribe(handleMessage);
        }
        return () => {
            if (is_subscribed_to_msg_listener.current && msg_listener.current) {
                is_subscribed_to_msg_listener.current = false;
                msg_listener.current.unsubscribe?.();
            }
        };
    }, [is_api_initialized, client.is_logged_in, client.loginid, handleMessage, connectionStatus]);

    const init = () => {
        ServerTime.init(common);
        app.setDBotEngineStores();
        ApiHelpers.setInstance(app.api_helpers_store);
        import('@/utils/gtm').then(({ default: GTM }) => {
            GTM.init(store);
        });
    };

    const changeActiveSymbolLoadingState = () => {
        init();

        const retrieveActiveSymbols = () => {
            const { active_symbols } = ApiHelpers.instance;

            active_symbols.retrieveActiveSymbols(true).then(() => {
                setIsLoading(false);
            });
        };

        if (ApiHelpers?.instance?.active_symbols) {
            retrieveActiveSymbols();
        } else {
            // This is a workaround to fix the issue where the active symbols are not loaded immediately
            // when the API is initialized. Should be replaced with RxJS pubsub
            const intervalId = setInterval(() => {
                if (ApiHelpers?.instance?.active_symbols) {
                    clearInterval(intervalId);
                    retrieveActiveSymbols();
                }
            }, 1000);
        }
    };

    React.useEffect(() => {
        if (is_api_initialized) {
            init();
            setIsLoading(true);
            if (!client.is_logged_in) {
                changeActiveSymbolLoadingState();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized]);

    React.useEffect(() => {
        if (client.is_logged_in && is_api_initialized) {
            changeActiveSymbolLoadingState();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized, client.loginid]);

    // A visitor with a saved Deriv session (or one coming back from the Deriv login page)
    // waits on the boot screen until the account is verified, instead of seeing the
    // public landing page flash up first. The wait is capped so a failed login can't hang it.
    const has_session = OAuthTokenExchangeService.isAuthenticated() || hasOAuthCode();
    const [is_auth_wait_over, setIsAuthWaitOver] = React.useState(false);
    React.useEffect(() => {
        if (!has_session || client.is_logged_in) return undefined;
        const timer = setTimeout(() => setIsAuthWaitOver(true), AUTH_WAIT_MS);
        return () => clearTimeout(timer);
    }, [has_session, client.is_logged_in]);
    const is_waiting_for_account = has_session && !client.is_logged_in && !is_auth_wait_over;

    const is_booting = is_loading || is_waiting_for_account;
    const [is_boot_visible, setIsBootVisible] = React.useState(true);
    React.useEffect(() => {
        if (is_booting) setIsBootVisible(true);
    }, [is_booting]);

    const [is_guest, setIsGuest] = React.useState(() => sessionStorage.getItem(GUEST_KEY) === '1');
    const exploreAsGuest = React.useCallback(() => {
        sessionStorage.setItem(GUEST_KEY, '1');
        setIsGuest(true);
    }, []);
    React.useEffect(() => {
        // Once someone logs in, logging out later should bring back the landing page.
        if (client.is_logged_in) {
            sessionStorage.removeItem(GUEST_KEY);
            setIsGuest(false);
        }
    }, [client.is_logged_in]);
    const show_landing = !client.is_logged_in && !has_session && !is_guest;

    if (common?.error) return null;

    let boot_stage = { target: 96, status: localize('Opening your workspace') };
    if (!is_api_initialized) boot_stage = { target: 58, status: localize('Opening the market connection') };
    else if (is_loading) boot_stage = { target: 84, status: localize('Loading markets') };
    else if (is_waiting_for_account) boot_stage = { target: 94, status: localize('Verifying your Deriv account') };

    return (
        <>
            {!is_booting && show_landing && <Landing onExplore={exploreAsGuest} />}
            {!is_booting && !show_landing && (
                <AuthLoadingWrapper>
                    <ThemeProvider theme={is_dark_mode_on ? 'dark' : 'light'}>
                        <BlocklyLoading />
                        <div className='bot-dashboard bot' data-testid='dt_bot_dashboard'>
                            <Audio />
                            <Main />
                            <BotBuilder />
                            <BotStopped />
                            <TransactionDetailsModal />
                            <ToastContainer limit={3} draggable={false} />
                        </div>
                    </ThemeProvider>
                </AuthLoadingWrapper>
            )}
            {is_boot_visible && (
                <BootScreen
                    target={boot_stage.target}
                    status={boot_stage.status}
                    done={!is_booting}
                    onExit={() => setIsBootVisible(false)}
                />
            )}
        </>
    );
});

export default AppContent;
