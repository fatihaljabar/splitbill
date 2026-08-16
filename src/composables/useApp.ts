import { nextTick, reactive, watch } from 'vue';
import { shortCode, uid } from '../../shared/format.ts';
import type { Bill, Lang, Theme } from '../../shared/types.ts';
import { type TranslationKey, t } from '../i18n/translations.ts';
import {
  loadBill,
  loadDraft,
  loadSettings,
  purgeExpired,
  saveBill,
  saveDraft,
  saveSettings,
} from '../lib/storage.ts';

interface Toast {
  id: string;
  message: string;
  type?: 'success' | 'error' | 'info';
}

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

// Satu instance di lingkup modul — dipakai bersama tanpa Provider/Pinia. Modul
// cuma dimuat sekali, jadi ini sudah cukup jadi singleton.
const initialSettings = loadSettings();
const initialDraft = loadDraft();

const state = reactive({
  lang: initialSettings.lang as Lang,
  theme: initialSettings.theme as Theme,
  toasts: [] as Toast[],
  currentBill: (initialDraft?.id ? initialDraft : null) as Bill | null,
});

purgeExpired();

watch(
  () => [state.lang, state.theme] as const,
  ([lang, theme]) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.lang = lang;
    saveSettings({ lang, theme });
  },
  { immediate: true },
);

let draftTimer: ReturnType<typeof setTimeout> | undefined;
// persistBill() memakai ini untuk menahan autosave draft sesaat — tanpa ini, watcher yang
// sama menulis ulang draft ~400ms setelah persistBill sengaja menghapusnya (splitbill_draft
// jadi menyimpan salinan ketiga receiptImage yang sudah dikompresi, persis pemborosan yang
// mau dihindari tugas ini).
let suppressDraftSave = false;
watch(
  () => state.currentBill,
  (bill) => {
    clearTimeout(draftTimer);
    if (suppressDraftSave) return;
    if (bill) draftTimer = setTimeout(() => saveDraft(bill), 400);
  },
  { deep: true },
);

function setLang(l: Lang): void {
  state.lang = l;
}

function setTheme(th: Theme): void {
  state.theme = th;
}

function tr(key: TranslationKey): string {
  return t(state.lang, key);
}

function toast(message: string, type: Toast['type'] = 'info'): void {
  const id = uid();
  state.toasts.push({ id, message, type });
  setTimeout(() => dismissToast(id), 3200);
}

function dismissToast(id: string): void {
  const i = state.toasts.findIndex((x) => x.id === id);
  if (i !== -1) state.toasts.splice(i, 1);
}

function setCurrentBill(bill: Bill | null): void {
  state.currentBill = bill;
}

function updateBill(patch: Partial<Bill> | ((prev: Bill) => Bill)): void {
  if (!state.currentBill) return;
  const next =
    typeof patch === 'function' ? patch(state.currentBill) : { ...state.currentBill, ...patch };
  state.currentBill = next;
}

async function persistBill(bill?: Bill): Promise<void> {
  const b = bill ?? state.currentBill;
  if (!b) return;
  const toSave = { ...b };
  if (toSave.expiresAt < Date.now()) {
    toSave.expiresAt = Date.now() + DAY_MS;
  }
  suppressDraftSave = true;
  state.currentBill = await saveBill(toSave);
  saveDraft(null);
  await nextTick();
  suppressDraftSave = false;
}

function loadBillByCode(code: string): Bill | null {
  return loadBill(code);
}

export function useApp() {
  return {
    state,
    setLang,
    setTheme,
    tr,
    toast,
    dismissToast,
    setCurrentBill,
    updateBill,
    createEmptyBill,
    persistBill,
    loadBillByCode,
  };
}
