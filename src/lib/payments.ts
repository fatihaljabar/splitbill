import type { Bill, PaymentStatus } from '../types';
import { loadBill, saveBill } from './storage';

const PAYMENTS_KEY = 'splitbill_payments';
const CHANNEL = 'splitbill-payments';

export type PaymentMap = Record<string, PaymentStatus>; // participantId -> status

type Store = Record<
  string,
  {
    byParticipant: PaymentMap;
    updatedAt: number;
  }
>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(PAYMENTS_KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* ignore */
  }
  return {};
}

function writeStore(store: Store): void {
  localStorage.setItem(PAYMENTS_KEY, JSON.stringify(store));
}

export function getPaymentMap(billId: string): PaymentMap {
  const entry = readStore()[billId];
  return entry?.byParticipant ? { ...entry.byParticipant } : {};
}

/** Merge payment statuses into a bill (payer always paid). */
export function applyPaymentsToBill(bill: Bill, map?: PaymentMap): Bill {
  const payments = map ?? getPaymentMap(bill.id);
  return {
    ...bill,
    participants: bill.participants.map((p) => {
      if (p.isPayer) {
        return { ...p, paymentStatus: 'paid' as const };
      }
      const fromMap = payments[p.id];
      if (fromMap) return { ...p, paymentStatus: fromMap };
      return p;
    }),
  };
}

/** Save payment overlay + update bill in localStorage. */
export function setParticipantPaid(
  bill: Bill,
  participantId: string,
  status: PaymentStatus
): Bill {
  const store = readStore();
  const prev = store[bill.id]?.byParticipant ?? {};
  const nextMap: PaymentMap = { ...prev, [participantId]: status };

  // Payer always paid
  for (const p of bill.participants) {
    if (p.isPayer) nextMap[p.id] = 'paid';
  }

  store[bill.id] = { byParticipant: nextMap, updatedAt: Date.now() };
  writeStore(store);

  const updated = applyPaymentsToBill(bill, nextMap);
  try {
    saveBill(updated);
  } catch {
    /* quota */
  }

  broadcastPayments(bill.id, nextMap);
  return updated;
}

export function syncPaymentsFromBill(bill: Bill): Bill {
  const store = readStore();
  const fromOverlay = store[bill.id]?.byParticipant ?? {};
  const fromBill: PaymentMap = {};
  for (const p of bill.participants) {
    fromBill[p.id] = p.isPayer ? 'paid' : p.paymentStatus;
  }
  // Overlay wins if newer; merge preferring 'paid'
  const merged: PaymentMap = { ...fromBill };
  for (const [id, st] of Object.entries(fromOverlay)) {
    if (st === 'paid' || !merged[id]) merged[id] = st;
    if (merged[id] !== 'paid' && st === 'paid') merged[id] = 'paid';
  }
  for (const p of bill.participants) {
    if (p.isPayer) merged[p.id] = 'paid';
  }

  store[bill.id] = { byParticipant: merged, updatedAt: Date.now() };
  writeStore(store);

  return applyPaymentsToBill(bill, merged);
}

function broadcastPayments(billId: string, map: PaymentMap): void {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: 'payments', billId, map, ts: Date.now() });
    bc.close();
  } catch {
    /* unsupported */
  }
  try {
    // storage event for other tabs (same origin)
    localStorage.setItem(
      `splitbill_pay_ping_${billId}`,
      JSON.stringify({ ts: Date.now(), map })
    );
  } catch {
    /* ignore */
  }
}

export type PaymentListener = (billId: string, map: PaymentMap) => void;

export function subscribePayments(cb: PaymentListener): () => void {
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (ev) => {
      const data = ev.data;
      if (data?.type === 'payments' && data.billId && data.map) {
        cb(data.billId, data.map);
      }
    };
  } catch {
    bc = null;
  }

  const onStorage = (e: StorageEvent) => {
    if (!e.key) return;
    if (e.key === PAYMENTS_KEY || e.key.startsWith('splitbill_pay_ping_')) {
      const billId = e.key.startsWith('splitbill_pay_ping_')
        ? e.key.replace('splitbill_pay_ping_', '')
        : null;
      if (billId) {
        cb(billId, getPaymentMap(billId));
      } else if (e.key === PAYMENTS_KEY) {
        // full store changed — caller should refresh active bill
        cb('*', {});
      }
    }
    // Friend/creator saved full bill
    if (e.key === 'splitbill_bills' && e.newValue) {
      cb('*', {});
    }
  };

  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener('storage', onStorage);
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
}

/** Reload bill from storage and merge payments. */
export function reloadBillWithPayments(codeOrId: string): Bill | null {
  const bill = loadBill(codeOrId);
  if (!bill) return null;
  return syncPaymentsFromBill(bill);
}
