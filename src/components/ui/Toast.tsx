import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export function ToastContainer() {
  const { toasts, dismissToast } = useApp();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[100] mx-auto flex w-full max-w-sm flex-col gap-2 px-3 sm:px-4"
      style={{ bottom: 'max(1rem, var(--safe-bottom))' }}
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-neutral-200/80 bg-white/95 px-3.5 py-3 shadow-lg backdrop-blur sm:items-center sm:px-4 dark:border-neutral-700 dark:bg-neutral-900/95"
          >
            {t.type === 'success' && (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500 sm:mt-0" />
            )}
            {t.type === 'error' && (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500 sm:mt-0" />
            )}
            {(!t.type || t.type === 'info') && (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500 sm:mt-0" />
            )}
            <p className="min-w-0 flex-1 break-words text-sm text-neutral-800 dark:text-neutral-100">
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
