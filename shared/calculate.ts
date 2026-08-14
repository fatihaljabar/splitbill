import type { Bill, CalculationResult, PersonBreakdown, Settlement } from './types.ts';

function round2(n: number): number {
  return Math.round(n);
}

export function calculateBill(bill: Bill): CalculationResult {
  const itemsSubtotal = bill.items.reduce((sum, it) => sum + it.price * it.qty, 0);

  const taxAmount = bill.taxIsPercent
    ? round2((itemsSubtotal * bill.tax) / 100)
    : round2(bill.tax);

  const serviceAmount = bill.serviceChargeIsPercent
    ? round2((itemsSubtotal * bill.serviceCharge) / 100)
    : round2(bill.serviceCharge);

  const discountAmount = bill.discountIsPercent
    ? round2((itemsSubtotal * bill.discount) / 100)
    : round2(bill.discount);

  const extraFees = round2(bill.extraFees);

  let grandTotal = itemsSubtotal + taxAmount + serviceAmount - discountAmount + extraFees;
  if (bill.rounding) grandTotal = Math.ceil(grandTotal / 100) * 100;
  grandTotal = round2(grandTotal);

  if (bill.totalOverride != null && bill.totalOverride > 0) {
    grandTotal = round2(bill.totalOverride);
  }

  const participants = bill.participants;
  const n = participants.length || 1;

  let perPerson: PersonBreakdown[] = [];

  if (bill.splitMethod === 'equal') {
    const base = Math.floor(grandTotal / n);
    let remainder = grandTotal - base * n;
    perPerson = participants.map((p, i) => ({
      participantId: p.id,
      name: p.name,
      items: bill.items.map((it) => ({
        name: it.name,
        share: round2((it.price * it.qty) / n),
        qty: it.qty,
      })),
      itemsSubtotal: round2(itemsSubtotal / n),
      taxShare: round2(taxAmount / n),
      serviceShare: round2(serviceAmount / n),
      discountShare: round2(discountAmount / n),
      extraShare: round2(extraFees / n),
      total: base + (i < remainder ? 1 : 0),
      paymentStatus: p.paymentStatus,
      isPayer: p.isPayer,
    }));
  } else if (bill.splitMethod === 'custom') {
    const customs = participants.map((p) => p.customAmount ?? 0);
    const customSum = customs.reduce((a, b) => a + b, 0);
    perPerson = participants.map((p, i) => {
      const total = customs[i] || (customSum === 0 ? round2(grandTotal / n) : 0);
      return {
        participantId: p.id,
        name: p.name,
        items: [],
        itemsSubtotal: total,
        taxShare: 0,
        serviceShare: 0,
        discountShare: 0,
        extraShare: 0,
        total: round2(total),
        paymentStatus: p.paymentStatus,
        isPayer: p.isPayer,
      };
    });
  } else if (bill.splitMethod === 'percentage') {
    const pcts = participants.map((p) => p.percentage ?? 0);
    const pctSum = pcts.reduce((a, b) => a + b, 0) || 100;
    perPerson = participants.map((p, i) => {
      const ratio = (pcts[i] || 0) / pctSum;
      const total = round2(grandTotal * ratio);
      return {
        participantId: p.id,
        name: p.name,
        items: [],
        itemsSubtotal: round2(itemsSubtotal * ratio),
        taxShare: round2(taxAmount * ratio),
        serviceShare: round2(serviceAmount * ratio),
        discountShare: round2(discountAmount * ratio),
        extraShare: round2(extraFees * ratio),
        total,
        paymentStatus: p.paymentStatus,
        isPayer: p.isPayer,
      };
    });
    // Fix rounding drift
    const sum = perPerson.reduce((a, b) => a + b.total, 0);
    const drift = grandTotal - sum;
    if (drift !== 0 && perPerson.length > 0) {
      perPerson[0].total += drift;
    }
  } else {
    // by_item
    const itemShares: Record<string, number> = {};
    const itemDetails: Record<string, Array<{ name: string; share: number; qty: number }>> = {};

    participants.forEach((p) => {
      itemShares[p.id] = 0;
      itemDetails[p.id] = [];
    });

    for (const item of bill.items) {
      const owners = item.participantIds.length
        ? item.participantIds
        : participants.map((p) => p.id);
      const lineTotal = item.price * item.qty;
      const shareEach = lineTotal / owners.length;
      for (const pid of owners) {
        if (itemShares[pid] !== undefined) {
          itemShares[pid] += shareEach;
          itemDetails[pid].push({
            name: item.name,
            share: round2(shareEach),
            qty: item.qty,
          });
        }
      }
    }

    const totalItemShares = Object.values(itemShares).reduce((a, b) => a + b, 0) || 1;

    perPerson = participants.map((p) => {
      const itemsSub = itemShares[p.id] || 0;
      const ratio = itemsSub / totalItemShares;
      // If no items assigned to anyone with value, equal split of fees
      const r = totalItemShares === 0 ? 1 / n : ratio;
      const taxShare = round2(taxAmount * r);
      const serviceShare = round2(serviceAmount * r);
      const discountShare = round2(discountAmount * r);
      const extraShare = round2(extraFees * r);
      const total = round2(itemsSub + taxShare + serviceShare - discountShare + extraShare);
      return {
        participantId: p.id,
        name: p.name,
        items: itemDetails[p.id] || [],
        itemsSubtotal: round2(itemsSub),
        taxShare,
        serviceShare,
        discountShare,
        extraShare,
        total,
        paymentStatus: p.paymentStatus,
        isPayer: p.isPayer,
      };
    });

    // Fix rounding drift on by_item
    const sum = perPerson.reduce((a, b) => a + b.total, 0);
    const drift = grandTotal - sum;
    if (Math.abs(drift) > 0 && perPerson.length > 0) {
      // Apply drift to person with largest share
      const maxIdx = perPerson.reduce(
        (best, p, i, arr) => (p.total > arr[best].total ? i : best),
        0
      );
      perPerson[maxIdx].total += drift;
    }
  }

  // Settlements: non-payers transfer to payer(s)
  const payers = perPerson.filter((p) => p.isPayer);
  const primaryPayer = payers[0] || perPerson[0];
  const settlements: Settlement[] = [];

  if (primaryPayer) {
    for (const person of perPerson) {
      if (person.participantId === primaryPayer.participantId) continue;
      if (person.total <= 0) continue;
      if (person.paymentStatus === 'paid') continue;
      settlements.push({
        from: person.participantId,
        fromName: person.name,
        to: primaryPayer.participantId,
        toName: primaryPayer.name,
        amount: person.total,
      });
    }
  }

  const receiptTotal = bill.totalOverride;
  const calculatedTotal =
    itemsSubtotal + taxAmount + serviceAmount - discountAmount + extraFees;
  let matchesReceipt: boolean | null = null;
  if (receiptTotal != null && receiptTotal > 0) {
    matchesReceipt = Math.abs(calculatedTotal - receiptTotal) <= 1;
  }

  return {
    itemsSubtotal: round2(itemsSubtotal),
    taxAmount,
    serviceAmount,
    discountAmount,
    extraFees,
    grandTotal,
    perPerson,
    settlements,
    matchesReceipt,
    receiptTotal,
    calculatedTotal: round2(calculatedTotal),
  };
}

export function buildShareText(
  bill: Bill,
  calc: CalculationResult,
  currency = 'Rp'
): string {
  const lines: string[] = [];
  lines.push(`🧾 ${bill.eventName || 'Split Bill'}`);
  if (bill.storeName) lines.push(`📍 ${bill.storeName}`);
  lines.push('');
  lines.push(`Total: ${formatMoney(calc.grandTotal, currency)}`);
  lines.push('');
  lines.push('Per orang:');
  for (const p of calc.perPerson) {
    const status = p.paymentStatus === 'paid' ? '✅' : '⏳';
    lines.push(`${status} ${p.name}: ${formatMoney(p.total, currency)}`);
  }
  if (calc.settlements.length) {
    lines.push('');
    lines.push('Transfer:');
    for (const s of calc.settlements) {
      lines.push(`• ${s.fromName} → ${s.toName}: ${formatMoney(s.amount, currency)}`);
    }
  }
  if (bill.bankAccount.accountNumber) {
    lines.push('');
    lines.push(
      `💳 ${bill.bankAccount.bankName} ${bill.bankAccount.accountNumber} a/n ${bill.bankAccount.accountName}`
    );
  }
  return lines.join('\n');
}

function formatMoney(n: number, currency: string): string {
  return `${currency}${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}
