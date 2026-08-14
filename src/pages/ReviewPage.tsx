import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Plus, ScanLine, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { NumberInput } from '../components/ui/NumberInput';
import { formatCurrency, uid } from '../../shared/format.ts';
import { forceNormalizeQtyPrice } from '../lib/ocr';
import type { BillItem } from '../../shared/types.ts';

interface ReviewData {
  items: Array<{ id: string; name: string; price: number; qty: number }>;
  tax: number;
  serviceCharge: number;
  discount: number;
  extraFees?: number;
  subtotal: number;
  total: number;
  storeName: string;
  date: string;
  rawText: string;
}

export function ReviewPage() {
  const { tr, currentBill, updateBill, toast } = useApp();
  const navigate = useNavigate();
  const [items, setItems] = useState<ReviewData['items']>([]);
  const [tax, setTax] = useState(0);
  const [service, setService] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [extraFees, setExtraFees] = useState(0);
  const [total, setTotal] = useState(0);
  const [storeName, setStoreName] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('ocr_review');
    if (!raw) {
      navigate('/scan');
      return;
    }
    try {
      const data = JSON.parse(raw) as ReviewData;
      const normalized = (data.items || []).map((it) => {
        const n = forceNormalizeQtyPrice({
          name: it.name,
          price: it.price,
          qty: it.qty,
        });
        return { id: it.id || uid(), name: n.name, price: n.price, qty: n.qty };
      });
      setItems(normalized.length ? normalized : [{ id: uid(), name: '', price: 0, qty: 1 }]);
      setTax(data.tax || 0);
      setService(data.serviceCharge || 0);
      setDiscount(data.discount || 0);
      setExtraFees(data.extraFees || 0);
      setTotal(data.total || 0);
      setStoreName(data.storeName || '');
      setRawText(data.rawText || '');
      setLoaded(true);
      if (!data.items.length) toast(tr('ocrNoItems'), 'info');
    } catch {
      navigate('/scan');
    }
  }, [navigate, toast, tr]);

  const itemsSum = items.reduce((s, it) => s + it.price * it.qty, 0);
  // Must include extraFees (ongkir/admin) in validation
  const calcTotal = itemsSum + tax + service + extraFees - discount;
  const matches = total > 0 ? Math.abs(calcTotal - total) <= 2 : null;

  const confirm = () => {
    const valid = items.filter((it) => it.name.trim() && it.price > 0);
    if (!valid.length) {
      toast(tr('addAtLeast'), 'error');
      return;
    }
    const participantIds = currentBill?.participants.map((p) => p.id) ?? [];
    const billItems: BillItem[] = valid.map((it) => ({
      id: it.id,
      name: it.name.trim(),
      price: it.price,
      qty: it.qty,
      participantIds: [...participantIds],
    }));

    updateBill({
      items: billItems,
      storeName: storeName || currentBill?.storeName,
      tax,
      taxIsPercent: false,
      serviceCharge: service,
      serviceChargeIsPercent: false,
      discount,
      discountIsPercent: false,
      extraFees,
      totalOverride: total || undefined,
      eventName: currentBill?.eventName || storeName || '',
    });
    sessionStorage.removeItem('ocr_review');
    toast(tr('changesSaved'), 'success');
    navigate('/bill');
  };

  if (!loaded) return null;

  return (
    <div className="page-root flex flex-col gap-4 pb-28 sm:gap-5 sm:pb-32">
      <div className="flex items-start gap-2 sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={() => {
            // Return to scan preview with the last receipt image when available
            const img = currentBill?.receiptImage;
            if (img) {
              navigate('/scan', { state: { image: img } });
            } else {
              navigate('/scan');
            }
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
          aria-label={tr('back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold sm:text-lg">{tr('reviewScan')}</h1>
          <p className="text-[11px] text-neutral-500 sm:text-xs">{tr('reviewDesc')}</p>
        </div>
      </div>

      <Input
        label={tr('storeName')}
        value={storeName}
        onChange={(e) => setStoreName(e.target.value)}
      />

      {/* Validation banner */}
      <div
        className={`rounded-2xl border p-4 ${
          matches === null
            ? 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'
            : matches
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
              : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
        }`}
      >
        <p className="text-sm font-medium">
          {matches === null
            ? tr('summary')
            : matches
              ? `✓ ${tr('totalMatch')}`
              : tr('totalMismatch')}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-neutral-500">{tr('subtotal')} (item)</p>
            <p className="font-medium tabular-nums">{formatCurrency(itemsSum, tr('currency'))}</p>
          </div>
          <div>
            <p className="text-neutral-500">{tr('tax')}</p>
            <p className="font-medium tabular-nums">{formatCurrency(tax, tr('currency'))}</p>
          </div>
          <div>
            <p className="text-neutral-500">{tr('serviceCharge')}</p>
            <p className="font-medium tabular-nums">{formatCurrency(service, tr('currency'))}</p>
          </div>
          <div>
            <p className="text-neutral-500">{tr('extraFees')}</p>
            <p className="font-medium tabular-nums">{formatCurrency(extraFees, tr('currency'))}</p>
          </div>
          <div>
            <p className="text-neutral-500">{tr('discount')}</p>
            <p className="font-medium tabular-nums">
              −{formatCurrency(discount, tr('currency'))}
            </p>
          </div>
          <div>
            <p className="text-neutral-500">{tr('calculated')}</p>
            <p className="font-medium tabular-nums">{formatCurrency(calcTotal, tr('currency'))}</p>
          </div>
          <div className="col-span-2">
            <p className="text-neutral-500">{tr('receiptTotal')}</p>
            <p className="text-base font-semibold tabular-nums">
              {formatCurrency(total, tr('currency'))}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold leading-none text-neutral-800 dark:text-neutral-100">
          {tr('items')}
        </h2>
        <button
          type="button"
          onClick={() =>
            setItems((prev) => [...prev, { id: uid(), name: '', price: 0, qty: 1 }])
          }
          className="inline-flex h-auto shrink-0 items-center gap-0.5 border-0 bg-transparent p-0 text-[13px] font-semibold leading-none text-neutral-800 transition hover:text-neutral-600 dark:text-neutral-100 dark:hover:text-neutral-300"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
          <span>{tr('addMissingItem')}</span>
        </button>
      </div>

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((item, idx) => {
          const lineTotal = item.price * item.qty;
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-3.5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-neutral-400">#{idx + 1}</span>
                <span className="text-[11px] tabular-nums text-neutral-500">
                  {tr('lineTotal')}: {formatCurrency(lineTotal, tr('currency'))}
                </span>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                  aria-label={tr('delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <Input
                  label={tr('itemName')}
                  value={item.name}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x))
                    )
                  }
                />
                <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
                  <CurrencyInput
                    label={`${tr('price')} (${tr('unitPrice')})`}
                    value={item.price}
                    onChange={(v) =>
                      setItems((prev) =>
                        prev.map((x) => (x.id === item.id ? { ...x, price: v } : x))
                      )
                    }
                  />
                  <NumberInput
                    label={tr('qty')}
                    min={1}
                    emptyValue={1}
                    value={item.qty}
                    onChange={(v) =>
                      setItems((prev) =>
                        prev.map((x) => (x.id === item.id ? { ...x, qty: v } : x))
                      )
                    }
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <CurrencyInput label={tr('tax')} value={tax} onChange={setTax} />
        <CurrencyInput label={tr('serviceCharge')} value={service} onChange={setService} />
        <CurrencyInput
          label={`${tr('extraFees')} (ongkir/admin)`}
          value={extraFees}
          onChange={setExtraFees}
        />
        <CurrencyInput label={tr('discount')} value={discount} onChange={setDiscount} />
        <div className="min-[400px]:col-span-2">
          <CurrencyInput label={tr('receiptTotal')} value={total} onChange={setTotal} />
        </div>
      </div>

      {rawText && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-medium text-neutral-500"
          >
            <span>Teks OCR mentah (debug)</span>
            <span>{showRaw ? '−' : '+'}</span>
          </button>
          {showRaw && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-neutral-100 px-4 py-3 text-[11px] leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
              {rawText}
            </pre>
          )}
        </div>
      )}

      <div className="fixed-footer fixed bottom-0 z-30 border-t border-neutral-200/80 bg-white/90 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="app-shell sticky-bar flex gap-2 py-2.5 sm:py-3">
          <Button variant="outline" onClick={() => navigate('/scan')} className="shrink-0">
            <ScanLine className="h-4 w-4" />
            <span className="hidden min-[400px]:inline">{tr('rescan')}</span>
          </Button>
          <Button fullWidth onClick={confirm}>
            <Check className="h-4 w-4" />
            <span className="truncate">{tr('confirmScan')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
