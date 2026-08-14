import { decompressFromEncodedURIComponent } from 'lz-string';
import type { Bill } from '../../shared/types.ts';

/** Dipertahankan supaya link lama (data bill dititipkan di URL, sebelum server jadi sumber
 * kebenaran) tetap bisa dibuka. Tidak ada lagi yang menerbitkan link berformat ini. */
export function decodeBill(payload: string): Bill | null {
  try {
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

export function buildShareUrl(shortCode: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/s/${shortCode}`;
}
