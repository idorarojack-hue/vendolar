import React from 'react';
import classNames from 'classnames';
import '../../pages/analysis-tools/analysis-tools.scss';
import './vindolar.scss';

type TNumberFieldProps = {
    label: string;
    value: number;
    onChange: (value: number) => void;
    unit?: string;
    min?: number;
    max?: number;
    step?: number;
    decimals?: number;
    disabled?: boolean;
    hint?: string;
    className?: string;
};

/** Number input that keeps what the user types and commits a clean value on blur / Enter. */
const NumberField = ({
    label,
    value,
    onChange,
    unit,
    min,
    max,
    step = 1,
    decimals = 2,
    disabled,
    hint,
    className,
}: TNumberFieldProps) => {
    const [text, setText] = React.useState(String(value));
    const id = React.useId();

    React.useEffect(() => setText(String(value)), [value]);

    const commit = (raw: string) => {
        let next = Number(raw);
        if (!Number.isFinite(next) || raw.trim() === '') {
            setText(String(value));
            return;
        }
        if (min !== undefined) next = Math.max(min, next);
        if (max !== undefined) next = Math.min(max, next);
        next = Number(next.toFixed(decimals));
        setText(String(next));
        if (next !== value) onChange(next);
    };

    return (
        <div className={classNames('vd-number', className)}>
            <label className='vd-field__label' htmlFor={id}>
                {label}
            </label>
            <div className={classNames('vd-number__box', { 'vd-number__box--disabled': disabled })}>
                <input
                    id={id}
                    inputMode='decimal'
                    value={text}
                    disabled={disabled}
                    step={step}
                    onChange={e => setText(e.target.value.replace(/[^0-9.]/g, ''))}
                    onBlur={e => commit(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
                />
                {unit && <span className='vd-number__unit'>{unit}</span>}
            </div>
            {hint && <small className='vd-number__hint'>{hint}</small>}
        </div>
    );
};

export default NumberField;
