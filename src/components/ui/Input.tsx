import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  inputClassName?: string;
  compact?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      leftIcon,
      rightSlot,
      className = '',
      inputClassName = '',
      compact = false,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className={`flex min-w-0 flex-col ${compact ? 'gap-1' : 'gap-1.5'} ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400"
          >
            {label}
          </label>
        )}
        <div className="relative flex min-w-0 items-center">
          {leftIcon && (
            <span className="pointer-events-none absolute left-2.5 text-neutral-400">{leftIcon}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full min-w-0 rounded-lg border border-neutral-200 bg-white text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-800 ${
              compact
                ? 'h-8 px-2.5 py-1.5 text-[13px]'
                : 'h-9 px-2.5 py-2 text-[13px] sm:text-sm'
            } ${leftIcon ? 'pl-9' : ''} ${rightSlot ? 'pr-10' : ''} ${
              error ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''
            } ${inputClassName}`}
            {...props}
          />
          {rightSlot && <span className="absolute right-2">{rightSlot}</span>}
        </div>
        {hint && !error && <p className="text-[10px] text-neutral-500">{hint}</p>}
        {error && <p className="text-[10px] text-red-500">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
