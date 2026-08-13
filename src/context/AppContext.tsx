import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Bill, Lang, Theme } from '../types';
import { t, type TranslationKey } from '../i18n/translations';
import {
  loadSettings,
  saveSettings,
  purgeExpired,
  saveBill,
  loadBill,
  loadDraft,
  saveDraft,
} from '../lib/storage';
import { shortCode, uid } from '../lib/format';

interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

interface AppContextValue {
  lang: Lang;
  theme: Theme;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  tr: (key: TranslationKey) => string;
  toasts: Toast[];
  toast: (message: string, type?: Toast['type']) => void;
  dismissToast: (id: string) => void;
  currentBill: Bill | null;
  setCurrentBill: (b: Bill | null) => void;
  updateBill: (patch: Partial<Bill> | ((prev: Bill) => Bill)) => void;
  createEmptyBill: () => Bill;
  persistBill: (bill?: Bill) => void;
  loadBillByCode: (code: string) => Bill | null;
}

const AppContext = createContext<AppContextValue | null>(null);

const DAY_MS = 24 * 60 * 60 * 1000;

export function createEmptyBill(): Bill {
  const now = Date.now();
  return {
    id: uid(),
    shortCode: shortCode(8),
    eventName: '',
    storeName: '',
    date: new Date().toISOString().slice(0, 10),
    participants: [],
    items: [],
    tax: 0,
    taxIsPercent: true,
    serviceCharge: 0,
    serviceChargeIsPercent: true,
    discount: 0,
    discountIsPercent: false,
    extraFees: 0,
    notes: '',
    splitMethod: 'by_item',
    privacyMode: 'public',
    hideParticipantNames: false,
    bankAccount: { bankName: '', accountNumber: '', accountName: '' },
    createdAt: now,
    expiresAt: now + DAY_MS,
    rounding: false,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => loadSettings().lang);
  const [theme, setThemeState] = useState<Theme>(() => loadSettings().theme);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [currentBill, setCurrentBill] = useState<Bill | null>(() => {
    const draft = loadDraft();
    if (draft && draft.id) return draft as Bill;
    return null;
  });

  useEffect(() => {
    purgeExpired();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.lang = lang;
    saveSettings({ lang, theme });
  }, [lang, theme]);

  // Autosave draft
  useEffect(() => {
    if (currentBill) {
      const t = setTimeout(() => saveDraft(currentBill), 400);
      return () => clearTimeout(t);
    }
  }, [currentBill]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const setTheme = useCallback((th: Theme) => setThemeState(th), []);

  const tr = useCallback((key: TranslationKey) => t(lang, key), [lang]);

  const toast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = uid();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const updateBill = useCallback(
    (patch: Partial<Bill> | ((prev: Bill) => Bill)) => {
      setCurrentBill((prev) => {
        if (!prev) return prev;
        if (typeof patch === 'function') return patch(prev);
        return { ...prev, ...patch };
      });
    },
    []
  );

  const persistBill = useCallback(
    (bill?: Bill) => {
      const b = bill ?? currentBill;
      if (!b) return;
      // refresh expiry on save if needed
      const toSave = { ...b };
      if (toSave.expiresAt < Date.now()) {
        toSave.expiresAt = Date.now() + DAY_MS;
      }
      saveBill(toSave);
      setCurrentBill(toSave);
      saveDraft(null);
    },
    [currentBill]
  );

  const loadBillByCode = useCallback((code: string) => loadBill(code), []);

  const value = useMemo(
    () => ({
      lang,
      theme,
      setLang,
      setTheme,
      tr,
      toasts,
      toast,
      dismissToast,
      currentBill,
      setCurrentBill,
      updateBill,
      createEmptyBill,
      persistBill,
      loadBillByCode,
    }),
    [
      lang,
      theme,
      setLang,
      setTheme,
      tr,
      toasts,
      toast,
      dismissToast,
      currentBill,
      updateBill,
      persistBill,
      loadBillByCode,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
