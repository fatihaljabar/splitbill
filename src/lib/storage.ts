import { calculateBill } from '../../shared/calculate.ts';
import type { Bill, HistoryEntry } from '../../shared/types.ts';

const HISTORY_KEY = 'splitbill_history';
const BILLS_KEY = 'splitbill_bills';
const BILL_INDEX_KEY = 'splitbill_billIndex';
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
  } catch {
    /* ignore */
  }
  return { lang: 'id', theme: 'light' };
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const MAX_DIMENSION = 1600;

/** Kecilkan foto struk sebelum disimpan — sisi terpanjang 1600px, JPEG q0.8. Pakai
 * `loadImage` yang sudah ada di ocr.ts, bukan pemuat gambar kedua.
 *
 * Impor dinamis, sengaja: storage.ts dimuat lewat useApp.ts di SETIAP halaman, sedangkan
 * ocr.ts (>1900 baris, termasuk tesseract.js) sebelumnya cuma dimuat lazy oleh Scan/Review.
 * Impor statis di sini akan menarik seluruh ocr.ts ke bundle awal semua halaman. Tidak ada
 * biaya nyata — saat fungsi ini jalan, ocr.ts sudah termuat dari alur scan sebelumnya. */
async function compressReceiptImage(dataUrl: string): Promise<string> {
  try {
    const { loadImage } = await import('./ocr.ts');
    const img = await loadImage(dataUrl);
    const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch {
    return dataUrl;
  }
}

/** Satu salinan per bill, disimpan di bawah `id` saja — bukan di bawah `shortCode` DAN `id`
 * seperti sebelumnya (itu yang bikin foto struk 3 MB jadi ±6 MB, ditambah salinan ketiga di
 * HistoryEntry sebelum ini jadi ±9 MB). `splitbill_billIndex` cuma peta shortCode → id. */
export async function saveBill(bill: Bill): Promise<Bill> {
  const toSave = bill.receiptImage
    ? { ...bill, receiptImage: await compressReceiptImage(bill.receiptImage) }
    : bill;

  const bills = loadAllBills();
  bills[toSave.id] = toSave;
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));

  const index = loadBillIndex();
  index[toSave.shortCode] = toSave.id;
  localStorage.setItem(BILL_INDEX_KEY, JSON.stringify(index));

  const calc = calculateBill(toSave);
  const entry: HistoryEntry = {
    id: toSave.id,
    shortCode: toSave.shortCode,
    eventName: toSave.eventName || 'Untitled',
    createdAt: toSave.createdAt,
    expiresAt: toSave.expiresAt,
    grandTotal: calc.grandTotal,
    participantCount: toSave.participants.length,
  };
  const history = loadHistory().filter((h) => h.id !== toSave.id);
  history.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));

  return toSave;
}

function loadBillIndex(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BILL_INDEX_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

function resolveId(codeOrId: string): string {
  return loadBillIndex()[codeOrId] ?? codeOrId;
}

export function loadBill(codeOrId: string): Bill | null {
  const bills = loadAllBills();
  const bill = bills[resolveId(codeOrId)] ?? null;
  if (!bill) return null;
  if (Date.now() > bill.expiresAt) {
    deleteBill(bill.id);
    return null;
  }
  return bill;
}

function loadAllBills(): Record<string, Bill> {
  try {
    const raw = localStorage.getItem(BILLS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {};
}

export function deleteBill(id: string): void {
  const bills = loadAllBills();
  delete bills[id];
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));

  const index = loadBillIndex();
  for (const code of Object.keys(index)) {
    if (index[code] === id) delete index[code];
  }
  localStorage.setItem(BILL_INDEX_KEY, JSON.stringify(index));
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

export function deleteHistoryEntry(id: string): void {
  const history = loadHistory().filter((h) => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  deleteBill(id);
}

export function clearHistory(): void {
  for (const entry of loadHistory()) deleteBill(entry.id);
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
  } catch {
    /* ignore */
  }
  return null;
}

export function purgeExpired(): void {
  const now = Date.now();
  const bills = loadAllBills();
  let changed = false;
  for (const id of Object.keys(bills)) {
    if (bills[id].expiresAt < now) {
      delete bills[id];
      changed = true;
    }
  }
  if (!changed) return;
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));

  const index = loadBillIndex();
  let indexChanged = false;
  for (const code of Object.keys(index)) {
    if (!bills[index[code]]) {
      delete index[code];
      indexChanged = true;
    }
  }
  if (indexChanged) localStorage.setItem(BILL_INDEX_KEY, JSON.stringify(index));
}
