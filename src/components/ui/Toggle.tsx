interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left transition hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        {label && (
          <span className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">{label}</span>
        )}
        {description && <span className="text-[11px] leading-snug text-neutral-500">{description}</span>}
      </span>
      <span
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-neutral-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-neutral-900 ${
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
