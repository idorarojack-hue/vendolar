import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import Text from '@/components/shared_ui/text';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { isDemoAccount } from '@/utils/account-helpers';
import { useLogout } from '@/hooks/useLogout';
import { Localize, localize } from '@deriv-com/translations';
import { TAccountSwitcher } from './common/types';
import AccountInfoWrapper from './account-info-wrapper';
import './account-switcher.scss';

const CURRENCY_NAME: Record<string, string> = {
    USD: 'US Dollar',
    EUR: 'Euro',
    GBP: 'Pound Sterling',
    AUD: 'Australian Dollar',
    KES: 'Kenyan Shilling',
    KSH: 'Kenyan Shilling',
    BTC: 'Bitcoin',
    ETH: 'Ethereum',
    USDT: 'Tether',
    LTC: 'Litecoin',
};

const FlagMark = ({ code }: { code: string }) => {
    if (code === 'USD') {
        const stripe = 42 / 13;
        return (
            <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
                {Array.from({ length: 13 }, (_, i) => (
                    <rect key={i} y={i * stripe} width='60' height={stripe + 0.2} fill={i % 2 ? '#fff' : '#b22234'} />
                ))}
                <rect width='26' height={stripe * 7} fill='#3c3b6e' />
                {Array.from({ length: 9 }, (_, i) => (
                    <circle
                        key={i}
                        cx={4 + (i % 3) * 8}
                        cy={3.2 + Math.floor(i / 3) * 4.6}
                        r='1.1'
                        fill='#fff'
                    />
                ))}
            </svg>
        );
    }
    if (code === 'EUR') {
        return (
            <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
                <rect width='60' height='42' fill='#003399' />
                <circle cx='30' cy='21' r='8' fill='none' stroke='#fc0' strokeWidth='1.6' />
            </svg>
        );
    }
    if (code === 'GBP') {
        return (
            <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
                <rect width='60' height='42' fill='#012169' />
                <path d='M0 0 L60 42 M60 0 L0 42' stroke='#fff' strokeWidth='8' />
                <path d='M0 0 L60 42 M60 0 L0 42' stroke='#c8102e' strokeWidth='4' />
                <path d='M30 0 V42 M0 21 H60' stroke='#fff' strokeWidth='12' />
                <path d='M30 0 V42 M0 21 H60' stroke='#c8102e' strokeWidth='7' />
            </svg>
        );
    }
    if (code === 'KES' || code === 'KSH') {
        return (
            <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
                <rect width='60' height='14' fill='#000' />
                <rect y='14' width='60' height='14' fill='#bb0000' />
                <rect y='28' width='60' height='14' fill='#006600' />
                <rect y='12' width='60' height='2' fill='#fff' />
                <rect y='28' width='60' height='2' fill='#fff' />
            </svg>
        );
    }
    return (
        <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
            <rect width='60' height='42' fill='#1d4ed8' />
            <text x='30' y='26' textAnchor='middle' fill='#fff' fontSize='12' fontWeight='700'>
                {code.slice(0, 3)}
            </text>
        </svg>
    );
};

const TRADERS_HUB_URL = 'https://app.deriv.com/';
const DISPLAY_CURRENCY_KEY = 'vd_display_currency';
const KSH = 'KSH';
const RATE_URL = 'https://open.er-api.com/v6/latest/USD';

