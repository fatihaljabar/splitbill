import { Moon, Sun, Languages, Receipt } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { motion } from 'framer-motion';

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme, lang, setLang, tr } = useApp();
  const location = useLocation();
  const isFriend = location.pathname.startsWith('/s/');
  const path = location.pathname;
  const isHome = path === '/' || path === '';
  const isScan = path === '/scan';

  return (
    <div className="flex min-h-dvh min-h-svh w-full max-w-[100%] flex-col overflow-x-hidden bg-[#FAFAF9] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      {!isFriend && (
        <header
          className="sticky top-0 z-40 w-full max-w-[100%] shrink-0 border-b border-neutral-200/70 bg-[#FAFAF9]/85 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/85"
          style={{ paddingTop: 'var(--safe-top)' }}
        >
          <div className="app-shell flex h-12 items-center justify-between sm:h-14 md:h-16">
            <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white sm:h-9 sm:w-9 dark:bg-white dark:text-neutral-900">
                <Receipt className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="truncate text-sm font-semibold tracking-tight sm:text-[15px]">
                {tr('appName')}
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <button
                type="button"
                onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
                className="flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 sm:px-2.5 dark:text-neutral-300 dark:hover:bg-neutral-800"
                aria-label={tr('language')}
              >
                <Languages className="h-4 w-4 shrink-0" />
                <span className="hidden min-[360px]:inline">{lang.toUpperCase()}</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                aria-label={tr('theme')}
              >
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </header>
      )}
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className={`app-shell min-w-0 flex-1 ${
          isFriend
            ? 'py-4 sm:py-6'
            : isHome || isScan
              ? 'pb-6 pt-4 sm:pb-8 sm:pt-5 md:pt-6'
              : 'pb-8 pt-4 sm:pb-10 sm:pt-5 md:pt-6'
        }`}
      >
        {children}
      </motion.main>
    </div>
  );
}
