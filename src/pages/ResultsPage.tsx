import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Link2,
  MessageCircle,
  Pencil,
  QrCode,
  Share2,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { toPng } from 'html-to-image';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Countdown } from '../components/Countdown';
import { formatCurrency, formatDate } from '../lib/format';
import { calculateBill, buildShareText } from '../lib/calculate';
import { loadBill, saveBill } from '../lib/storage';
import { buildShareUrl } from '../lib/share';
import {
  reloadBillWithPayments,
  setParticipantPaid,
  subscribePayments,
  syncPaymentsFromBill,
} from '../lib/payments';

export function ResultsPage() {
  const { tr, currentBill, setCurrentBill, toast } = useApp();
  const navigate = useNavigate();
  const summaryRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const confettiOnce = useRef(false);

  const bill = currentBill;
  const calc = useMemo(() => (bill ? calculateBill(bill) : null), [bill]);

  const refreshFromStorage = useCallback(() => {
    if (!currentBill) return;
    const fromCode = reloadBillWithPayments(currentBill.shortCode);
    const fromId = fromCode || reloadBillWithPayments(currentBill.id);
    if (fromId) {
      // only update if payment statuses changed (avoid loops)
      const changed =
        fromId.participants.length === currentBill.participants.length &&
        fromId.participants.some((p, i) => {
          const o = currentBill.participants.find((x) => x.id === p.id);
          return !o || o.paymentStatus !== p.paymentStatus;
        });
      if (changed || fromId.participants.length !== currentBill.participants.length) {
        setCurrentBill(fromId);
      }
      return;
    }
    const raw = loadBill(currentBill.shortCode) || loadBill(currentBill.id);
    if (raw) {
      const synced = syncPaymentsFromBill(raw);
      setCurrentBill(synced);
    }
  }, [currentBill, setCurrentBill]);

  // Initial: merge payments, mark payer paid, persist once
  useEffect(() => {
    if (!currentBill) {
      navigate('/bill');
      return;
    }
    const synced = syncPaymentsFromBill(currentBill);
    setCurrentBill(synced);
    saveBill(synced);
    if (!confettiOnce.current) {
      confettiOnce.current = true;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.65 },
        colors: ['#171717', '#a3a3a3', '#f5f5f4', '#78716c'],
      });
      setTimeout(() => {
        confetti({ particleCount: 40, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 40, angle: 120, spread: 55, origin: { x: 1 } });
      }, 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live sync: friend marks paid in another tab / same browser
  useEffect(() => {
    if (!currentBill) return;
    const unsub = subscribePayments((billId) => {
      if (billId === '*' || billId === currentBill.id) {
        refreshFromStorage();
      }
    });
    const onFocus = () => refreshFromStorage();
    window.addEventListener('focus', onFocus);
    const poll = window.setInterval(refreshFromStorage, 2500);
    return () => {
      unsub();
      window.removeEventListener('focus', onFocus);
      window.clearInterval(poll);
    };
  }, [currentBill?.id, refreshFromStorage]);

  if (!bill || !calc) return null;

  const shareUrl = buildShareUrl(bill);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast(tr('linkCopied'), 'success');
    } catch {
      toast(shareUrl, 'info');
    }
  };

  const copyResult = async () => {
    const text = buildShareText(bill, calc, tr('currency')) + `\n\n${shareUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      toast(tr('resultCopied'), 'success');
    } catch {
      toast(tr('error'), 'error');
    }
  };

  const shareWhatsApp = () => {
    const text = buildShareText(bill, calc, tr('currency')) + `\n\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const downloadImage = async () => {
    if (!summaryRef.current) return;
    try {
      const dataUrl = await toPng(summaryRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `splitbill-${bill.shortCode}.png`;
      a.click();
      toast(tr('imageDownloaded'), 'success');
    } catch {
      toast(tr('error'), 'error');
    }
  };

  const togglePaid = (pid: string) => {
    const target = bill.participants.find((p) => p.id === pid);
    if (!target || target.isPayer) return; // payer always covered
    const nextStatus = target.paymentStatus === 'paid' ? 'unpaid' : 'paid';
    const updated = setParticipantPaid(bill, pid, nextStatus);
    setCurrentBill(updated);
  };

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(bill.bankAccount.accountNumber);
      toast(tr('accountCopied'), 'success');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="page-root flex flex-col gap-4 pb-8 sm:gap-5 sm:pb-10">
      <div className="flex items-start gap-2 sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
          aria-label={tr('back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold sm:text-lg">{tr('results')}</h1>
          <p className="truncate text-[11px] text-neutral-500 sm:text-xs">{tr('confetti')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigate('/bill')}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden min-[360px]:inline">{tr('editBill')}</span>
          </button>
          <Countdown expiresAt={bill.expiresAt} compact />
        </div>
      </div>

      <div
        ref={summaryRef}
        className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:rounded-3xl sm:p-5 md:p-6 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-neutral-400 sm:text-xs">
            {tr('appName')}
          </p>
          <h2 className="mt-1 break-words text-lg font-semibold sm:text-xl">
            {bill.eventName || 'Split Bill'}
          </h2>
          {bill.storeName && (
            <p className="truncate text-sm text-neutral-500">{bill.storeName}</p>
          )}
          <p className="mt-1 text-[11px] text-neutral-400 sm:text-xs">{formatDate(bill.createdAt)}</p>
        </div>

        <div className="rounded-2xl bg-neutral-50 p-3.5 sm:p-4 dark:bg-neutral-950">
          <p className="text-xs text-neutral-500">{tr('grandTotal')}</p>
          <p className="break-all text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
            {formatCurrency(calc.grandTotal, tr('currency'))}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-1.5 text-[11px] text-neutral-500 min-[400px]:grid-cols-2 sm:gap-2 sm:text-xs">
            <span>
              {tr('subtotal')}: {formatCurrency(calc.itemsSubtotal, tr('currency'))}
            </span>
            <span>
              {tr('tax')}: {formatCurrency(calc.taxAmount, tr('currency'))}
            </span>
            <span>
              {tr('serviceCharge')}: {formatCurrency(calc.serviceAmount, tr('currency'))}
            </span>
            {calc.discountAmount > 0 && (
              <span>
                {tr('discount')}: -{formatCurrency(calc.discountAmount, tr('currency'))}
              </span>
            )}
            {calc.extraFees > 0 && (
              <span>
                {tr('extraFees')}: {formatCurrency(calc.extraFees, tr('currency'))}
              </span>
            )}
          </div>
        </div>

        {/* Receipt validation */}
        {calc.matchesReceipt !== null && (
          <div
            className={`rounded-xl px-3 py-2 text-xs font-medium ${
              calc.matchesReceipt
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
            }`}
          >
            {calc.matchesReceipt ? `✓ ${tr('totalMatch')}` : tr('totalMismatch')}
            <span className="mt-1 block opacity-80">
              {tr('receiptTotal')}: {formatCurrency(calc.receiptTotal || 0, tr('currency'))} ·{' '}
              {tr('calculated')}: {formatCurrency(calc.calculatedTotal, tr('currency'))}
            </span>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold">{tr('perPerson')}</h3>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {calc.perPerson.map((p, i) => (
              <motion.li
                key={p.participantId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl border border-neutral-100 p-3 dark:border-neutral-800"
              >
                <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                  {p.isPayer ? (
                    <span
                      className="mt-0.5 shrink-0 text-emerald-500 sm:mt-0"
                      title={tr('payer')}
                    >
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        togglePaid(p.participantId);
                      }}
                      className="mt-0.5 shrink-0 cursor-pointer rounded-full text-neutral-400 transition hover:text-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:mt-0"
                      title={p.paymentStatus === 'paid' ? tr('markUnpaid') : tr('markPaid')}
                      aria-pressed={p.paymentStatus === 'paid'}
                    >
                      {p.paymentStatus === 'paid' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <p className="max-w-full truncate text-sm font-medium">{p.name}</p>
                      {p.isPayer ? (
                        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                          {tr('payer')}
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            p.paymentStatus === 'paid'
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
                          }`}
                        >
                          {p.paymentStatus === 'paid' ? tr('paid') : tr('unpaid')}
                        </span>
                      )}
                    </div>
                    {p.items.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {p.items.map((it, j) => (
                          <li key={j} className="break-words text-[11px] text-neutral-500">
                            {it.name} · {formatCurrency(it.share, tr('currency'))}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatCurrency(p.total, tr('currency'))}
                  </p>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>

        {calc.settlements.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{tr('settlements')}</h3>
            <ul className="flex flex-col gap-2">
              {calc.settlements.map((s, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-1 rounded-xl bg-neutral-50 px-3 py-2.5 text-sm min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between dark:bg-neutral-950"
                >
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{s.fromName}</span>
                    <span className="text-neutral-400"> → </span>
                    <span className="font-medium">{s.toName}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCurrency(s.amount, tr('currency'))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {bill.bankAccount.accountNumber && (
          <div className="rounded-2xl border border-dashed border-neutral-200 p-3 dark:border-neutral-700">
            <p className="text-xs text-neutral-500">{tr('bankAccount')}</p>
            <p className="mt-1 text-sm font-medium">
              {bill.bankAccount.bankName} · {bill.bankAccount.accountName}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <p className="font-mono text-sm">{bill.bankAccount.accountNumber}</p>
              <button
                type="button"
                onClick={copyAccount}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {bill.notes && (
          <p className="text-xs text-neutral-500">
            {tr('notes')}: {bill.notes}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="outline" onClick={() => setShareOpen(true)} className="min-w-0">
          <Share2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{tr('share')}</span>
        </Button>
        <Button variant="outline" onClick={downloadImage} className="min-w-0">
          <Download className="h-4 w-4 shrink-0" />
          <span className="truncate">{tr('downloadImage')}</span>
        </Button>
        <Button variant="outline" onClick={copyResult} className="min-w-0">
          <Copy className="h-4 w-4 shrink-0" />
          <span className="truncate">{tr('copyResult')}</span>
        </Button>
        <Button variant="outline" onClick={() => setQrOpen(true)} className="min-w-0">
          <QrCode className="h-4 w-4 shrink-0" />
          <span className="truncate">{tr('qrCode')}</span>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          fullWidth
          onClick={() => {
            saveBill(bill);
            setShareOpen(true);
          }}
        >
          <Link2 className="h-4 w-4" />
          {tr('generateLink')}
        </Button>
        <Button variant="ghost" fullWidth onClick={() => navigate('/')}>
          {tr('home')}
        </Button>
      </div>

      {/* Share modal */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title={tr('shareLink')}>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-neutral-500">{tr('shareHint')}</p>
          <Countdown expiresAt={bill.expiresAt} />
          <div className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-950">
            <p className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed sm:text-xs">
              {shareUrl}
            </p>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-lg p-2 hover:bg-white dark:hover:bg-neutral-800"
              aria-label={tr('copyLink')}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <div className="flex justify-center rounded-2xl bg-white p-3 sm:p-4 dark:bg-neutral-950">
            <QRCodeSVG value={shareUrl} size={148} level="M" includeMargin className="h-auto max-w-full" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button fullWidth onClick={copyLink}>
              <Copy className="h-4 w-4" />
              {tr('copyLink')}
            </Button>
            <Button fullWidth variant="outline" onClick={shareWhatsApp}>
              <MessageCircle className="h-4 w-4" />
              {tr('shareWhatsApp')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={tr('qrCode')}>
        <div className="flex flex-col items-center gap-4">
          <QRCodeSVG value={shareUrl} size={200} level="M" includeMargin />
          <p className="text-center text-xs text-neutral-500">{tr('linkValidFor')}</p>
          <Button fullWidth onClick={copyLink}>
            <Check className="h-4 w-4" />
            {tr('copyLink')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
