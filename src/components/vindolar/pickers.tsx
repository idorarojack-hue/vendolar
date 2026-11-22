import classNames from 'classnames';
import { useVolatilitySymbols } from '@/hooks/useMarketData';
import { localize } from '@deriv-com/translations';
import './vindolar.scss';

/** Volatility market dropdown. */
export const MarketSelect = ({
    value,
    onChange,
    disabled,
    label = localize('Market'),
    include_all = false,
}: {
    value: string;
    onChange: (symbol: string) => void;
    disabled?: boolean;
    label?: string;
    /** Adds an "All volatility markets" option with value "ALL". */
    include_all?: boolean;
}) => {
    const { symbols } = useVolatilitySymbols();
    return (
        <label className='vd-number'>
            <span className='vd-field__label'>{label}</span>
            <select className='vd-select' value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
                {include_all && <option value='ALL'>{localize('All volatility markets')}</option>}
                {symbols.length === 0 && <option value={value}>{localize('Loading…')}</option>}
                {symbols.map(s => (
                    <option key={s.symbol} value={s.symbol}>
                        {s.name}
                    </option>
                ))}
            </select>
        </label>
    );
};

export type TContractChoice = {
    contract_type: string;
    /** Digit for Over/Under/Matches/Differs. */
    digit?: number;
};

export const CONTRACT_CHOICES = [
    { contract_type: 'DIGITEVEN', label: 'Even', needs_digit: false },
    { contract_type: 'DIGITODD', label: 'Odd', needs_digit: false },
    { contract_type: 'DIGITOVER', label: 'Over', needs_digit: true },
    { contract_type: 'DIGITUNDER', label: 'Under', needs_digit: true },
    { contract_type: 'DIGITMATCH', label: 'Matches', needs_digit: true },
    { contract_type: 'DIGITDIFF', label: 'Differs', needs_digit: true },
    { contract_type: 'CALL', label: 'Rise', needs_digit: false },
    { contract_type: 'PUT', label: 'Fall', needs_digit: false },
] as const;

export const needsDigit = (contract_type: string) =>
    CONTRACT_CHOICES.find(c => c.contract_type === contract_type)?.needs_digit ?? false;

/** Digit valid for a contract: Over 9 and Under 0 can't win, so they're clamped. */
export const validDigit = (contract_type: string, digit: number) => {
    if (contract_type === 'DIGITOVER') return Math.min(digit, 8);
    if (contract_type === 'DIGITUNDER') return Math.max(digit, 1);
    return digit;
};

/** Contract type chips + digit picker when needed. */
export const ContractPicker = ({
    value,
    onChange,
    disabled,
    allowed,
}: {
    value: TContractChoice;
    onChange: (value: TContractChoice) => void;
    disabled?: boolean;
    /** Limit the choices (contract types). */
    allowed?: string[];
}) => {
    const choices = CONTRACT_CHOICES.filter(c => !allowed || allowed.includes(c.contract_type));
    const needs_digit = needsDigit(value.contract_type);
    return (
        <div className='vd-number'>
            <span className='vd-field__label'>{localize('Contract')}</span>
            <div className='vd-chip-select' role='radiogroup' aria-label={localize('Contract')}>
                {choices.map(c => (
                    <button
                        key={c.contract_type}
                        type='button'
                        role='radio'
                        aria-checked={value.contract_type === c.contract_type}
                        disabled={disabled}
                        className={classNames({ 'is-active': value.contract_type === c.contract_type })}
                        onClick={() =>
                            onChange({
                                contract_type: c.contract_type,
                                digit: c.needs_digit ? validDigit(c.contract_type, value.digit ?? 4) : undefined,
                            })
                        }
                    >
                        {localize(c.label)}
                    </button>
                ))}
            </div>
            {needs_digit && (
                <div className='vd-digit-picker' role='radiogroup' aria-label={localize('Digit')}>
                    {Array.from({ length: 10 }, (_, d) => {
                        const invalid = validDigit(value.contract_type, d) !== d;
                        return (
                            <button
                                key={d}
                                type='button'
                                role='radio'
                                aria-checked={value.digit === d}
                                disabled={disabled || invalid}
                                className={classNames({ 'is-active': value.digit === d })}
                                onClick={() => onChange({ ...value, digit: d })}
                            >
                                {d}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
