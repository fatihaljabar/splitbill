import type { OcrResult } from '../../shared/types.ts';

export type ParsedItem = { name: string; price: number; qty: number };

/** Parse Indonesian/English receipt text into structured data */
export function parseReceiptText(rawText: string): OcrResult {
  // Normalize OCR quirks BEFORE line split (qty markers, thousand spaces, etc.)
  const lines = normalizeLines(preprocessOcrText(rawText));

  const result: OcrResult = {
    storeName: '',
    date: '',
    items: [],
    subtotal: 0,
    tax: 0,
    serviceCharge: 0,
    discount: 0,
    extraFees: 0,
    total: 0,
    rawText,
  };

  if (!lines.length) return result;

  // --- Totals / fees first (keyword-driven, more reliable) ---
  const fees = extractFeesAndTotals(lines);
  Object.assign(result, fees);

  // --- Date ---
  result.date = extractDate(lines);

  // --- Section boundaries ---
  const { itemStart, itemEnd } = findItemSectionBounds(lines);

  // --- Store name from header (before items) ---
  result.storeName = extractStoreName(lines, itemStart);

  // --- Items only from the middle section ---
  const itemLines = lines.slice(itemStart, itemEnd + 1);
  let items = parseItemLines(itemLines, lines);

  // Fallback: if middle section empty, try whole doc with strict filters
  if (!items.length) {
    items = parseItemLines(lines, lines);
  }

  // ALWAYS peel qty from names & convert line-total → unit price
  items = items.map(forceNormalizeQtyPrice);

  // Clean against known totals / junk
  items = filterJunkItems(items, result);

  // If items sum is way off vs known subtotal, try to drop outliers
  items = reconcileWithSubtotal(items, result.subtotal);

  // Normalize again after filters
  items = items.map(forceNormalizeQtyPrice);

  result.items = dedupeItems(items);

  // Align money fields with items (fixes wrong total / service)
  finalizeMoneyFields(result);

  return result;
}

/**
 * Ensure subtotal/tax/service/extra/discount/total are consistent and sensible.
 * Critical: when OCR missed many menu lines, itemSum << receipt subtotal —
 * NEVER overwrite receipt subtotal/total with incomplete item math.
 */
function finalizeMoneyFields(result: OcrResult): void {
  const itemSum = result.items.reduce((s, it) => s + it.price * it.qty, 0);
  const ocrSub = result.subtotal || 0;
  const ocrTotal = result.total || 0;

  // How complete are detected items vs receipt subtotal?
  const itemsComplete =
    itemSum > 0 &&
    ocrSub > 0 &&
    Math.abs(ocrSub - itemSum) <= Math.max(2, ocrSub * 0.08);
  const itemsMissing =
    itemSum > 0 && ocrSub > 0 && itemSum < ocrSub * 0.85; // clearly incomplete OCR items

  // Subtotal preference
  if (itemSum > 0) {
    if (!ocrSub) {
      result.subtotal = itemSum;
    } else if (itemsComplete) {
      result.subtotal = itemSum; // trust items when they match
    } else if (itemsMissing) {
      // Keep receipt subtotal — OCR failed to read all lines
      result.subtotal = ocrSub;
    } else if (Math.abs(ocrSub - itemSum) <= Math.max(2, ocrSub * 0.05)) {
      result.subtotal = itemSum;
    }
    // else keep ocrSub as-is
  }

  let sub = result.subtotal || itemSum || ocrSub;
  let tax = Math.max(0, result.tax || 0);
  let service = Math.max(0, result.serviceCharge || 0);
  let extra = Math.max(0, result.extraFees || 0);
  let disc = Math.max(0, result.discount || 0);
  let total = Math.max(0, ocrTotal);

  // Service cannot be huge (ShopeeFood often ~1–5k)
  if (service > 0 && sub > 0 && service >= sub * 0.25) {
    if (!total || Math.abs(total - service) <= 2 || total > service) {
      if (!total || total < 100) total = service;
    }
    service = 0;
  }
  if (service > 0 && total > 0 && Math.abs(service - total) <= 2 && disc > 0) {
    service = 0;
  }

  const computedFromReceipt = sub + tax + service + extra - disc;
  const computedFromItems = itemSum + tax + service + extra - disc;

  if (!total && computedFromReceipt > 0) {
    total = computedFromReceipt;
  } else if (total > 0) {
    // Prefer keeping OCR payment total when it reconciles with receipt subtotal + fees
    const receiptReconciles =
      Math.abs(total - computedFromReceipt) <= Math.max(2, total * 0.02);
    const itemsReconcile =
      itemsComplete && Math.abs(total - computedFromItems) <= Math.max(2, total * 0.02);

    if (receiptReconciles || itemsReconcile) {
      // keep total
    } else if (itemsMissing && ocrTotal > 0) {
      // Incomplete items — NEVER recompute total from partial items
      total = ocrTotal;
      if (ocrSub > 0) sub = ocrSub;
    } else if (total === sub && (tax + service + extra + disc) > 0) {
      total = computedFromReceipt;
    } else if (Math.abs(total - (computedFromReceipt + disc)) <= 2 && disc > 0) {
      total = computedFromReceipt;
    } else if (
      itemsComplete &&
      Math.abs(total - computedFromItems) > Math.max(500, sub * 0.08)
    ) {
      // Items look complete but total mismatches — prefer computed from items+fees
      total = computedFromItems;
    } else if (!itemsMissing && Math.abs(total - computedFromReceipt) > Math.max(500, sub * 0.08)) {
      // Only override when we don't suspect missing items
      if (disc > 0 || service > 0) {
        total = computedFromReceipt;
      }
    }
  }

  result.subtotal = Math.max(0, sub);
  result.tax = tax;
  result.serviceCharge = service;
  result.extraFees = extra;
  result.discount = disc;
  result.total = Math.max(0, total);
}

/* ========================= Line normalization ========================= */

/**
 * Fix common Tesseract/Shopee OCR quirks so qty patterns match reliably.
 * e.g. "3 X item", "3><item", "81 000", curly ×, etc.
 */
function preprocessOcrText(raw: string): string {
  // IMPORTANT: only touch horizontal whitespace — never swallow newlines (\s would break line structure)
  const sp = '[ \\t\\u00a0]*';
  let t = raw
    .replace(/\u00a0/g, ' ')
    .replace(/[|]/g, ' ')
    // Unicode multiply / lookalike "x" (keep latin x/X as-is for now)
    .replace(/[×✕✖٭✗✘ⅹⅩхХ]/g, 'x')
    // OCR garbage often used instead of x between qty and name: ><, >>, <<, *
    .replace(new RegExp(`(\\d)${sp}(?:><|>>|<<|\\*|•|·)${sp}`, 'g'), '$1x ')
    // "3 x" / "3X" / "3x" on same line → "3x "
    .replace(new RegExp(`(\\d{1,3})${sp}[xX]${sp}(?=\\S)`, 'g'), '$1x ')
    // "3xName" glued → "3x Name"
    .replace(/(\d{1,3})[xX](?=[A-Za-z\u00C0-\u024F])/g, '$1x ')
    // "x 3" / "x3" as standalone token (same line)
    .replace(new RegExp(`(^|[ \\t])[xX]${sp}(\\d{1,3})(?=[ \\t]|$)`, 'gm'), '$1x$2')
    // Thousand separator as spaces on same line: "81 000" → "81.000"
    .replace(/\b(\d{1,3})(?:[ \t]+(\d{3}))+\b/g, (m) => m.replace(/[ \t]+/g, '.'))
    // GoFood OCR: @Rpl7.500 / @RpI7.500 (l/I misread as 1)
    .replace(/@\s*rp\s*[lI]\s*([\d.,]+)/gi, '@Rp1$1')
    .replace(/\brp\s*[lI]([\d.,]{2,})/gi, 'Rp1$1')
    // Rp.81000 / rp81.000 → Rp 81000
    .replace(/rp[ \t]*\.?[ \t]*/gi, 'Rp ')
    .replace(/Rp[ \t]+/g, 'Rp ')
    .replace(/Rp(?=\d)/g, 'Rp ')
    // normalize @ price marker spacing: @Rp 64.500
    .replace(/@\s*Rp\s*/gi, '@Rp');

  return t;
}

function normalizeLines(raw: string): string[] {
  const rawLines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^[=\-_.*~]{2,}$/.test(l));

  // Merge split Shopee-style rows into single logical lines:
  // "3x" + "Bakmie ayam" + "Rp81.000" → "3x Bakmie ayam Rp81.000"
  // "Bakmie ayam" + "3x" + "Rp81.000" → "Bakmie ayam 3x Rp81.000"
  const merged: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const a = rawLines[i];
    const b = rawLines[i + 1];
    const c = rawLines[i + 2];

    const qtyOnly = (s: string) => /^(?:\d{1,3}\s*x|x\s*\d{1,3}|\d{1,3})$/i.test(s.replace(/\s/g, ''));
    const priceOnly = (s: string) =>
      /^(?:rp\.?\s*)?[\d.,]+$/i.test(s.trim()) || /^(?:rp\s*)[\d.]+$/i.test(s.trim());
    const nameLike = (s: string) =>
      !qtyOnly(s) && !priceOnly(s) && /[A-Za-z\u00C0-\u024F]/.test(s);

    // qty + name + price
    if (b && c && qtyOnly(a) && nameLike(b) && priceOnly(c)) {
      merged.push(`${a} ${b} ${c}`);
      i += 2;
      continue;
    }
    // name + qty + price
    if (b && c && nameLike(a) && qtyOnly(b) && priceOnly(c)) {
      merged.push(`${a} ${b} ${c}`);
      i += 2;
      continue;
    }
    // NEVER merge fee/total keyword lines with following bare totals
    // (ShopeeFood: "Biaya Layanan Rp2.000" then bare "Rp62.320")
    const isFeeOrTotalLabel = (s: string) =>
      /\b(sub\s*total|subtotal|total|grand|pajak|tax|ppn|pb1|service|layanan|ongkir|ongkos|diskon|discount|voucher|biaya|delivery|admin|packing|pembayaran|bayar)\b/i.test(
        s
      );

    // name (with optional qty) + price — only for product lines
    if (b && nameLike(a) && priceOnly(b) && !isFeeOrTotalLabel(a)) {
      merged.push(`${a} ${b}`);
      i += 1;
      continue;
    }
    // qty+name on one line already, price next
    if (
      b &&
      !priceOnly(a) &&
      priceOnly(b) &&
      /\d\s*x|x\s*\d/i.test(a) &&
      !isFeeOrTotalLabel(a)
    ) {
      merged.push(`${a} ${b}`);
      i += 1;
      continue;
    }

    merged.push(a);
  }

  return merged;
}

