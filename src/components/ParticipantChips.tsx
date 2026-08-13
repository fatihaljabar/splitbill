import { motion } from 'framer-motion';
import type { Participant } from '../types';

interface Props {
  participants: Participant[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  selectAllLabel?: string;
  deselectAllLabel?: string;
}

const colors = [
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
];

export function participantColor(index: number) {
  return colors[index % colors.length];
}

export function ParticipantChips({
  participants,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  selectAllLabel,
  deselectAllLabel,
}: Props) {
  return (
    <div className="flex flex-col gap-1 sm:gap-1.5">
      {(onSelectAll || onDeselectAll) && (
        <div className="flex gap-2">
          {onSelectAll && (
            <button
              type="button"
              onClick={onSelectAll}
              className="text-[10px] font-medium leading-none text-neutral-500 hover:text-neutral-800 sm:text-[11px] dark:hover:text-neutral-200"
            >
              {selectAllLabel}
            </button>
          )}
          {onDeselectAll && (
            <button
              type="button"
              onClick={onDeselectAll}
              className="text-[10px] font-medium leading-none text-neutral-500 hover:text-neutral-800 sm:text-[11px] dark:hover:text-neutral-200"
            >
              {deselectAllLabel}
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1 sm:gap-1.5">
        {participants.map((p, i) => {
          const selected = selectedIds.includes(p.id);
          return (
            <motion.button
              key={p.id}
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => onToggle(p.id)}
              className={`inline-flex max-w-[7rem] items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-4 transition sm:max-w-[9rem] sm:px-2 sm:py-1 sm:text-[11px] sm:leading-4 md:max-w-[10rem] ${
                selected
                  ? `${participantColor(i)} ring-1 ring-inset ring-black/5 dark:ring-white/10`
                  : 'bg-neutral-100 text-neutral-400 line-through decoration-neutral-300 dark:bg-neutral-800 dark:text-neutral-500'
              }`}
            >
              <span className="truncate">
                <span className="opacity-70">{selected ? '✓' : '✕'}</span> {p.name}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
