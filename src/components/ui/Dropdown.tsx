import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

interface DropdownProps<T extends string = string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

export function Dropdown<T extends string = string>({
  value,
  options,
  onChange,
  label,
  placeholder = 'Select',
  className = '',
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={`relative flex flex-col gap-1.5 ${className}`} ref={ref}>
      {label && (
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</span>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-left text-sm transition hover:border-neutral-300 sm:px-3.5 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
      >
        <span
          className={`min-w-0 truncate ${selected ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400'}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-neutral-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
          >
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  <span className="mt-0.5 w-4 shrink-0">
                    {opt.value === value && <Check className="h-4 w-4 text-neutral-900 dark:text-white" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium text-neutral-800 dark:text-neutral-100">
                      {opt.label}
                    </span>
                    {opt.description && (
                      <span className="text-xs text-neutral-500">{opt.description}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
