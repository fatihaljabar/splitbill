import { useEffect, useState } from 'react';
import { formatCountdown } from '../lib/format';
import { useApp } from '../context/AppContext';
import { Clock } from 'lucide-react';

export function Countdown({ expiresAt, compact }: { expiresAt: number; compact?: boolean }) {
  const { tr } = useApp();
  const [left, setLeft] = useState(expiresAt - Date.now());

  useEffect(() => {
    const id = setInterval(() => setLeft(expiresAt - Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (left <= 0) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600 sm:gap-1.5 sm:px-2.5 sm:text-xs dark:bg-red-950/40 dark:text-red-400">
        <Clock className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
        <span className="truncate">{tr('expired')}</span>
      </span>
    );
  }

  const text = formatCountdown(left, {
    days: tr('days'),
    hours: tr('hours'),
    minutes: tr('minutes'),
    seconds: tr('seconds'),
  });

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 sm:gap-1.5 sm:px-2.5 sm:text-xs dark:bg-amber-950/40 dark:text-amber-400">
      <Clock className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
      <span className="truncate">
        {compact ? text : `${tr('countdown')}: ${text}`}
      </span>
    </span>
  );
}