/* ========================= Section detection ========================= */

// NOTE: do NOT include bare "promo" — ShopeeFood item names often start with "Promo ..."
const TOTAL_LINE_RE =
  /\b(sub\s*total|subtotal|total\s*item|total\s*belanja|grand\s*total|total\s*bayar|total\s*pembayaran|total\s*payment|amount\s*due|total\s*tagihan|total\s*harga|harga\s*total|total\s*order|order\s*total|jumlah\s*total|total\b|ppn|pb\s*1|pb1|pajak|tax|service\s*charge|service\s*fee|svc\s*charge|biaya\s*layanan|biaya\s*admin|biaya\s*aplikasi|ongkir|ongkos\s*kirim|delivery\s*fee|packing|kemasan|pengemasan|diskon|discount|potongan|voucher\s*diskon|cashback|platform\s*fee|biaya\s*penanganan|handling\s*fee|biaya\s*pengiriman|biaya\s*pengemasan|biaya\s*platform)\b/i;

const HEADER_JUNK_RE =
  /\b(jl\.?|jalan|jln\.?|gg\.?|gang|rt\.?\s*\/?\s*rw|rw\.?|kelurahan|kecamatan|kabupaten|kota|provinsi|kode\s*pos|kodepos|indonesia|alamat|address|telp|telepon|phone|wa\.?|whatsapp|hp\.?|fax|email|www\.|http|https|npwp|nib|siup|tdp|no\.?\s*order|order\s*id|invoice|inv\.?|nota|struk|receipt|kasir|cashier|meja|table|guest|tamu|dine\s*in|take\s*away|takeaway|delivery|pickup|pelanggan|customer|pembeli|merchant|outlet|cabang|branch|shift|open|close|buka|tutup|jam|waktu|tanggal|date|time|hari|senin|selasa|rabu|kamis|jumat|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

const ITEM_HINT_RE =
  /\b(qty|qty\.|jumlah|item|menu|pesanan|order\s*detail|daftar|rincian|detail\s*pesanan|produk|barang)\b/i;

function findItemSectionBounds(lines: string[]): { itemStart: number; itemEnd: number } {
  let firstTotalIdx = -1;
  let lastHeaderIdx = -1;
  let itemHintIdx = -1;
  let firstItemIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (itemHintIdx < 0 && ITEM_HINT_RE.test(line) && !TOTAL_LINE_RE.test(line)) {
      itemHintIdx = i;
    }
    if (firstTotalIdx < 0 && isStrongTotalLine(line)) {
      firstTotalIdx = i;
    }
    if (firstItemIdx < 0 && looksLikeItemCandidate(line)) {
      firstItemIdx = i;
    }
  }

  // Header: only leading address/meta lines BEFORE first item
  const headerScanLimit =
    firstItemIdx >= 0
      ? firstItemIdx
      : Math.min(lines.length, Math.max(6, Math.floor(lines.length * 0.35)));

  for (let i = 0; i < headerScanLimit; i++) {
    if (isHeaderOrAddressLine(lines[i]) || isMetaOnlyLine(lines[i])) {
      lastHeaderIdx = i;
    } else if (i <= 1) {
      // store name lines at very top
      lastHeaderIdx = i;
    }
  }

  let itemStart = 0;
  if (itemHintIdx >= 0) itemStart = itemHintIdx + 1;
  else if (firstItemIdx >= 0) itemStart = firstItemIdx;
  else if (lastHeaderIdx >= 0) itemStart = lastHeaderIdx + 1;
  else itemStart = Math.min(1, Math.max(0, lines.length - 1));

  // Never start at/after first total line
  if (firstTotalIdx >= 0) {
    itemStart = Math.min(itemStart, firstTotalIdx);
  }

  let itemEnd = lines.length - 1;
  if (firstTotalIdx >= 0) {
    itemEnd = Math.max(0, firstTotalIdx - 1);
  } else {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (TOTAL_LINE_RE.test(lines[i]) || isPaymentFooterLine(lines[i])) {
        itemEnd = Math.max(0, i - 1);
      } else {
        break;
      }
    }
  }

  // If window empty, use everything before totals
  if (itemEnd < itemStart) {
    itemStart = 0;
    itemEnd = firstTotalIdx >= 0 ? Math.max(0, firstTotalIdx - 1) : lines.length - 1;
  }

  return { itemStart, itemEnd };
}

function isStrongTotalLine(line: string): boolean {
  const l = line.toLowerCase();
  if (
    /\b(sub\s*total|subtotal|grand\s*total|total\s*bayar|total\s*pembayaran|total\s*belanja|total\s*tagihan|amount\s*due|total\s*order)\b/i.test(
      l
    )
  ) {
    return true;
  }
  // bare "Total" with amount
  if (/^total\b/i.test(l) && extractAmounts(line).length > 0) return true;
  return false;
}

function isPaymentFooterLine(line: string): boolean {
  // Do NOT match bare platform brands (Shopee/GoFood) — those appear in headers too
  return /\b(tunai|cash|kembalian|change|debit|credit|kartu|card|qris|ovo|gopay|dana|shopeepay|linkaja|transfer|paid\s*with|bayar\s*dengan|lunas|terima\s*kasih|thank\s*you|selamat\s*datang|visit\s*again|powered\s*by)\b/i.test(
    line
  );
}

function isHeaderOrAddressLine(line: string): boolean {
  if (HEADER_JUNK_RE.test(line)) return true;
  if (isAddressLike(line)) return true;
  if (isPhoneLike(line)) return true;
  if (isPostalOrCityLine(line)) return true;
  return false;
}

function isAddressLike(line: string): boolean {
  // Street patterns common in ID
  if (/\b(jl\.?|jln\.?|jalan|gg\.?|gang|blok\s+[a-z0-9]|no\.?\s*\d)/i.test(line)) return true;
  if (/\brt\b\.?\s*\/?\s*\d+/i.test(line) || /\brw\b\.?\s*\d+/i.test(line)) return true;
  // long lines with commas often addresses
  if ((line.match(/,/g) || []).length >= 2 && !hasStrongPrice(line)) return true;
  // US-style "City, ST 12345"
  if (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(line) && !hasStrongPrice(line)) return true;
  // Postal-only style: city name + 5-digit code WITHOUT other large amounts
  // Do NOT treat "Rendang 45000" as address — 5-digit IDR prices are normal
  if (
    !hasStrongPrice(line) &&
    !hasCurrencyPrice(line) &&
    /\b(\d{5})\b/.test(line) &&
    /\b(jakarta|bandung|surabaya|depok|tangerang|bekasi|bogor|selatan|utara|timur|barat|pusat|indonesia)\b/i.test(
      line
    )
  ) {
    return true;
  }
  return false;
}

function isPhoneLike(line: string): boolean {
  const digits = line.replace(/\D/g, '');
  if (digits.length >= 9 && digits.length <= 15 && /^(?:\+?62|0|8)/.test(digits)) return true;
  if (/(?:\+62|62|0)\s*8[\d\s\-()]{7,}/.test(line)) return true;
  return false;
}

function isPostalOrCityLine(line: string): boolean {
  if (hasCurrencyPrice(line)) return false;
  return /\b(jakarta|bandung|surabaya|medan|semarang|yogyakarta|yogya|depok|tangerang|bekasi|bogor|bali|denpasar|makassar|palembang|malang|solo|surakarta|batam|pekanbaru|padang|manado|balikpapan|samarinda|pontianak|mataram|lombok|selatan|utara|timur|barat|pusat|indonesia|new\s*york|singapore|kuala\s*lumpur|bangkok)\b/i.test(
    line
  );
}

