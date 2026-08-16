import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBill } from './calculate.ts';
import type { Bill, BillItem, Participant } from './types.ts';

function participant(id: string, overrides: Partial<Participant> = {}): Participant {
  return { id, name: id, isPayer: false, paymentStatus: 'unpaid', ...overrides };
}

function item(id: string, price: number, qty: number, participantIds: string[]): BillItem {
  return { id, name: id, price, qty, participantIds };
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  const now = Date.now();
  return {
    id: 'bill-1',
    shortCode: 'TESTCODE',
    eventName: 'Test',
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
    splitMethod: 'equal',
    privacyMode: 'public',
    hideParticipantNames: false,
    bankAccount: { bankName: '', accountNumber: '', accountName: '' },
    createdAt: now,
    expiresAt: now + 86_400_000,
    rounding: false,
    ...overrides,
  };
}

function sumTotals(perPerson: { total: number }[]): number {
  return perPerson.reduce((s, p) => s + p.total, 0);
}

test('bagi rata dengan sisa pembulatan — tidak ada rupiah hilang atau tercipta', () => {
  const bill = makeBill({
    splitMethod: 'equal',
    participants: [participant('p1'), participant('p2'), participant('p3')],
    items: [item('i1', 100_001, 1, [])],
  });
  const calc = calculateBill(bill);

  assert.equal(calc.grandTotal, 100_001);
  assert.equal(sumTotals(calc.perPerson), 100_001);
  // sisa 2 rupiah harus jatuh ke 2 orang pertama, masing-masing +1
  assert.deepEqual(
    calc.perPerson.map((p) => p.total),
    [33_334, 33_334, 33_333],
  );
});

test('satu item milik banyak orang — dibagi rata antar pemilik', () => {
  const bill = makeBill({
    splitMethod: 'by_item',
    participants: [participant('p1'), participant('p2'), participant('p3', { isPayer: true })],
    items: [item('pizza', 120_000, 1, ['p1', 'p2', 'p3'])],
  });
  const calc = calculateBill(bill);

  assert.equal(calc.grandTotal, 120_000);
  assert.equal(sumTotals(calc.perPerson), 120_000);
  for (const p of calc.perPerson) {
    assert.equal(p.total, 40_000);
    assert.equal(p.items.length, 1);
    assert.equal(p.items[0].share, 40_000);
  }
});

test('pajak persen dan pajak nominal tetap menghasilkan jumlah yang sama', () => {
  const base = {
    splitMethod: 'equal' as const,
    participants: [participant('p1')],
    items: [item('i1', 100_000, 1, [])],
  };
  const percentBill = makeBill({ ...base, tax: 10, taxIsPercent: true });
  const fixedBill = makeBill({ ...base, tax: 10_000, taxIsPercent: false });

  const percentCalc = calculateBill(percentBill);
  const fixedCalc = calculateBill(fixedBill);

  assert.equal(percentCalc.taxAmount, 10_000);
  assert.equal(fixedCalc.taxAmount, 10_000);
  assert.equal(percentCalc.grandTotal, 110_000);
  assert.equal(fixedCalc.grandTotal, 110_000);
});

test('diskon persen mengurangi grand total sesuai persentase', () => {
  const bill = makeBill({
    splitMethod: 'equal',
    participants: [participant('p1')],
    items: [item('i1', 100_000, 1, [])],
    discount: 20,
    discountIsPercent: true,
  });
  const calc = calculateBill(bill);

  assert.equal(calc.discountAmount, 20_000);
  assert.equal(calc.grandTotal, 80_000);
});

test('rounding membulatkan grand total ke atas ke ratusan terdekat, tanpa rupiah hilang di per-orang', () => {
  const bill = makeBill({
    splitMethod: 'equal',
    participants: [participant('p1'), participant('p2'), participant('p3')],
    items: [item('i1', 100_050, 1, [])],
    rounding: true,
  });
  const calc = calculateBill(bill);

  assert.equal(calc.grandTotal, 100_100);
  assert.equal(sumTotals(calc.perPerson), 100_100);
});

test('metode persentase mengoreksi drift pembulatan ke satu orang, jumlah tetap sama persis', () => {
  const bill = makeBill({
    splitMethod: 'percentage',
    participants: [
      participant('p1', { percentage: 33 }),
      participant('p2', { percentage: 33 }),
      participant('p3', { percentage: 34 }),
    ],
    items: [item('i1', 10, 1, [])],
  });
  const calc = calculateBill(bill);

  assert.equal(calc.grandTotal, 10);
  assert.equal(sumTotals(calc.perPerson), 10);
});

test('matchesReceipt null saat tidak ada totalOverride', () => {
  const bill = makeBill({
    splitMethod: 'equal',
    participants: [participant('p1')],
    items: [item('i1', 100_000, 1, [])],
  });
  assert.equal(calculateBill(bill).matchesReceipt, null);
});

test('matchesReceipt true saat totalOverride cocok dengan hasil kalkulasi', () => {
  const bill = makeBill({
    splitMethod: 'equal',
    participants: [participant('p1')],
    items: [item('i1', 100_000, 1, [])],
    totalOverride: 100_000,
  });
  assert.equal(calculateBill(bill).matchesReceipt, true);
});

test('matchesReceipt false saat totalOverride meleset dari hasil kalkulasi', () => {
  const bill = makeBill({
    splitMethod: 'equal',
    participants: [participant('p1')],
    items: [item('i1', 100_000, 1, [])],
    totalOverride: 95_000,
  });
  const calc = calculateBill(bill);
  assert.equal(calc.matchesReceipt, false);
  // totalOverride yang valid (>0) tetap dipakai sebagai grandTotal — bukan hasil kalkulasi
  // dari item, itu yang bikin matchesReceipt jadi tanda peringatan buat pengguna.
  assert.equal(calc.grandTotal, 95_000);
});

test('by_item dengan pajak, service, dan diskon — total per orang tetap sama persis dengan grand total', () => {
  const bill = makeBill({
    splitMethod: 'by_item',
    participants: [participant('p1', { isPayer: true }), participant('p2'), participant('p3')],
    items: [item('i1', 33_333, 1, ['p1', 'p2', 'p3'])],
    tax: 11,
    taxIsPercent: true,
    serviceCharge: 5,
    serviceChargeIsPercent: true,
    discount: 1000,
    discountIsPercent: false,
    extraFees: 2000,
  });
  const calc = calculateBill(bill);

  assert.equal(sumTotals(calc.perPerson), calc.grandTotal);
});
