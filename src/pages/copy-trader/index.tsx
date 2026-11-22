import React from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { checkCopyTradingSupport, startCopying, stopCopying, TCopySupport } from '@/services/vindolar/trading';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import '@/components/vindolar/vindolar.scss';
import '../analysis-tools/analysis-tools.scss';

const CopyTrader = observer(() => {
    const { client, dashboard } = useStore();
    const [support, setSupport] = React.useState<TCopySupport | null>(null);
    const [checking, setChecking] = React.useState(false);
    const [token, setToken] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState<{ tone: 'error' | 'info'; text: string } | null>(null);

    const check = React.useCallback(async () => {
        if (!client.is_logged_in) return;
        setChecking(true);
        try {
            setSupport(await checkCopyTradingSupport());
        } catch (e: any) {
            setSupport({ supported: false, message: e?.message });
        } finally {
            setChecking(false);
        }
    }, [client.is_logged_in]);

    React.useEffect(() => {
        check();
    }, [check]);

    const run = async (action: 'start' | 'stop') => {
        setMessage(null);
        if (!token.trim()) return;
        setBusy(true);
        try {
            if (action === 'start') await startCopying(token.trim());
            else await stopCopying(token.trim());
            setMessage({ tone: 'info', text: action === 'start' ? localize('Copying started.') : localize('Copying stopped.') });
            check();
        } catch (e: any) {
            setMessage({ tone: 'error', text: e?.message ?? localize('Request failed.') });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className='vd-page vd-page--dark'>
            <PageBackdrop />
            <ToolHero
                eyebrow={localize('Vindolar · Bots')}
                title={localize('Copy Trader')}
                subtitle={localize("Copy another Deriv trader's trades into your account.")}
                right={
                client.is_logged_in ? (
                    <button type='button' className='vd-session__reset' onClick={check} disabled={checking}>
                        {checking ? localize('Checking…') : localize('Check again')}
                    </button>
                ) : null
                }
            />

            {!client.is_logged_in && <p className='vd-page__note'>{localize('Log in to check whether copy trading is available for your account.')}</p>}

            {client.is_logged_in && support === null && <p className='vd-card__text'>{localize('Checking with Deriv…')}</p>}

            {support && !support.supported && (
                <div className='vd-page__columns'>
                    <section className='vd-card'>
                        <h3 className='vd-card__title'>
                            {localize('Not available yet')}
                            <span className='vd-card__badge vd-card__badge--amber'>{support.code ?? localize('Unsupported')}</span>
                        </h3>
                        <p className='vd-card__text'>
                            {localize(
                                "Vindolar connects to Deriv's new trading API, and Deriv answered that copy trading isn't offered there yet. As soon as Deriv adds it, this page will switch on automatically — use \"Check again\" any time."
                            )}
                        </p>
                        {support.message && (
                            <p className='vd-card__text'>
                                <small>
                                    {localize('Deriv said:')} “{support.message}”
                                </small>
                            </p>
                        )}
                    </section>
                    <aside className='vd-card'>
                        <h3 className='vd-card__title'>{localize('What you can do instead')}</h3>
                        <p className='vd-card__text'>{localize("Use a bot someone shares with you: load their .xml file in the Bot Builder, or pick one of Vindolar's Free Bots.")}</p>
                        <button type='button' className='vd-primary-button' onClick={() => dashboard.setActiveTab(DBOT_TABS.FREE_BOTS)}>
                            {localize('Browse Free Bots')}
                        </button>
                        <button type='button' className='vd-primary-button vd-primary-button--teal' onClick={() => dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER)}>
                            {localize('Open the Bot Builder')}
                        </button>
                    </aside>
                </div>
            )}

            {support?.supported && (
                <div className='vd-page__columns'>
                    <section className='vd-card'>
                        <h3 className='vd-card__title'>{localize('Copy a trader')}</h3>
                        <p className='vd-card__text'>
                            {localize(
                                "Paste the trader's read-only API token (they create it in their Deriv account and share it with you). Copied trades use your balance — start on demo."
                            )}
                        </p>
                        <label className='vd-number'>
                            <span className='vd-field__label'>{localize("Trader's API token")}</span>
                            <input className='vd-select' value={token} autoComplete='off' onChange={e => setToken(e.target.value)} />
                        </label>
                        <div className='vd-row'>
                            <button type='button' className='vd-primary-button vd-primary-button--teal' disabled={busy || !token.trim()} onClick={() => run('start')}>
                                {localize('Start copying')}
                            </button>
                            <button type='button' className='vd-primary-button' disabled={busy || !token.trim()} onClick={() => run('stop')}>
                                {localize('Stop copying')}
                            </button>
                        </div>
                        {message && <p className={`vd-message vd-message--${message.tone}`}>{message.text}</p>}
                    </section>
                    <aside className='vd-card'>
                        <h3 className='vd-card__title'>{localize('Traders you copy')}</h3>
                        {support.traders && support.traders.length > 0 ? (
                            <ul>
                                {support.traders.map((t: any) => (
                                    <li key={t.loginid ?? t.token} className='vd-card__text'>
                                        {t.loginid ?? localize('Trader')}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className='vd-card__text'>{localize("You aren't copying anyone yet.")}</p>
                        )}
                    </aside>
                </div>
            )}
        </div>
    );
});

export default CopyTrader;
