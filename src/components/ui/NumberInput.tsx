import { useEffect, useRef, useState } from 'react';

interface NumberInputProps {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Value used when field is empty on blur (default: min ?? 0) */
  emptyValue?: number;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  suffix?: string;
  compact?: boolean;
  allowDecimal?: boolean;
}

/**
 * Number field that can be fully cleared while typing.
 * Parent always receives a number; local state may be "" during edit.
 */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  emptyValue,
  className = '',
  inputClassName = '',
  placeholder,
  suffix,
  compact = false,
  allowDecimal = false,
}: NumberInputProps) {
  const focused = useRef(false);
  const fallback = emptyValue ?? min ?? 0;
  const [text, setText] = useState(() => String(value));

  useEffect(() => {
    if (focused.current) return;
    setText(String(value));
  }, [value]);

  const clamp = (n: number) => {
    let x = n;
    if (min != null && x < min) x = min;
    if (max != null && x > max) x = max;
    return x;
  };

  const parse = (s: string): number | null => {
    if (s.trim() === '' || s === '-' || s === '.') return null;
    const n = allowDecimal ? parseFloat(s) : parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className={`flex min-w-0 flex-col ${compact ? 'gap-1' : 'gap-1.5'} ${className}`}>
      {label && (
        <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
          {label}
        </label>
      )}
      <div className="relative min-w-0">
        <input
          type="text"
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          value={text}
          placeholder={placeholder ?? String(fallback)}
          onFocus={(e) => {
            focused.current = true;
            // Select all so typing replaces "0" / "1" immediately
            e.target.select();
          }}
          onBlur={() => {
            focused.current = false;
            const n = parse(text);
            const next = clamp(n == null ? fallback : n);
            onChange(next);
            setText(String(next));
          }}
          onChange={(e) => {
            const raw = e.target.value;
            // Allow empty and partial input
            if (raw === '') {
              setText('');
              return;
            }
            const pattern = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
            if (!pattern.test(raw)) return;
            // Block just "-" keep as text
            setText(raw);
            const n = parse(raw);
            if (n != null) {
              // Live-update parent without clamping min while typing (except max)
              let next = n;
              if (max != null && next > max) next = max;
              onChange(next);
            }
          }}
          className={`w-full min-w-0 rounded-lg border border-neutral-200 bg-white text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-800 ${
            compact ? 'h-8 px-2.5 py-1.5 text-[13px]' : 'h-9 px-2.5 py-2 text-[13px] sm:text-sm'
          } ${suffix ? 'pr-8' : ''} ${inputClassName}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
