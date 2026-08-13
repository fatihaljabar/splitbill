import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Bill } from '../types';

/** Compact bill for URL payload (strip heavy fields + compress) */
export function encodeBill(bill: Bill): string {
  try {
    const compact = {
      ...bill,
      receiptImage: undefined,
    };
    return compressToEncodedURIComponent(JSON.stringify(compact));
  } catch {
    return '';
  }
}

export function decodeBill(payload: string): Bill | null {
  try {
    // lz-string first
    let json = decompressFromEncodedURIComponent(payload);
    if (!json) {
      // legacy base64url fallback
      let b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      json = decodeURIComponent(escape(atob(b64)));
    }
    const bill = JSON.parse(json) as Bill;
    if (!bill?.id || !bill?.shortCode) return null;
    return bill;
  } catch {
    return null;
  }
}

export function buildSharePath(bill: Bill): string {
  const data = encodeBill(bill);
  return `#/s/${bill.shortCode}?d=${data}`;
}

export function buildShareUrl(bill: Bill): string {
  if (typeof window === 'undefined') return buildSharePath(bill);
  return `${window.location.origin}${window.location.pathname}${buildSharePath(bill)}`;
}
