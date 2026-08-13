import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  full: 'max-w-2xl',
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden p-0 sm:items-center sm:p-4 md:p-6"
          style={{
            paddingTop: 'var(--safe-top)',
            paddingBottom: 'var(--safe-bottom)',
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className={`relative z-10 flex w-full ${sizes[size]} max-h-[min(92dvh,920px)] flex-col overflow-hidden rounded-t-3xl border border-neutral-200/80 bg-white shadow-2xl landscape:max-h-[88dvh] sm:rounded-3xl dark:border-neutral-700 dark:bg-neutral-900`}
          >
            {title && (
              <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 bg-white/95 px-4 py-3.5 backdrop-blur sm:px-5 sm:py-4 dark:border-neutral-800 dark:bg-neutral-900/95">
                <h2 className="min-w-0 truncate text-sm font-semibold text-neutral-900 sm:text-base dark:text-white">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className="overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