const AccountSwitcher = observer(({ activeAccount }: TAccountSwitcher) => {
    const [isOpen, setIsOpen] = useState(false);
    const [accountTab, setAccountTab] = useState<'real' | 'demo'>('real');
    const [displayCurrency, setDisplayCurrency] = useState(() => localStorage.getItem(DISPLAY_CURRENCY_KEY) || '');
    const [kesPerUsd, setKesPerUsd] = useState<number | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { accountList, activeLoginid } = useApiBase();
    const { client, run_panel } = useStore() ?? {};
    const handleLogout = useLogout();

    const is_bot_running = run_panel?.is_running || api_base.is_running;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch(RATE_URL)
            .then(response => response.json())
            .then(data => {
                const rate = Number(data?.rates?.KES);
                if (!cancelled && data?.result === 'success' && rate > 0) setKesPerUsd(rate);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const formattedAccounts = useMemo(() => {
        if (!accountList) return [];
        return accountList
            .map(account => {
                const raw = Number(account.balance ?? 0);
                return {
                    loginid: account.loginid,
                    currency: account.currency,
                    raw,
                    balance: addComma(raw.toFixed(getDecimalPlaces(account.currency))),
                    isVirtual: isDemoAccount(account.loginid),
                    isActive: account.loginid === activeLoginid,
                };
            })
            .sort((a, b) => (a.isActive ? -1 : b.isActive ? 1 : 0));
    }, [accountList, activeLoginid]);

    const toggleDropdown = useCallback(() => {
        if (is_bot_running) return;
        setIsOpen(prev => {
            if (!prev) {
                const active = formattedAccounts.find(account => account.isActive);
                if (active) setAccountTab(active.isVirtual ? 'demo' : 'real');
            }
            return !prev;
        });
    }, [formattedAccounts, is_bot_running]);

    const chooseDisplayCurrency = (code: string) => {
        setDisplayCurrency(code);
        localStorage.setItem(DISPLAY_CURRENCY_KEY, code);
    };

    const handleAccountSelect = useCallback(
        (loginid: string) => {
            localStorage.setItem('active_loginid', loginid);
            client?.checkAndRegenerateWebSocket();
            setIsOpen(false);
        },
        [client]
    );

    const streamedBalance = Number(client?.balance);
    const activeSnapshot = formattedAccounts.find(account => account.isActive);
    const canUseStream =
        Number.isFinite(streamedBalance) &&
        (!client?.loginid || client.loginid === activeLoginid) &&
        !(streamedBalance === 0 && (activeSnapshot?.raw ?? 0) > 0);
    const displayedAccounts = canUseStream
        ? formattedAccounts.map(account =>
              account.isActive
                  ? {
                        ...account,
                        raw: streamedBalance,
                        balance: addComma(streamedBalance.toFixed(getDecimalPlaces(account.currency))),
                    }
                  : account
          )
        : formattedAccounts;

    const visibleAccounts = displayedAccounts.filter(account => account.isVirtual === (accountTab === 'demo'));
    const accountCurrencies = Array.from(
        new Set(visibleAccounts.map(account => getCurrencyDisplayCode(account.currency || '')))
    ).filter(Boolean);
    const currencies = accountCurrencies.includes(KSH) || accountCurrencies.includes('KES') ? accountCurrencies : [...accountCurrencies, KSH];
    const selectedCurrency = currencies.includes(displayCurrency) ? displayCurrency : accountCurrencies[0] || '';
    const showingShillings = selectedCurrency === KSH && !accountCurrencies.includes(KSH);
    const listedAccounts = showingShillings
        ? visibleAccounts
        : visibleAccounts.filter(account => getCurrencyDisplayCode(account.currency || '') === selectedCurrency);

    const asShillings = (amount: number) => (kesPerUsd ? addComma((amount * kesPerUsd).toFixed(2)) : '');

    if (!activeAccount) return null;

    const { currency, balance } = activeAccount;
    const currencyCode = getCurrencyDisplayCode(currency || '');
    const liveAccount = displayedAccounts.find(account => account.isActive);
    const shownBalance =
        showingShillings && liveAccount && kesPerUsd ? `${asShillings(liveAccount.raw)} ${KSH}` : `${liveAccount?.balance || balance} ${currencyCode}`;
    const headerFlag = showingShillings ? KSH : currencyCode;
    const showChevron = !is_bot_running;

    return (
        <div className='acc-info__wrapper' ref={wrapperRef}>
            <AccountInfoWrapper>
                <div
                    data-testid='dt_acc_info'
                    id='dt_core_account-info_acc-info'
                    role={showChevron ? 'button' : undefined}
                    tabIndex={showChevron ? 0 : -1}
                    aria-expanded={showChevron ? isOpen : undefined}
                    aria-haspopup={showChevron ? 'listbox' : undefined}
                    className={classNames('acc-info', {
                        'acc-info--is-virtual': activeAccount.isVirtual,
                        'acc-info--interactive': showChevron,
                    })}
                    onClick={toggleDropdown}
                    onKeyDown={e => {
                        if (showChevron && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            toggleDropdown();
                        }
                    }}
                >
                    <span className='acc-info__flag' aria-hidden='true'>
                        <FlagMark code={headerFlag} />
                    </span>
                    <span className='acc-info__id' aria-hidden='true'></span>
                    <div className='acc-info__content'>
                        {(typeof balance !== 'undefined' || !currency) && (
                            <div className='acc-info__balance-section'>
                                <p
                                    data-testid='dt_balance'
                                    className={classNames('acc-info__balance', {
                                        'acc-info__balance--no-currency': !currency,
                                    })}
                                >
                                    {!currency ? (
                                        <Localize i18n_default_text='No currency assigned' />
                                    ) : (
                                        shownBalance
                                    )}
                                </p>
                            </div>
                        )}
                    </div>
                    {showChevron && (
                        <span
                            className={classNames('acc-info__select-arrow', {
                                'acc-info__select-arrow--invert': isOpen,
                            })}
                        >
                            <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
                                <path
                                    d='M2 4L6 8L10 4'
                                    stroke='currentColor'
                                    strokeWidth='1.5'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                />
                            </svg>
                        </span>
                    )}
                </div>
            </AccountInfoWrapper>
            {isOpen && (
                <div className='acc-dropdown' role='listbox' aria-label={localize('Accounts')}>
                    <div className='acc-dropdown__tabs' role='tablist'>
                        <button type='button' role='tab' aria-selected={accountTab === 'real'} className={classNames({ 'is-active': accountTab === 'real' })} onClick={() => setAccountTab('real')}>
                            <Localize i18n_default_text='Real' />
                        </button>
                        <button type='button' role='tab' aria-selected={accountTab === 'demo'} className={classNames({ 'is-active': accountTab === 'demo' })} onClick={() => setAccountTab('demo')}>
                            <Localize i18n_default_text='Demo' />
                        </button>
                    </div>
                    <p className='acc-dropdown__label'>
                        <Localize i18n_default_text='Display currency' />
                    </p>
                    <div className='acc-dropdown__currencies'>
                        {currencies.map(code => (
                            <button
                                key={code}
                                type='button'
                                className={classNames('acc-dropdown__currency', { 'is-selected': code === selectedCurrency })}
                                onClick={() => chooseDisplayCurrency(code)}
                            >
                                <strong>{code}</strong>
                                <span>{CURRENCY_NAME[code] || code}</span>
                                {code === selectedCurrency && <i aria-hidden='true'>✓</i>}
                            </button>
                        ))}
                    </div>
                    {showingShillings && (
                        <p className='acc-dropdown__rate'>
                            {kesPerUsd
                                ? `1 USD = ${kesPerUsd.toFixed(2)} KSH`
                                : localize('Fetching the shilling rate…')}
                        </p>
                    )}
                    <p className='acc-dropdown__label'>
                        <Localize i18n_default_text='Deriv accounts' />
                    </p>
                    {listedAccounts.length === 0 && (
                        <p className='acc-dropdown__empty'>
                            <Localize i18n_default_text='No account in this currency.' />
                        </p>
                    )}
                    {listedAccounts.map(account => (
                        <div
                            key={account.loginid}
                            role='option'
                            aria-selected={account.isActive}
                            tabIndex={0}
                            className={classNames('acc-dropdown__account', {
                                'acc-dropdown__account--selected': account.isActive,
                            })}
                            onClick={() => !account.isActive && handleAccountSelect(account.loginid)}
                            onKeyDown={e => {
                                if (!account.isActive && (e.key === 'Enter' || e.key === ' ')) {
                                    e.preventDefault();
                                    handleAccountSelect(account.loginid);
                                }
                            }}
                        >
                            <span className='acc-dropdown__flag' aria-hidden='true'>
                                <FlagMark code={getCurrencyDisplayCode(account.currency || '')} />
                            </span>
                            <span className='acc-dropdown__meta'>
                                <strong>{getCurrencyDisplayCode(account.currency || '') || localize('No currency')}</strong>
                                <small>{account.loginid}</small>
                            </span>
                            <span className='acc-dropdown__amount'>
                                {showingShillings
                                    ? kesPerUsd
                                        ? `${asShillings(account.raw)} ${KSH}`
                                        : localize('Fetching rate…')
                                    : `${account.balance} ${getCurrencyDisplayCode(account.currency || '')}`}
                            </span>
                        </div>
                    ))}
                    <a className='acc-dropdown__hub' href={TRADERS_HUB_URL} target='_blank' rel='noopener noreferrer'>
                        <Localize i18n_default_text="Looking for CFD accounts? Go to Trader's Hub" />
                    </a>
                    <button type='button' className='acc-dropdown__logout' onClick={() => handleLogout()}>
                        <Localize i18n_default_text='Logout' />
                    </button>
                </div>
            )}
        </div>
    );
});

export default AccountSwitcher;
