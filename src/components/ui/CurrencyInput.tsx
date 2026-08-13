import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';

interface CurrencyInputProps {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  compact?: boolean;
}

/**
 * Currency field that allows empty while editing.
 * Commits 0 only when blurred empty — never traps "0" so user can clear & retype.
 */
export function CurrencyInput({
  label,
  value,
  onChange,
  className = '',
  placeholder = '0',
  compact = false,
}: CurrencyInputProps) {
  const { tr } = useApp();
  const focused = useRef(false);
  const [text, setText] = useState(() => (value > 0 ? formatDots(value) : ''));

  // Sync from parent only when not focused
  useEffect(() => {
    if (focused.current) return;
    setText(value > 0 ? formatDots(value) : value === 0 ? '' : formatDots(value));
  }, [value]);

  const commit = (rawDigits: string) => {
    if (rawDigits === '') {
      onChange(0);
      return;
    }
    const num = parseInt(rawDigits, 10);
    onChange(Number.isFinite(num) ? num : 0);
  };

  return (
    <div className={`flex min-w-0 flex-col ${compact ? 'gap-1' : 'gap-1.5'} ${className}`}>
      {label && (
        <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
          {label}
        </label>
      )}
      <div className="relative min-w-0">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-neutral-400">
          {tr('currency')}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={text}
          placeholder={placeholder}
          onFocus={(e) => {
            focused.current = true;
            // Select all so replacing "0" doesn't need caret at start
            requestAnimationFrame(() => e.target.select());
          }}
          onBlur={() => {
            focused.current = false;
            const digits = text.replace(/[^\d]/g, '');
            commit(digits);
            // Normalize display after blur
            const num = digits ? parseInt(digits, 10) : 0;
            setText(num > 0 ? formatDots(num) : '');
          }}
          onChange={(e) => {
            // Allow empty; only keep digits
            const digits = e.target.value.replace(/[^\d]/g, '');
            if (digits === '') {
              setText('');
              // Don't force parent to 0 on every keystroke while clearing —
              // still notify 0 so calcs stay consistent, but keep local empty
              onChange(0);
              return;
            }
            // Avoid leading zeros trap: "0" + "5" → allow typing over
            const normalized = digits.replace(/^0+(?=\d)/, '');
            const num = parseInt(normalized || '0', 10);
            setText(formatDots(num));
            onChange(num);
          }}
          className={`w-full min-w-0 rounded-lg border border-neutral-200 bg-white pl-9 pr-2.5 text-[13px] text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-800 ${
            compact ? 'h-8 py-1.5' : 'h-9 py-2'
          }`}
        />
      </div>
    </div>
  );
}

function formatDots(n: number) {
  return Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
