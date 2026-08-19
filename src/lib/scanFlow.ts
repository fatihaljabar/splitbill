import type { Router } from 'vue-router';
import { uid } from '../../shared/format.ts';
import type { OcrResult } from '../../shared/types.ts';
import { useApp } from '../composables/useApp';
import { forceNormalizeQtyPrice } from './ocr.ts';

/** Terapkan hasil OCR ke bill aktif dan lanjut ke ReviewPage. Dipakai ScanPage (alur scan
 * penuh, lewat preview/crop) dan BillPage (aksi cepat "dari galeri"/"kamera" yang melompati
 * layar preview/crop) — supaya logikanya tidak dobel di dua tempat. */
export function applyOcrToReview(result: OcrResult, receiptDataUrl: string, router: Router): void {
  const { updateBill, state } = useApp();
  updateBill({
    storeName: result.storeName || state.currentBill?.storeName,
    date: result.date || state.currentBill?.date,
    receiptImage: receiptDataUrl,
    tax: result.tax || 0,
    taxIsPercent: false,
    serviceCharge: result.serviceCharge || 0,
    serviceChargeIsPercent: false,
    discount: result.discount || 0,
    discountIsPercent: false,
    extraFees: result.extraFees || 0,
    totalOverride: result.total || undefined,
  });

  const reviewItems = result.items.map((it) => {
    const n = forceNormalizeQtyPrice(it);
    return { id: uid(), name: n.name, price: n.price, qty: n.qty };
  });
  sessionStorage.setItem(
    'ocr_review',
    JSON.stringify({
      items: reviewItems,
      tax: result.tax || 0,
      serviceCharge: result.serviceCharge || 0,
      discount: result.discount || 0,
      extraFees: result.extraFees || 0,
      subtotal: result.subtotal || 0,
      total: result.total || 0,
      storeName: result.storeName,
      date: result.date,
      rawText: result.rawText,
    }),
  );
  router.push('/review');
}
