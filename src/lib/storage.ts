import type { Bill, HistoryEntry } from '../../shared/types.ts';
import { calculateBill } from '../../shared/calculate.ts';

const HISTORY_KEY = 'splitbill_history';
const BILLS_KEY = 'splitbill_bills';
const SETTINGS_KEY = 'splitbill_settings';
const DRAFT_KEY = 'splitbill_draft';

export interface AppSettings {
  lang: 'id' | 'en';
  theme: 'light' | 'dark';
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { lang: 'id', theme: 'light' };
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function saveBill(bill: Bill): void {
  const bills = loadAllBills();
  bills[bill.shortCode] = bill;
  bills[bill.id] = bill;
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));

  const calc = calculateBill(bill);
  const entry: HistoryEntry = {
    id: bill.id,
    shortCode: bill.shortCode,
    eventName: bill.eventName || 'Untitled',
    createdAt: bill.createdAt,
    expiresAt: bill.expiresAt,
    grandTotal: calc.grandTotal,
    participantCount: bill.participants.length,
    bill,
  };
  const history = loadHistory().filter((h) => h.id !== bill.id);
  history.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

export function loadBill(codeOrId: string): Bill | null {
  const bills = loadAllBills();
  const bill = bills[codeOrId] ?? null;
  if (!bill) return null;
  if (Date.now() > bill.expiresAt) {
    deleteBill(bill.id, bill.shortCode);
    return null;
  }
  return bill;
}

export function loadBillIncludingExpired(codeOrId: string): { bill: Bill | null; expired: boolean } {
  const bills = loadAllBills();
  const bill = bills[codeOrId] ?? null;
  if (!bill) {
    // Check history for expired
    const hist = loadHistory().find((h) => h.id === codeOrId || h.shortCode === codeOrId);
    if (hist && Date.now() > hist.expiresAt) {
      return { bill: hist.bill, expired: true };
    }
    return { bill: null, expired: false };
  }
  if (Date.now() > bill.expiresAt) {
    return { bill, expired: true };
  }
  return { bill, expired: false };
}

function loadAllBills(): Record<string, Bill> {
  try {
    const raw = localStorage.getItem(BILLS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

export function deleteBill(id: string, shortCode?: string): void {
  const bills = loadAllBills();
  delete bills[id];
  if (shortCode) delete bills[shortCode];
  // Also remove by scanning
  for (const key of Object.keys(bills)) {
    if (bills[key]?.id === id) delete bills[key];
  }
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function deleteHistoryEntry(id: string): void {
  const history = loadHistory().filter((h) => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  const entry = loadHistory().find((h) => h.id === id);
  deleteBill(id, entry?.shortCode);
  // also clean bills
  const bills = loadAllBills();
  for (const key of Object.keys(bills)) {
    if (bills[key]?.id === id) delete bills[key];
  }
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
}

export function clearHistory(): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
}

export function saveDraft(bill: Partial<Bill> | null): void {
  if (!bill) {
    localStorage.removeItem(DRAFT_KEY);
    return;
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(bill));
}

export function loadDraft(): Partial<Bill> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

export function purgeExpired(): void {
  const now = Date.now();
  const bills = loadAllBills();
  let changed = false;
  for (const key of Object.keys(bills)) {
    if (bills[key].expiresAt < now) {
      delete bills[key];
      changed = true;
    }
  }
  if (changed) localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
}