function isMetaOnlyLine(line: string): boolean {
  if (line.length < 2) return true;
  if (/^[=\-_.*~#]+$/.test(line)) return true;
  if (/^[\d\s:./\-]+$/.test(line) && !hasStrongPrice(line)) return true; // date/time only
  return false;
}

/* ========================= Store / date ========================= */

const PLATFORM_NAME_RE =
  /^(shopee\s*food|shopeefood|go\s*food|gofood|grab\s*food|grabfood|traveloka\s*eats|airasia\s*food|maxim\s*food|power(ed)?\s*by.*)$/i;

function extractStoreName(lines: string[], itemStart: number): string {
  const header = lines.slice(0, Math.max(1, Math.min(itemStart, 14)));
  const candidates: string[] = [];

  // Merchant near pickup labels (ShopeeFood / Grab)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(diambil\s*dari|diantar\s*dari|merchant|resto|outlet)\b/i.test(line) && lines[i + 1]) {
      const next = cleanName(lines[i + 1].replace(/[»>]+$/g, '').replace(/\(.*$/, '').trim());
      if (
        next.length >= 3 &&
        !isAddressLike(next) &&
        !isFeeOrTotalLabelLine(next) &&
        !/jl\.|jalan|diantar|diambil/i.test(next)
      ) {
        return next;
      }
    }
    // "Domino's Pizza - Dinoyo »"
    if (/[»>]\s*$/.test(line) || /\s[-–—]\s/.test(line)) {
      const cleaned = cleanName(line.replace(/[»>]+$/g, '').replace(/\(.*$/, '').trim());
      if (
        cleaned.length >= 4 &&
        /[A-Za-z]{3,}/.test(cleaned) &&
        !isAddressLike(cleaned) &&
        !isFeeOrTotalLabelLine(cleaned) &&
        !/rincian|pesanan|shopee|gofood|grab/i.test(cleaned)
      ) {
        return cleaned;
      }
    }
    const fromMc = line.match(/(?:dari|from)\s+([A-Za-z0-9'&.\- ]{3,40})/i);
    if (fromMc) {
      const name = cleanName(fromMc[1]);
      if (name.length >= 3 && !/agustus|jam|menit|diantar/i.test(name)) return name;
    }
    const mcd = line.match(/\b(McDonald'?s?[^\n,]{0,40})/i);
    if (mcd && !/jarak|waktu|diantar/i.test(line)) {
      return cleanName(mcd[1]);
    }
    const dom = line.match(/\b(Domino'?s?\s*Pizza[^\n»>]{0,40})/i);
    if (dom) return cleanName(dom[1].replace(/[»>]+$/g, ''));
    // Merchant line before "Jarak" / after driver plate e.g. "KONICIPICIP Sate Taichan"
    if (
      i > 0 &&
      /\b(jarak|km)\b/i.test(line) &&
      lines[i - 1] &&
      !isFeeOrTotalLabelLine(lines[i - 1]) &&
      !isAddressLike(lines[i - 1])
    ) {
      const prev = cleanName(lines[i - 1].replace(/,.*/, ''));
      if (prev.length >= 4 && /[A-Za-z]{3,}/.test(prev) && !/honda|vario|bagas|diantar|jam/i.test(prev)) {
        return prev;
      }
    }
  }

  for (const line of header) {
    if (looksLikePriceOnly(line)) continue;
    if (isMetaOnlyLine(line)) continue;
    if (TOTAL_LINE_RE.test(line)) continue;
    if (isPaymentFooterLine(line)) continue;
    if (isFeeOrTotalLabelLine(line)) continue;
    if (
      /rincian\s*pesanan|rincian\s*transaksi|diantar|bukti|tambah\s*shopee|layar\s*utama|pesan\s*makan|makasih|hai\s+|id\s*transaksi|total\s*dibayar|gofood|gojek/i.test(
        line
      )
    ) {
      continue;
    }
    // skip pure clock / status chrome "20.01 D X"
    if (/^\d{1,2}[.:]\d{2}\b/.test(line) && line.length < 40) continue;
    // skip full street address lines
    if (/\b(jl\.?|jln\.?|jalan)\b/i.test(line)) continue;
    if (isPhoneLike(line)) continue;
    if (/minggu|senin|selasa|rabu|kamis|jumat|sabtu|agustus|januari/i.test(line)) continue;

    // Merchant often "Bacillada - Semarang Barat" — allow city in branch name
    const isBranchStyle = /\s[-–—]\s/.test(line) || /\s[»>]\s*$/.test(line);
    if (!isBranchStyle) {
      if (isAddressLike(line)) continue;
      if (isPostalOrCityLine(line) && !/[A-Za-z]{4,}/.test(line.split(/[-–—]/)[0] || '')) continue;
    }

    const cleaned = cleanName(line.replace(/[»>]+$/g, ''));
    if (cleaned.length >= 2 && cleaned.length <= 56 && !/^\d+$/.test(cleaned)) {
      const letters = (cleaned.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;
      if (letters >= 3) candidates.push(cleaned);
    }
  }

  const dashed = candidates.find((c) => /\s[-–—]\s/.test(c) && !PLATFORM_NAME_RE.test(c));
  if (dashed) return dashed;
  const merchant = candidates.find((c) => !PLATFORM_NAME_RE.test(c) && !/^\d/.test(c));
  if (merchant) return merchant;
  if (candidates[0]) return candidates[0];
  return '';
}

function extractDate(lines: string[]): string {
  const dateRe =
    /(\d{1,2}[\/\-.\s]\d{1,2}[\/\-.\s]\d{2,4})|(\d{4}[\/\-.\s]\d{1,2}[\/\-.\s]\d{1,2})|(\d{1,2}\s+(jan|feb|mar|apr|mei|may|jun|jul|agu|ags|aug|sep|okt|oct|nov|des|dec)[a-z]*\s+\d{2,4})/i;
  for (const line of lines) {
    const m = line.match(dateRe);
    if (m) return m[0].trim();
  }
  return '';
}

/* ========================= Fees & totals ========================= */

function extractFeesAndTotals(lines: string[]): Partial<OcrResult> {
  type Hit = { kind: string; value: number; priority: number; idx: number };
  const hits: Hit[] = [];

  const ignoreAmountLine = (lower: string) =>
    /\b(tunai|cash|kembalian|change|debit|credit|kartu|qris|ovo|gopay|dana|shopeepay|linkaja|transfer|dibayar\s*dengan|paid\s*with|bayar\s*dengan|pesan\s*lagi|tambah\s*shopee)\b/i.test(
      lower
    );

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const lower = line.toLowerCase();
    if (ignoreAmountLine(lower)) continue;

    // Signed discount: "-Rp43.680" or "− Rp43.680"
    const signedDisc = line.match(
      /(?:^|[\s])[-−–—]\s*(?:rp\.?\s*)?([\d.,]+)/i
    );

    const amounts = extractAmounts(line);
    // Prefer first money amount on fee lines (avoid trailing bare total glued by OCR)
    // For item-like lines last amount is usually the price.
    let val = 0;
    if (amounts.length === 1) {
      val = amounts[0];
    } else if (amounts.length > 1) {
      // If line has a fee keyword, use the SMALLEST positive amount >= 100
      // (e.g. "Biaya Layanan Rp2.000 Rp62.320" → 2000)
      if (
        /\b(biaya|layanan|service|ongkir|diskon|voucher|admin|ppn|pajak|subtotal|sub\s*total)\b/i.test(
          lower
        )
      ) {
        const sorted = [...amounts].filter((n) => n >= 100).sort((a, b) => a - b);
        val = sorted[0] || amounts[amounts.length - 1];
      } else {
        val = amounts[amounts.length - 1];
      }
    }
    if (!val && idx + 1 < lines.length && looksLikePriceOnly(lines[idx + 1])) {
      // Don't steal next line if it's likely the grand total bare amount
      // after a fee line that already might have 0
      val = parsePrice(lines[idx + 1]);
    }

    // --- Keyword lines (even if amount is 0, e.g. ongkir Rp0) ---
    if (
      /\b(sub\s*total|subtotal|total\s*item|total\s*produk|harga\s*item|jumlah\s*item|subtotal\s*pesanan|total\s*pesanan(?!\s*bayar)|total\s*harga)\b/i.test(
        lower
      )
    ) {
      // GoFood "Total harga" = items subtotal (before fees/discount)
      if (val >= 100) hits.push({ kind: 'subtotal', value: val, priority: 14, idx });
      continue;
    }

    if (
      /\b(grand\s*total|total\s*bayar|total\s*dibayar|total\s*pembayaran|total\s*tagihan|amount\s*due|total\s*order|order\s*total|total\s*belanja|yang\s*harus\s*dibayar|harga\s*total|total\s*\(?\s*termasuk\s*pajak)\b/i.test(
        lower
      )
    ) {
      if (val >= 100) hits.push({ kind: 'total', value: val, priority: 30, idx });
      continue;
    }

    // Grab: "Total (termasuk pajak) Rp78.620"
    if (/^total\b/i.test(lower) && !/sub/i.test(lower)) {
      if (val >= 100) hits.push({ kind: 'total', value: val, priority: 25, idx });
      continue;
    }

    // Discount / voucher — MUST run before ongkir so "Diskon ongkir PLUS" is discount
    // Grab/GoFood often has MULTIPLE discount lines → sum later
    // Careful: "Diskon 42% (s.d. Rp50.000) -47.880" — use signed / last amount, NOT s.d. cap
    {
      const stripped = stripLeadingOcrJunk(line);
      const looksLikeQtyItem = /\d{1,3}\s*x\s+.+/i.test(stripped);
      if (
        !looksLikeQtyItem &&
        /\b(diskon|discount|potongan|voucher|cashback|hemat|disc\.?)\b/i.test(lower)
      ) {
        let dVal = 0;
        // 1) explicit minus amount anywhere
        const allSigned = [
          ...line.matchAll(/[-−–—]\s*(?:rp\.?\s*)?([\d.,]+)/gi),
        ].map((m) => parsePrice(m[1]));
        if (allSigned.length) dVal = allSigned[allSigned.length - 1];
        // 2) amount after "s.d." is a CAP, not the discount — strip those from candidates
        if (!dVal && amounts.length) {
          const capAmounts = [
            ...line.matchAll(/(?:s\.?d\.?|upto|max|maks\.?)\s*(?:rp\.?\s*)?([\d.,]+)/gi),
          ].map((m) => parsePrice(m[1]));
          const caps = new Set(capAmounts);
          const pctNums = [
            ...line.matchAll(/(\d{1,3})\s*%/g),
          ].map((m) => parseInt(m[1], 10));
          const candidates = amounts.filter(
            (a) => !caps.has(a) && !pctNums.includes(a) && a >= 100
          );
          // Prefer last remaining amount (actual discount)
          dVal = candidates.length ? candidates[candidates.length - 1] : 0;
        }
        if (!dVal && signedDisc) dVal = parsePrice(signedDisc[1]);
        if (!dVal) dVal = val;
        if (dVal >= 100) hits.push({ kind: 'discount', value: dVal, priority: 14, idx });
        continue;
      }
    }

    // "Termasuk pajak" = tax already in prices — do NOT add as extra tax
    if (/termasuk\s*pajak|including\s*tax|incl\.?\s*tax/i.test(lower)) {
      continue;
    }

    if (/\b(ppn|pb\s*1|pb1|pajak|tax|vat)\b/i.test(lower) && !/termasuk/i.test(lower)) {
      if (val >= 100) hits.push({ kind: 'tax', value: val, priority: 12, idx });
      continue;
    }

    // Biaya Layanan / service (Grab: "Biaya layanan mitra & resto")
    if (
      /\b(service\s*charge|svc\s*charge|biaya\s*layanan|service\s*fee|layanan\s*mitra)\b/i.test(
        lower
      ) ||
      (/\blayanan\b/i.test(lower) && /\bbiaya\b/i.test(lower))
    ) {
      if (val >= 0 && val < 5_000_000) {
        if (val >= 100 || /rp/i.test(line)) {
          hits.push({ kind: 'service', value: val, priority: 14, idx });
        }
      }
      continue;
    }
    if (
      /\b(service|svc)\b/i.test(lower) &&
      !/\b(kirim|delivery|pengiriman|admin|aplikasi|customer|platform)\b/i.test(lower) &&
      !/\btotal\b/i.test(lower) &&
      val >= 100 &&
      val <= 500_000
    ) {
      hits.push({ kind: 'service', value: val, priority: 8, idx });
      continue;
    }

    // Delivery / platform / other fees (Grab + GoFood + Shopee)
    if (
      !/\b(diskon|discount|potongan|voucher|hemat)\b/i.test(lower) &&
      /\b(ongkir|ongkos\s*kirim|delivery\s*fee|biaya\s*kirim|shipping|biaya\s*pengiriman|biaya\s*antar|biaya\s*penanganan\s*dan\s*pengiriman|penanganan\s*dan\s*pengiriman)\b/i.test(
        lower
      )
    ) {
      hits.push({ kind: 'extra', value: Math.max(0, val), priority: 12, idx });
      continue;
    }
    if (
      /\b(biaya\s*admin|biaya\s*aplikasi|biaya\s*platform|platform\s*fee|biaya\s*penanganan|handling\s*fee|packing|kemasan|packaging|pengemasan|biaya\s*pengemasan|other\s*fee|biaya\s*lain[\s\-–—]*lain|biaya\s*lainnya|biaya\s*lain|biaya\s*tambahan)\b/i.test(
        lower
      ) ||
      /\bbiaya\s*lain/i.test(lower)
    ) {
      hits.push({ kind: 'extra', value: Math.max(0, val), priority: 10, idx });
      continue;
    }

    // Standalone price-only line in the lower half → candidate TOTAL (ShopeeFood shows bare Rp62.320)
    if (looksLikePriceOnly(line) && val >= 1000) {
      const relPos = idx / Math.max(1, lines.length - 1);
      if (relPos >= 0.45) {
        hits.push({ kind: 'total_bare', value: val, priority: 5, idx });
      }
    }
  }

  const pickBest = (kind: string) => {
    const list = hits
      .filter((h) => h.kind === kind)
      .sort((a, b) => b.priority - a.priority || b.idx - a.idx);
    return list[0]?.value || 0;
  };

  let subtotal = pickBest('subtotal');
  let tax = pickBest('tax');
  let serviceCharge = pickBest('service');
  // SUM all discount lines (GoFood: Diskon ongkir + Diskon, etc.)
  let discount = hits
    .filter((h) => h.kind === 'discount')
    .reduce((sum, h, i, arr) => {
      // de-dupe identical value at same-ish index
      if (arr.findIndex((x) => x.value === h.value && x.idx === h.idx) === i) return sum + h.value;
      return sum;
    }, 0);
  // Also de-dupe same value on consecutive lines only once if OCR duplicated
  {
    const discHits = hits.filter((h) => h.kind === 'discount');
    const seen = new Set<string>();
    discount = 0;
    for (const h of discHits) {
      const key = `${h.value}@${h.idx}`;
      if (seen.has(key)) continue;
      seen.add(key);
      discount += h.value;
    }
  }
  // Sum ALL extra fee lines (do NOT de-dupe by value — Shopee often has
    // Biaya Lain-lain Rp1.000 AND Biaya Pengemasan Rp1.000 as separate fees)
  let extraFees = hits
    .filter((h) => h.kind === 'extra')
    .reduce((sum, h, i, arr) => {
      // only skip exact duplicate of same line index (OCR double-read)
      if (arr.findIndex((x) => x.value === h.value && x.idx === h.idx && x.kind === 'extra') === i) {
        return sum + h.value;
      }
      return sum;
    }, 0);

  // Prefer labeled payment totals (Total dibayar / pembayaran) over earlier copies
  const labeledTotals = hits
    .filter((h) => h.kind === 'total')
    .sort((a, b) => b.priority - a.priority || b.idx - a.idx);
  let total = 0;
  if (labeledTotals.length) {
    const eligible = labeledTotals.filter((h) => {
      if (!subtotal) return true;
      // payment total can be below subtotal after big discounts
      return h.value >= subtotal * 0.25 || h.value >= 1000;
    });
    // Prefer value that matches subtotal - discount + fees when possible
    const guess = subtotal - discount + serviceCharge + extraFees + tax;
    const pool = eligible.length ? eligible : labeledTotals;
    const matchGuess = pool.find((h) => Math.abs(h.value - guess) <= 2);
    total = matchGuess ? matchGuess.value : pool[0].value;
  }

  // Bare total candidate (ShopeeFood)
  if (!total) {
    const bare = hits
      .filter((h) => h.kind === 'total_bare')
      .sort((a, b) => b.idx - a.idx);
    // Pick bare amount that equals subtotal - discount + service + extra (approx)
    const computedGuess = subtotal - discount + serviceCharge + extraFees + tax;
    if (bare.length) {
      const match = bare.find((h) => Math.abs(h.value - computedGuess) <= 2);
      total = match ? match.value : bare[0].value;
      // Reject bare total if it equals a known fee/subtotal wrongly
      if (total === serviceCharge || total === discount || (subtotal && total === subtotal && discount > 0)) {
        if (match) total = match.value;
        else if (computedGuess > 0) total = computedGuess;
      }
    }
  }

  // Guard: service must not be the grand total / huge
  if (serviceCharge > 0 && subtotal > 0 && serviceCharge > subtotal * 0.35) {
    // Mis-read total as service — clear and try recompute
    if (!total || Math.abs(serviceCharge - total) <= 2) {
      total = total || serviceCharge;
    }
    serviceCharge = 0;
    // recover modest service from hits with small values
    const smallSvc = hits
      .filter((h) => h.kind === 'service' && h.value > 0 && h.value <= Math.max(5000, subtotal * 0.15))
      .sort((a, b) => b.priority - a.priority)[0];
    if (smallSvc) serviceCharge = smallSvc.value;
  }

  // Percent-only tax
  if (!tax && subtotal > 0) {
    for (const line of lines) {
      if (/termasuk\s*pajak/i.test(line)) break; // tax included — leave 0
      const m = line.match(/\b(?:ppn|pb\s*1|pb1|pajak|tax)\b[^%]{0,16}(\d{1,2})\s*%/i);
      if (m) {
        tax = Math.round((subtotal * parseInt(m[1], 10)) / 100);
        break;
      }
    }
  }

  if (!serviceCharge && subtotal > 0) {
    for (const line of lines) {
      const m = line.match(
        /\b(?:service\s*charge|service|svc|biaya\s*layanan)\b[^%]{0,16}(\d{1,2})\s*%/i
      );
      if (m && !/\b(kirim|delivery)\b/i.test(line)) {
        serviceCharge = Math.round((subtotal * parseInt(m[1], 10)) / 100);
        break;
      }
    }
  }

  // If still no total, compute
  if (!total && subtotal > 0) {
    total = subtotal + tax + serviceCharge + extraFees - discount;
  }

  return { subtotal, tax, serviceCharge, discount, extraFees, total };
}

/* ========================= Item parsing ========================= */

/** After preprocessOcrText, qty marker is normalized to lowercase "x" */
const QTY_MARK = String.raw`[xX]`;

function isQtyOnlyLine(line: string): boolean {
  const s = line.replace(/\s/g, '');
  // 3x, x3, 3, ×3, 3X
  return /^(?:\d{1,3}x|x\d{1,3}|\d{1,3})$/i.test(s);
}

/** Grab/Shopee often glue headers + "1x Item 114.000" on one OCR line */
function hasEmbeddedItemQty(line: string): boolean {
  return /\d{1,3}\s*x\s+[A-Za-z\u00C0-\u024F].{0,80}(?:rp\s*)?[\d.,]{3,}/i.test(line);
}

function qtyFromQtyOnlyLine(line: string): number {
  const digits = line.replace(/[^\d]/g, '');
  return clampQty(parseFloat(digits || '1'));
}

/** Strip ShopeeFood OCR junk prefixes: "&", "(gw", "(\"dee", "BiG", bullets, etc. */
function stripLeadingOcrJunk(line: string): string {
  let s = line.trim();
  // repeatedly peel non-item prefixes until we hit a digit qty or a letter name
  for (let n = 0; n < 8; n++) {
    const next = s
      .replace(/^[^A-Za-z0-9\u00C0-\u024F]+/, '') // symbols
      .replace(/^[A-Za-z]{1,4}(?=\s*\d{1,3}\s*x\b)/i, '') // (gw 1x / dee 1x / BiG 1x
      .replace(/^[A-Za-z]{1,4}\s+(?=\d{1,3}\s*x\b)/i, '')
      .replace(/^[\[\(\{]+\s*/, '')
      .trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

function parseItemLines(sectionLines: string[], allLines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  const used = new Set<number>();

  for (let i = 0; i < sectionLines.length; i++) {
    if (used.has(i)) continue;
    let line = sectionLines[i];

    // qty-only lines ("3x", "x2") must not be skipped — they pair with next lines
    if (shouldSkipAsItemLine(line) && !isQtyOnlyLine(line) && !hasEmbeddedItemQty(line)) {
      continue;
    }
    // Pure fee/total rows skip — but Grab glues "Ringkasan Pesanan ... 1x Party Bar 114.000"
    if (
      isFeeOrTotalLabelLine(line) &&
      !isQtyOnlyLine(line) &&
      !hasEmbeddedItemQty(line) &&
      !/\b[A-Za-z]{3,}\b.+\d{1,3}(?:[.,]\d{3}){1,}/.test(line)
    ) {
      continue;
    }

    line = stripLeadingOcrJunk(line);
    // Drop leading section headers glued to items
    line = line
      .replace(/^.*?\b(?:ringkasan\s*pesanan|rincian\s*pesanan|rincian\s*transaksi)\b\s*/i, '')
      .replace(/\bpesan\s*ini\s*lagi\b\s*/gi, '')
      .trim();

    // Pattern GoFood: "1 PaNas 2 Spicy..., Large   @Rp64.500   Rp64.500"
    //                  "1 1 pc Krispy Chicken McD  @Rp25.000   Rp25.000"
    //                  "1 McFlurry Matcha OREO     @Rp17.500   Rp17.500"
    let m = line.match(
      /^(\d{1,3})\s+(.+?)\s+@\s*rp\s*([\d.,]+)\s*(?:rp\s*)?([\d.,]+)?\s*$/i
    );
    if (m) {
      const qty = clampQty(parseFloat(m[1]));
      // Keep product size "1 pc ..." — only strip duplicate cart qty "1 1 pc"
      let name = cleanItemName(m[2]).replace(/^(\d{1,3})\s+(?=\d{1,3}\s*pc\b)/i, '').trim();
      const unitRaw = m[3];
      const totalRaw = m[4] || m[3];
      const unitPrice = parsePrice(unitRaw);
      const lineTotal = parsePrice(totalRaw);
      const price = unitPrice > 0 ? unitPrice : lineTotal;
      if (
        isValidItem(name, price) &&
        !isFeeOrTotalLabelLine(name) &&
        price >= 500
      ) {
        // Prefer unit price; qty from leading number (usually 1 per row on GoFood)
        items.push({ name, price, qty });
        continue;
      }
    }

    // Pattern GoFood loose: name ... @Rp unit ... Rp total (qty may be missing/garbled)
    m = line.match(
      /^(.+?)\s+@\s*rp\s*([\d.,]+)\s*(?:rp\s*)?([\d.,]+)?\s*$/i
    );
    if (m) {
      const extracted = extractQtyAndName(m[1]);
      let name = cleanItemName(extracted.name).replace(
        /^(\d{1,3})\s+(?=\d{1,3}\s*pc\b)/i,
        ''
      ).trim();
      const unitPrice = parsePrice(m[2]);
      const lineTotal = parsePrice(m[3] || m[2]);
      const price = unitPrice > 0 ? unitPrice : lineTotal;
      const qty = extracted.qty > 1 ? extracted.qty : 1;
      if (
        isValidItem(name, price) &&
        !isFeeOrTotalLabelLine(name) &&
        price >= 500
      ) {
        items.push({ name, price, qty });
        continue;
      }
    }

    // Pattern A: optional junk digit + "3x Bakmie Ayam 81.000"
    // Handles ShopeeFood OCR: "5 3 x Bakmie Ayam Rp81.000" / "& 1 x Promo ..."
    m = line.match(
      /^(?:\d{1,2}\s+)?(\d{1,3})\s*x\s*(.+?)\s+(rp\s*)?([\d.,]+)\s*$/i
    );
    if (m) {
      const qty = clampQty(parseFloat(m[1]));
      const name = cleanItemName(m[2]);
      const hasRp = !!m[3];
      const rawAmt = m[4];
      const lineTotal = parsePrice(rawAmt);
      if (
        isValidItem(name, lineTotal) &&
        !isFeeOrTotalLabelLine(name) &&
        isPlausibleItemPrice(rawAmt, lineTotal, hasRp || true, name)
      ) {
        items.push(unitize(name, lineTotal, qty, qty > 1));
        continue;
      }
    }

    // Pattern A-loose: "Nx Name ... RpPRICE" anywhere (leading OCR garbage)
    // Do NOT use [^rpRP] — that blocks names like "Promo"
    m = line.match(
      /(\d{1,3})\s*x\s+(.+?)\s+(rp\s*)?([\d.,]{3,})\s*$/i
    );
    if (m) {
      const qty = clampQty(parseFloat(m[1]));
      const name = cleanItemName(m[2]);
      const hasRp = !!m[3];
      const rawAmt = m[4];
      const lineTotal = parsePrice(rawAmt);
      if (
        qty >= 1 &&
        isValidItem(name, lineTotal) &&
        !isFeeOrTotalLabelLine(name) &&
        isPlausibleItemPrice(rawAmt, lineTotal, hasRp || true, name)
      ) {
        items.push(unitize(name, lineTotal, qty, qty > 1));
        continue;
      }
    }

    // Pattern A0: "3 Bakmie Ayam 81.000" (OCR dropped the x — very common)
    m = line.match(/^(?:\d{1,2}\s+)?(\d{1,3})\s+([A-Za-z\u00C0-\u024F].+?)\s+(rp\s*)?([\d.,]+)\s*$/i);
    if (m) {
      const qty = clampQty(parseFloat(m[1]));
      const name = cleanItemName(m[2]);
      const hasRp = !!m[3];
      const rawAmt = m[4];
      const lineTotal = parsePrice(rawAmt);
      if (
        qty >= 2 &&
        qty <= 50 &&
        isValidItem(name, lineTotal) &&
        isPlausibleItemPrice(rawAmt, lineTotal, hasRp, name)
      ) {
        items.push(unitize(name, lineTotal, qty, true));
        continue;
      }
    }

    // Pattern A2: "x3 Bakmie Ayam 81.000"
    m = line.match(/^x\s*(\d{1,3})\s+(.+?)\s+(rp\s*)?([\d.,]+)\s*$/i);
    if (m) {
      const qty = clampQty(parseFloat(m[1]));
      const name = cleanItemName(m[2]);
      const hasRp = !!m[3];
      const rawAmt = m[4];
      const lineTotal = parsePrice(rawAmt);
      if (
        isValidItem(name, lineTotal) &&
        isPlausibleItemPrice(rawAmt, lineTotal, hasRp, name)
      ) {
        items.push(unitize(name, lineTotal, qty, true));
        continue;
      }
    }

    // Pattern B: "Bakmie Ayam x3 81.000"
    m = line.match(/^(.+?)\s+x\s*(\d{1,3})\s+(rp\s*)?([\d.,]+)\s*$/i);
    if (m) {
      const name = cleanItemName(m[1]);
      const qty = clampQty(parseFloat(m[2]));
      const hasRp = !!m[3];
      const rawAmt = m[4];
      const lineTotal = parsePrice(rawAmt);
      if (
        isValidItem(name, lineTotal) &&
        isPlausibleItemPrice(rawAmt, lineTotal, hasRp, name)
      ) {
        items.push(unitize(name, lineTotal, qty, true));
        continue;
      }
    }

    // Pattern B2: "Bakmie Ayam 3x 81.000"
    m = line.match(/^(.+?)\s+(\d{1,3})\s*x\s+(rp\s*)?([\d.,]+)\s*$/i);
    if (m) {
      const name = cleanItemName(m[1]);
      const qty = clampQty(parseFloat(m[2]));
      const hasRp = !!m[3];
      const rawAmt = m[4];
      const lineTotal = parsePrice(rawAmt);
      if (
        isValidItem(name, lineTotal) &&
        isPlausibleItemPrice(rawAmt, lineTotal, hasRp, name)
      ) {
        items.push(unitize(name, lineTotal, qty, true));
        continue;
      }
    }

    // Pattern C: "Rendang 1 45.000" / "Bakmie Ayam 3 81.000" (name qty lineTotal)
    m = line.match(/^([A-Za-z\u00C0-\u024F].+?)\s+(\d{1,2})\s+(rp\s*)?([\d.,]{4,})\s*$/i);
    if (m) {
      const name = cleanItemName(m[1]);
      const qty = clampQty(parseFloat(m[2]));
      const hasRp = !!m[3];
      const rawAmt = m[4];
      const lineTotal = parsePrice(rawAmt);
      // price must be clearly money (4+ digit raw), qty small
      if (
        qty >= 1 &&
        qty <= 50 &&
        lineTotal >= 1000 &&
        isValidItem(name, lineTotal) &&
        !isHeaderOrAddressLine(name) &&
        isPlausibleItemPrice(rawAmt, lineTotal, hasRp || true, name)
      ) {
        // qty=1 → amount is unit (or line total of 1); qty>1 → line total
        items.push(unitize(name, lineTotal, qty, qty > 1));
        continue;
      }
    }

    // Pattern Shopee broken OCR (BEFORE plain name+price):
    // Line A (garbage + price): "ial - i   Rp105.000"
    // Line B (real item):       "BiG  1x B1G1 Cheesy Special - Medium"
    if (
      hasStrongPrice(line) &&
      i + 1 < sectionLines.length &&
      !used.has(i + 1) &&
      !hasStrongPrice(sectionLines[i + 1]) &&
      /\d{1,3}\s*x\s+[A-Za-z0-9]/i.test(stripLeadingOcrJunk(sectionLines[i + 1]))
    ) {
      const priceMatch =
        line.match(/(?:rp\s*)?([\d]{1,3}(?:[.,]\d{3})+)\s*$/i) ||
        line.match(/(?:rp\s*)?([\d.,]{4,})\s*$/i);
      const price = priceMatch ? parsePrice(priceMatch[1]) : 0;
      const next = stripLeadingOcrJunk(sectionLines[i + 1]);
      const qm = next.match(/(\d{1,3})\s*x\s+(.+)$/i);
      if (qm && price >= 1000) {
        const qty = clampQty(parseFloat(qm[1]));
        const name = cleanItemName(qm[2].replace(/\s+[pP]\s*$/i, ''));
        if (isValidItem(name, price) && !isFeeOrTotalLabelLine(name)) {
          items.push(unitize(name, price, qty, qty > 1));
          used.add(i + 1);
          continue;
        }
      }
    }

    // Pattern D: "Name Rp 25.000" / "Name 25.000" — peel qty out of name
    const rpMatch = line.match(/^(.+?)\s+rp\s*([\d.,]+)\s*$/i);
    const bareMatch = !rpMatch ? line.match(/^(.+?)\s+([\d.,]{3,})\s*$/) : null;
    m = rpMatch || bareMatch;
    if (m) {
      const rawAmount = m[2];
      const extracted = extractQtyAndName(m[1]);
      const price = parsePrice(rawAmount);
      const hasRp = !!rpMatch;
      if (
        isValidItem(extracted.name, price) &&
        !shouldSkipAsItemName(extracted.name) &&
        !TOTAL_LINE_RE.test(extracted.name) &&
        isPlausibleItemPrice(rawAmount, price, hasRp, extracted.name)
      ) {
        items.push(unitize(extracted.name, price, extracted.qty, extracted.qty > 1));
        continue;
      }
    }

    // Pattern F FIRST (3-line): "Bakmie Ayam" / "3x" / "Rp81.000"
    // Must run before 2-line price join so qty-only lines aren't treated as names
    if (
      !hasStrongPrice(line) &&
      !isQtyOnlyLine(line) &&
      i + 2 < sectionLines.length &&
      isQtyOnlyLine(sectionLines[i + 1]) &&
      (looksLikePriceOnly(sectionLines[i + 2]) || hasStrongPrice(sectionLines[i + 2]))
    ) {
      const name = cleanItemName(line);
      const qty = qtyFromQtyOnlyLine(sectionLines[i + 1]);
      const price = parsePrice(sectionLines[i + 2]);
      if (isValidItem(name, price) && !shouldSkipAsItemName(name)) {
        items.push(unitize(name, price, qty, true));
        used.add(i + 1);
        used.add(i + 2);
        continue;
      }
    }

    // Pattern F2: "3x" / "Bakmie Ayam" / "81.000"
    if (
      isQtyOnlyLine(line) &&
      i + 2 < sectionLines.length &&
      !hasStrongPrice(sectionLines[i + 1]) &&
      !isQtyOnlyLine(sectionLines[i + 1]) &&
      (looksLikePriceOnly(sectionLines[i + 2]) || hasStrongPrice(sectionLines[i + 2]))
    ) {
      const qty = qtyFromQtyOnlyLine(line);
      const name = cleanItemName(sectionLines[i + 1]);
      const price = parsePrice(sectionLines[i + 2]);
      if (isValidItem(name, price) && !shouldSkipAsItemName(name)) {
        items.push(unitize(name, price, qty, true));
        used.add(i + 1);
        used.add(i + 2);
        continue;
      }
    }

    // Pattern E: multiline — name (+ optional qty) then price on next line
    // Skip if current line is qty-only (e.g. "3x") — that is not an item name
    if (
      !hasStrongPrice(line) &&
      !isQtyOnlyLine(line) &&
      i + 1 < sectionLines.length &&
      looksLikePriceOnly(sectionLines[i + 1])
    ) {
      const extracted = extractQtyAndName(line);
      const price = parsePrice(sectionLines[i + 1]);
      if (
        extracted.name.length >= 2 &&
        !isQtyOnlyLine(extracted.name) &&
        isValidItem(extracted.name, price) &&
        !shouldSkipAsItemName(extracted.name) &&
        !shouldSkipAsItemLine(extracted.name)
      ) {
        items.push(unitize(extracted.name, price, extracted.qty, extracted.qty > 1));
        used.add(i + 1);
        continue;
      }
    }

    // Pattern G: loose "3x Name ... 81000" anywhere on line
    m = line.match(/(\d{1,3})\s*x\s+(.+?)\s+(?:rp\s*)?([\d.,]{3,})/i);
    if (m) {
      const qty = clampQty(parseFloat(m[1]));
      const name = cleanItemName(m[2]);
      const lineTotal = parsePrice(m[3]);
      if (isValidItem(name, lineTotal) && !isFeeOrTotalLabelLine(name)) {
        items.push(unitize(name, lineTotal, qty, true));
        continue;
      }
    }

    // Pattern Grab: "... 1x Party Bar ... 114.000" (qty after "Pesan ini lagi")
    m = line.match(
      /(?:pesan\s*ini\s*lagi\s*)?(\d{1,3})\s*x\s+([A-Za-z\u00C0-\u024F][\w\s&.'+\-/]{1,60}?)\s+(?:rp\s*)?([\d.,]{3,})\s*$/i
    );
    if (m) {
      const qty = clampQty(parseFloat(m[1]));
      const name = cleanItemName(m[2]);
      const lineTotal = parsePrice(m[3]);
      if (isValidItem(name, lineTotal) && !isFeeOrTotalLabelLine(name)) {
        items.push(unitize(name, lineTotal, qty, qty > 1));
        continue;
      }
    }

    // Pattern Grab bare: "Party Bar   114.000" (name + price, no qty)
    m = line.match(
      /^([A-Za-z\u00C0-\u024F][\w\s&.'+\-/,]{1,50}?)\s+(?:rp\s*)?([\d]{1,3}(?:[.,]\d{3})+)\s*$/i
    );
    if (m) {
      const name = cleanItemName(m[1]);
      const price = parsePrice(m[2]);
      if (
        isValidItem(name, price) &&
        !isFeeOrTotalLabelLine(name) &&
        !isHeaderOrAddressLine(name) &&
        name.split(/\s+/).length <= 8
      ) {
        items.push({ name, price, qty: 1 });
        continue;
      }
    }
  }

  void allLines;
  return items.map(forceNormalizeQtyPrice);
}

/**
 * Extract qty from names like "3x Bakmie Ayam", "5 3x Bakmie Ayam", "Bakmie Ayam x3"
 * ShopeeFood OCR often prefixes junk digits from "(5 menu)".
 */
function extractQtyAndName(raw: string): { name: string; qty: number } {
  let s = stripLeadingOcrJunk(raw.trim());
  if (!s) return { name: '', qty: 1 };

  s = s.replace(/[×✕✖*]/g, 'x');
  // strip UI bullets / junk prefixes
  s = s.replace(/^[\s\-–—•·●○▪►>&/(]+/, '');
  // strip leading lone noise digit(s) before real qty: "5 3x Bakmie" / "5 3 x Bakmie"
  s = s.replace(/^(\d{1,2})\s+(?=\d{1,3}\s*x\b)/i, '');
  // strip trailing menu count markers
  s = s.replace(/\(\s*\d+\s*menu\s*\)/gi, '').trim();

  // "3x Name" / "3 x Name"
  let m = s.match(/^(\d{1,3})\s*x\s*(.+)$/i);
  if (m) {
    const name = cleanItemName(m[2]);
    if (name.length >= 2) return { qty: clampQty(parseFloat(m[1])), name };
  }

  // "x3 Name"
  m = s.match(/^x\s*(\d{1,3})\s+(.+)$/i);
  if (m) {
    const name = cleanItemName(m[2]);
    if (name.length >= 2) return { qty: clampQty(parseFloat(m[1])), name };
  }

  // "Name x3" / "Name x 3"
  m = s.match(/^(.+?)\s+x\s*(\d{1,3})$/i);
  if (m) {
    const name = cleanItemName(m[1]);
    if (name.length >= 2) return { qty: clampQty(parseFloat(m[2])), name };
  }

  // "Name 3x"
  m = s.match(/^(.+?)\s+(\d{1,3})\s*x$/i);
  if (m) {
    const name = cleanItemName(m[1]);
    if (name.length >= 2) return { qty: clampQty(parseFloat(m[2])), name };
  }

  // "Name (x3)" / "Name (3x)"
  m = s.match(/^(.+?)\s*[\(\[]\s*x?\s*(\d{1,3})\s*x?\s*[\)\]]$/i);
  if (m) {
    const name = cleanItemName(m[1]);
    if (name.length >= 2) return { qty: clampQty(parseFloat(m[2])), name };
  }

  // qty embedded mid-string: "... 3x Bakmie" after junk
  m = s.match(/(?:^|\s)(\d{1,3})\s*x\s+([A-Za-z\u00C0-\u024F].+)$/i);
  if (m) {
    const name = cleanItemName(m[2]);
    if (name.length >= 2) return { qty: clampQty(parseFloat(m[1])), name };
  }

  // "3 Name" leading qty without x
  m = s.match(/^(\d{1,3})\s+([A-Za-z\u00C0-\u024F].+)$/);
  if (m) {
    const qty = clampQty(parseFloat(m[1]));
    const name = cleanItemName(m[2]);
    if (qty >= 2 && qty <= 50 && name.length >= 2 && !/^\d+$/.test(name)) {
      return { qty, name };
    }
  }

  return { name: cleanItemName(s), qty: 1 };
}

/**
 * Shopee/GoFood/Grab: "3x Item 81.000" → amount is LINE TOTAL.
 * unit price = round(lineTotal / qty).
 */
function unitize(
  name: string,
  amount: number,
  qty: number,
  amountIsLineTotal = false
): ParsedItem {
  const q = clampQty(qty);
  const clean = cleanItemName(name);
  if (q <= 1) return { name: clean, price: Math.round(amount), qty: 1 };

  if (amountIsLineTotal && amount > 0) {
    const unit = Math.round(amount / q);
    if (unit >= 100) return { name: clean, price: unit, qty: q };
  }

  // If amount divisible by qty → almost always line total on ID receipts
  if (amount >= 1000 && amount % q === 0) {
    const unit = Math.round(amount / q);
    if (unit >= 500) return { name: clean, price: unit, qty: q };
  }

  return { name: clean, price: Math.round(amount), qty: q };
}

/**
 * Hard guarantee: name never keeps "3x ...", and price is unit price.
 * Exact bug fix: { name: "3x Bakmie Ayam", price: 81000, qty: 1 }
 *            → { name: "Bakmie Ayam", price: 27000, qty: 3 }
 *
 * Safe against double-divide when already correct.
 */
export function forceNormalizeQtyPrice(item: ParsedItem): ParsedItem {
  const originalName = String(item.name || '');
  let price = Math.round(Number(item.price) || 0);
  let qty = clampQty(Number(item.qty) || 1);

  const extracted = extractQtyAndName(originalName);
  const name = extracted.name || cleanItemName(originalName);

  // Primary fix: qty embedded in name while qty field is still 1
  // → treat price as LINE TOTAL and split into unit price
  // "3x Bakmie Ayam" + 81000 + qty1 → Bakmie Ayam / 27000 / 3
  if (extracted.qty > 1 && qty <= 1 && price > 0) {
    return unitize(name, price, extracted.qty, true);
  }

  // Conflicting qty values — prefer name qty when it divides the price cleanly
  if (extracted.qty > 1 && qty > 1 && extracted.qty !== qty && price % extracted.qty === 0) {
    return unitize(name, price, extracted.qty, true);
  }

  // Name still has qty marker but qty field already set (>1) AND price not yet divided
  // Detect undivided line total: name has marker AND price == likely line total
  // (price divisible by qty, and unit price would still be >= 1000)
  // Only when name marker present (means previous pass didn't clean+divide)
  if (
    extracted.qty > 1 &&
    qty === extracted.qty &&
    price > 0 &&
    price % qty === 0
  ) {
    const nameStillHasQty =
      /^\d{1,3}\s*x\b/i.test(originalName.trim()) ||
      /\bx\s*\d{1,3}\s*$/i.test(originalName.trim()) ||
      /^\d{1,3}\s+[A-Za-z\u00C0-\u024F]/i.test(originalName.trim());
    if (nameStillHasQty) {
      const unit = Math.round(price / qty);
      if (unit >= 1000) return { name, price: unit, qty };
    }
  }

  return { name: cleanItemName(name), price, qty };
}

function clampQty(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 99) return 1;
  return Math.round(n);
}

function isFeeOrTotalLabelLine(line: string): boolean {
  return /\b(sub\s*total|subtotal|grand\s*total|total\s*bayar|total\s*pembayaran|total\s*pesanan|total\s*harga|total\s*dibayar|subtotal\s*pesanan|voucher|diskon|discount|potongan|hemat|biaya\s*pengiriman|biaya\s*layanan|biaya\s*admin|biaya\s*aplikasi|biaya\s*platform|biaya\s*lain-?lain|biaya\s*lainnya|biaya\s*lain|biaya\s*penanganan|biaya\s*pengemasan|ongkir|ongkos\s*kirim|delivery\s*fee|service\s*charge|service\s*fee|packing|kemasan|pengemasan|ppn|pb\s*1|pb1|pajak|tax|platform\s*fee|biaya\s*platform|handling|sudah\s*termasuk|termasuk\s*pajak|pesan\s*lagi|pesan\s*ini\s*lagi|ringkasan\s*pesanan|rincian\s*pesanan|rincian\s*pesananmu|rincian\s*transaksi|bukti\s*pengiriman|diantar\s*ke|diambil\s*dari|tambah\s*shopee|bayar\s*pakai|gopay|total\s*pembayaran|kontak\s*gojek|laporkan\s*masalah|tentang\s*gofood|bantuan|detail\s*pengantaran|id\s*transaksi|no\.?\s*order|catatan\s*untuk|profil)\b/i.test(
    line
  );
}

function shouldSkipAsItemLine(line: string): boolean {
  if (!line || line.length < 2) return true;
  if (isMetaOnlyLine(line)) return true;
  if (isFeeOrTotalLabelLine(line)) return true;
  if (isHeaderOrAddressLine(line)) return true;
  if (isPaymentFooterLine(line)) return true;
  if (isStrongTotalLine(line)) return true;
  if (TOTAL_LINE_RE.test(line) && hasStrongPrice(line)) return true;
  if (looksLikePriceOnly(line)) return true;
  // percent lines
  if (/^\d{1,2}\s*%$/.test(line)) return true;
  return false;
}

function shouldSkipAsItemName(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (n.length < 2) return true;
  // bare qty tokens are not product names
  if (isQtyOnlyLine(n)) return true;
  if (/^\d{1,3}x$/i.test(n) || /^x\d{1,3}$/i.test(n)) return true;
  if (isFeeOrTotalLabelLine(n)) return true;
  // GoFood / Grab / app footer junk
  if (
    /\b(kontak|gojek|gofood|grabfood|grab|shopee|bantuan|laporkan|tentang|pasaraya|kebayoran|indonesia\s*\d{5}|blok\s*m|floor|powered|makasih|hai\s+|diantarkan|jarak|waktu\s*antar|biaya\s*platform|platform|pengemudi|pribadi|catatan)\b/i.test(
      n
    )
  ) {
    return true;
  }
  if (shouldSkipAsItemLine(name)) return true;
  if (HEADER_JUNK_RE.test(n)) return true;
  if (TOTAL_LINE_RE.test(n)) return true;
  if (isPaymentFooterLine(n)) return true;
  // pure numbers / codes
  if (/^[\d\s\-./]+$/.test(n)) return true;
  // SKU-like
  if (/^[a-z]{0,3}\d{4,}$/i.test(n)) return true;
  // too many digits vs letters (address fragments)
  const digits = (n.match(/\d/g) || []).length;
  const letters = (n.match(/[a-z\u00c0-\u024f]/gi) || []).length;
  if (digits > letters && digits > 4) return true;
  // common non-item labels
  if (
    /^(no|qty|item|harga|price|desc|nama|name|jumlah|satuan|unit|amount|disc|total)$/i.test(
      n
    )
  ) {
    return true;
  }
  return false;
}

function isValidItem(name: string, price: number): boolean {
  if (!name || shouldSkipAsItemName(name)) return false;
  if (!price || price < 1000) return false; // ignore tiny noise (e.g. 600 from 00600)
  if (price > 100_000_000) return false;
  // name shouldn't be only currency words
  if (/^(rp|idr|rupiah)$/i.test(name.trim())) return false;
  // reject names that are mostly footer / contact chrome
  if (name.trim().split(/\s+/).length <= 1 && price < 5000) return false;
  // OCR garbage like "ial - i" / "a i" — need a real word (4+ letters) or product code w/ digits
  const letters = (name.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;
  if (letters < 3) return false;
  const maxWordLen = Math.max(
    0,
    ...name.split(/[\s\-_./]+/).map((w) => (w.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length)
  );
  if (maxWordLen < 4 && !/\d/.test(name)) return false;
  // mostly non-letters
  if (letters < name.replace(/\s/g, '').length * 0.4 && letters < 6) return false;
  return true;
}

/** Reject postal codes / bare IDs mistaken as prices */
function isPlausibleItemPrice(
  rawAmount: string,
  price: number,
  hasRp: boolean,
  name: string
): boolean {
  if (price < 500) return false;
  if (hasRp) return true;
  const raw = rawAmount.replace(/\s/g, '');
  // Clear thousand grouping: 12.000 / 1.250.000 / 12,000
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) return true;
  // Bare 4–8 digit IDR amounts (45000, 81000) — OK if name is product-like
  if (/^\d{4,8}$/.test(raw)) {
    if (isHeaderOrAddressLine(name) || isPostalOrCityLine(name)) return false;
    if (/\b(ny|st|rd|ave|jl|jln|no|lt|floor|tower|plaza|mall|ruko)\b/i.test(name)) {
      return false;
    }
    // 5-digit alone could be postal — require product-like name
    if (raw.length === 5 && !looksLikeFoodOrProductName(name)) return false;
    return true;
  }
  if (/^\d+$/.test(raw) && price >= 1000) {
    if (isHeaderOrAddressLine(name) || isPostalOrCityLine(name)) return false;
  }
  return price >= 500;
}

function looksLikeFoodOrProductName(name: string): boolean {
  // Heuristic: has vowels, not only proper-place shape, short-ish
  const n = name.trim();
  if (n.length < 2 || n.length > 60) return false;
  if (isHeaderOrAddressLine(n) || isPostalOrCityLine(n)) return false;
  if ((n.match(/,/g) || []).length >= 1 && /\d/.test(n)) return false;
  return /[aeiouAEIOU\u00C0-\u024F]/.test(n);
}

function hasCurrencyPrice(line: string): boolean {
  return /rp\.?\s*[\d.,]+/i.test(line) || /\$\s*[\d.,]+/.test(line);
}

function looksLikeItemCandidate(line: string): boolean {
  if (shouldSkipAsItemLine(line)) return false;
  if (hasStrongPrice(line) && cleanItemName(line.replace(/(?:rp\.?\s*)?[\d.,]+$/i, '')).length >= 2) {
    return true;
  }
  return false;
}

function filterJunkItems(items: ParsedItem[], fees: Partial<OcrResult>): ParsedItem[] {
  const banValues = new Set<number>();
  if (fees.total) banValues.add(fees.total);
  if (fees.subtotal) banValues.add(fees.subtotal);
  if (fees.tax) banValues.add(fees.tax);
  if (fees.serviceCharge) banValues.add(fees.serviceCharge);
  if (fees.discount) banValues.add(fees.discount);
  if (fees.extraFees) banValues.add(fees.extraFees);

  return items.filter((it) => {
    const lineTotal = it.price * it.qty;
    // drop if name looks like fee label
    if (TOTAL_LINE_RE.test(it.name) || shouldSkipAsItemName(it.name)) return false;
    if (isFeeOrTotalLabelLine(it.name)) return false;
    if (isHeaderOrAddressLine(it.name)) return false;
    // fee amounts mistaken as single items
    if (
      fees.extraFees &&
      Math.abs(lineTotal - fees.extraFees) <= 1 &&
      /biaya|ongkir|kirim|layanan|admin/i.test(it.name)
    ) {
      return false;
    }
    if (
      fees.serviceCharge &&
      Math.abs(lineTotal - fees.serviceCharge) <= 1 &&
      /biaya|layanan|service/i.test(it.name)
    ) {
      return false;
    }
    // drop exact total clones when we have other items
    if (items.length > 1 && fees.total && Math.abs(lineTotal - fees.total) <= 1) return false;
    if (items.length > 1 && fees.subtotal && Math.abs(lineTotal - fees.subtotal) <= 1 && it.name.length < 6) {
      return false;
    }
    // single fee amounts mistaken as items
    if (banValues.has(lineTotal) && /total|pajak|tax|service|diskon|ongkir|admin|ppn|pb1/i.test(it.name)) {
      return false;
    }
    return it.price > 0;
  });
}

function reconcileWithSubtotal(items: ParsedItem[], subtotal: number): ParsedItem[] {
  if (!items.length || !subtotal) return items;
  const sum = items.reduce((s, it) => s + it.price * it.qty, 0);
  if (Math.abs(sum - subtotal) <= Math.max(2, subtotal * 0.02)) return items;

  // Try treating each line price as line-total already (qty=1) vs unit — already handled

  // Drop items that are likely header leftovers if sum > subtotal
  if (sum > subtotal * 1.05) {
    // remove items whose removal gets closer to subtotal (greedy)
    let current = [...items];
    let currentSum = sum;
    const ranked = [...current].sort((a, b) => a.price * a.qty - b.price * b.qty);
    for (const candidate of ranked) {
      if (current.length <= 1) break;
      if (Math.abs(currentSum - subtotal) <= Math.max(2, subtotal * 0.02)) break;
      // only drop if it looks slightly suspicious or is far from food-like
      const lt = candidate.price * candidate.qty;
      const nextSum = currentSum - lt;
      if (Math.abs(nextSum - subtotal) < Math.abs(currentSum - subtotal)) {
        // prefer dropping address-like or very expensive outliers vs subtotal
        if (
          isHeaderOrAddressLine(candidate.name) ||
          lt > subtotal * 0.9 ||
          shouldSkipAsItemName(candidate.name)
        ) {
          current = current.filter((x) => x !== candidate);
          currentSum = nextSum;
        } else if (nextSum >= subtotal * 0.95) {
          current = current.filter((x) => x !== candidate);
          currentSum = nextSum;
        }
      }
    }
    return current;
  }

  return items;
}

/* ========================= Price helpers ========================= */

function parsePrice(s: string): number {
  let t = s.replace(/[^\d.,]/g, '');
  if (!t) return 0;

  if (t.includes('.') && t.includes(',')) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) {
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
  } else if (t.includes('.')) {
    const parts = t.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      // thousand separators: 12.000 or 1.250.000
      if (parts.slice(1).every((p) => p.length === 3)) {
        t = t.replace(/\./g, '');
      } else if (parts.length === 2 && parts[1].length <= 2) {
        // decimal
      } else {
        t = t.replace(/\./g, '');
      }
    } else if (parts.length === 2 && parts[1].length <= 2) {
      // decimal 12.5
    } else {
      t = t.replace(/\./g, '');
    }
  } else if (t.includes(',')) {
    const parts = t.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      t = t.replace(',', '.');
    } else if (parts.every((p, i) => i === 0 || p.length === 3)) {
      t = t.replace(/,/g, '');
    } else {
      t = t.replace(/,/g, '');
    }
  }

  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function extractAmounts(line: string): number[] {
  const matches = line.match(/(?:rp\.?\s*)?-?[\d.,]+/gi) || [];
  return matches.map((m) => parsePrice(m.replace(/-/g, ''))).filter((n) => n >= 100);
}

function hasStrongPrice(line: string): boolean {
  if (hasCurrencyPrice(line)) return true;
  // thousand-separated amounts: 12.000 / 1.250.000
  if (/\d{1,3}([.,]\d{3})+/.test(line)) return true;
  // Any amount >= 1000 — do NOT exclude 5-digit prices as "postal"
  // (45000 is a normal IDR food price; postal codes are handled in isAddressLike)
  return extractAmounts(line).some((n) => n >= 1000);
}

function extractPostal(line: string): number {
  // Only treat as postal when NOT clearly a currency amount
  if (hasCurrencyPrice(line) || /\d{1,3}([.,]\d{3})+/.test(line)) return -1;
  const m = line.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? parseInt(m[1], 10) : -1;
}

function looksLikePriceOnly(line: string): boolean {
  const s = line.trim();
  return /^(?:rp\.?\s*)?[\d.,]+(?:\s*)?$/i.test(s) || /^(?:rp\s*)[\d.]+$/i.test(s);
}

function cleanName(s: string): string {
  return s
    .replace(/[^\w\s&.'+\-/à-üÀ-Ü]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanItemName(s: string): string {
  return cleanName(
    s
      .replace(/^(?:rp\.?\s*)/i, '')
      // strip residual leading/trailing qty markers left after extract
      .replace(/^\d{1,2}\s+(?=\d{1,3}\s*x)/i, '')
      .replace(/^\d{1,3}\s*x\s+/i, '')
      .replace(/\s+x\s*\d{1,3}$/i, '')
      // strip GoFood @unit and trailing money glued into name
      .replace(/\s*@\s*rp\s*[\dlI.,]+\s*$/i, '')
      .replace(/\s+rp\s*[\dlI.,]+\s*$/i, '')
      .replace(/\s+@\s*[\dlI.,]+\s*$/i, '')
      .replace(/\s+[\d]{1,3}([.,]\d{3})+\s*$/g, '') // trailing 64.500
      // keep "1 pc ..." product names — only strip lone leading cart qty handled elsewhere
      .replace(/\.{2,}/g, ' ')
      .replace(/[-_]{2,}/g, ' ')
      .replace(/\s+[x×*]\s*$/i, '')
      .replace(/,/g, ' ')
  );
}

function dedupeItems(items: ParsedItem[]): ParsedItem[] {
  const map = new Map<string, ParsedItem>();
  for (const it of items) {
    const key = `${it.name.toLowerCase()}_${it.price}`;
    const existing = map.get(key);
    if (existing) existing.qty += it.qty;
    else map.set(key, { ...it });
  }
  return Array.from(map.values());
}

/* ========================= OCR runner ========================= */

export async function runOcr(
  imageSource: string | HTMLCanvasElement | File | Blob,
  onProgress?: (status: string, progress: number) => void
): Promise<OcrResult> {
  onProgress?.('loading', 0.05);
  const Tesseract = await import('tesseract.js');
  onProgress?.('recognizing', 0.08);

  const worker = await Tesseract.createWorker('ind+eng', 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/',
    langPath: '/tesseract/lang',
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.('recognizing', 0.1 + m.progress * 0.75);
      } else if (m.status?.includes('loading') && typeof m.progress === 'number') {
        onProgress?.('loading', 0.05 + m.progress * 0.05);
      }
    },
  });

  let text = '';
  try {
    // Receipt-friendly: uniform block of text, sparse text fallback
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });

    const primary = await worker.recognize(imageSource);
    text = primary.data.text || '';

    // If too little text, retry with sparse mode (better for noisy phone photos)
    if (text.trim().split(/\s+/).length < 8) {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
      });
      const secondary = await worker.recognize(imageSource);
      if ((secondary.data.text || '').length > text.length) {
        text = secondary.data.text || text;
      }
    }
  } finally {
    await worker.terminate();
  }

  onProgress?.('parsing', 0.9);
  let parsed = parseReceiptText(text);

  // OCR often puts price on the next line — join those before reparse
  const joined = text
    .replace(/\n(?=\s*(?:rp\.?\s*)?[\d.,]+\s*$)/gim, ' ')
    .replace(/\n(?=\s*[x×*]\s*\d{1,3}\s*$)/gim, ' ');
  const retry = parseReceiptText(joined);

  parsed = pickBetterParse(parsed, retry);

  // Third pass: collapse double newlines / fix common OCR confusions
  const cleaned = text
    .replace(/[|]/g, ' ')
    .replace(/\bS0\b/g, '50')
    .replace(/\bO(?=\d)/g, '0')
    .replace(/(?<=\d)O\b/g, '0')
    .replace(/\bRp\s*l/gi, 'Rp1')
    .replace(/\bl(?=\d{2,})/g, '1');
  parsed = pickBetterParse(parsed, parseReceiptText(cleaned));
  parsed = pickBetterParse(parsed, parseReceiptText(cleaned.replace(/\n(?=\s*(?:rp\.?\s*)?[\d.,]+)/gim, ' ')));

  onProgress?.('done', 1);
  return parsed;
}

function pickBetterParse(a: OcrResult, b: OcrResult): OcrResult {
  const score = (r: OcrResult) => {
    let s = r.items.length * 10;
    if (r.total > 0) s += 5;
    if (r.subtotal > 0) s += 4;
    if (r.tax > 0) s += 2;
    if (r.serviceCharge > 0) s += 2;
    if (r.storeName) s += 1;
    // prefer item sum close to subtotal
    if (r.subtotal && r.items.length) {
      const sum = r.items.reduce((x, it) => x + it.price * it.qty, 0);
      const rel = Math.abs(sum - r.subtotal) / r.subtotal;
      if (rel < 0.02) s += 12;
      else if (rel < 0.08) s += 6;
      else if (rel < 0.2) s += 2;
      else s -= 4;
    }
    // penalize address-like item names
    for (const it of r.items) {
      if (isHeaderOrAddressLine(it.name)) s -= 8;
    }
    return s;
  };
  return score(b) > score(a) ? b : a;
}

/* ========================= Image processing ========================= */

/** Enhance image for OCR: rotate, upscale small images, grayscale, contrast, sharpen */
export async function preprocessImage(
  source: HTMLImageElement | HTMLCanvasElement | string,
  options?: { rotate?: number }
): Promise<HTMLCanvasElement> {
  const img = await loadImage(source);
  const rotate = options?.rotate ?? 0;

  let w = img.width;
  let h = img.height;

  // Upscale small images for better OCR
  const minSide = Math.min(w, h);
  let scale = 1;
  if (minSide < 1000) scale = Math.min(2.5, 1200 / minSide);
  else if (minSide < 1400) scale = 1.25;

  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  if (rotate % 180 !== 0) {
    canvas.width = sh;
    canvas.height = sw;
  } else {
    canvas.width = sw;
    canvas.height = sh;
  }

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  // Grayscale + auto contrast stretch + mild sharpen-ish contrast
  let min = 255;
  let max = 0;
  const gray = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    gray[j] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  // Adaptive threshold-ish contrast
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = ((gray[j] - min) / range) * 255;
    // mild S-curve
    v = (v - 128) * 1.35 + 128;
    // binarize soft for receipt text (keep grayscale but push ends)
    if (v < 40) v = 0;
    else if (v > 220) v = 255;
    v = Math.min(255, Math.max(0, v));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function loadImage(
  source: HTMLImageElement | HTMLCanvasElement | string
): Promise<HTMLImageElement | HTMLCanvasElement> {
  if (typeof source !== 'string') return Promise.resolve(source);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = source;
  });
}

export function cropImageToCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  crop: { x: number; y: number; w: number; h: number }
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.w));
  canvas.height = Math.max(1, Math.round(crop.h));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    source,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas;
}
