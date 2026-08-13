import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Copy, Home, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Countdown } from '../components/Countdown';
import { formatCurrency, formatDate } from '../lib/format';
import { calculateBill } from '../lib/calculate';
import { loadBillIncludingExpired, saveBill } from '../lib/storage';
import { decodeBill } from '../lib/share';
import { setParticipantPaid, syncPaymentsFromBill } from '../lib/payments';
import type { Bill } from '../types';

export function FriendPage() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const { tr, toast } = useApp();
  const navigate = useNavigate();
  const [bill, setBill] = useState<Bill | null>(null);
  const [expired, setExpired] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setNotFound(true);
      return;
    }

    // 1) Try embedded payload in URL (cross-device share, no backend)
    const dataParam = searchParams.get('d');
    let b: Bill | null = null;
    let exp = false;

    if (dataParam) {
      const decoded = decodeBill(dataParam);
      if (decoded) {
        b = decoded;
        exp = Date.now() > decoded.expiresAt;
        if (!exp) {
          try {
            // Merge any local payment updates already made on this device
            const merged = syncPaymentsFromBill(decoded);
            saveBill(merged);
            b = merged;
          } catch {
            try {
              saveBill(decoded);
            } catch {
              /* quota */
            }
          }
        }
      }
    }

    // 2) Fallback to local storage
    if (!b) {
      const local = loadBillIncludingExpired(code);
      b = local.bill;
      exp = local.expired;
      if (b && !exp) {
        b = syncPaymentsFromBill(b);
        saveBill(b);
      }
    }

    if (!b) {
      setNotFound(true);
      return;
    }
    if (exp) {
      setExpired(true);
      setBill(b);
      return;
    }
    setBill(b);
    const key = `splitbill_self_${b.id}`;
    const saved = localStorage.getItem(key);
    if (saved) setSelectedId(saved);
  }, [code, searchParams]);

  const calc = useMemo(() => (bill && !expired ? calculateBill(bill) : null), [bill, expired]);

  const me = calc?.perPerson.find((p) => p.participantId === selectedId);
  const isPrivate = bill?.privacyMode === 'private';

  const selectPerson = (id: string) => {
    setSelectedId(id);
    if (bill) localStorage.setItem(`splitbill_self_${bill.id}`, id);
  };

  const markPaid = () => {
    if (!bill || !selectedId) return;
    const target = bill.participants.find((p) => p.id === selectedId);
    if (target?.isPayer) {
      toast(tr('payer'), 'info');
      return;
    }
    const updated = setParticipantPaid(bill, selectedId, 'paid');
    setBill(updated);
    toast(tr('paid'), 'success');
  };

  const copyAccount = async () => {
    if (!bill?.bankAccount.accountNumber) return;
    try {
      await navigator.clipboard.writeText(bill.bankAccount.accountNumber);
      toast(tr('accountCopied'), 'success');
    } catch {
      /* ignore */
    }
  };

  const waPay = () => {
    if (!bill || !me) return;
    const payer = bill.participants.find((p) => p.isPayer);
    const text = [
      `Halo${payer ? ` ${payer.name}` : ''},`,
      `Saya ${me.name} sudah siap transfer untuk *${bill.eventName || 'Split Bill'}*.`,
      `Nominal: ${formatCurrency(me.total, tr('currency'))}`,
      bill.bankAccount.accountNumber
        ? `Rek: ${bill.bankAccount.bankName} ${bill.bankAccount.accountNumber} a/n ${bill.bankAccount.accountName}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (notFound) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-2 text-center">
        <p className="text-base font-semibold sm:text-lg">{tr('billNotFound')}</p>
        <p className="max-w-sm text-sm text-neutral-500">{tr('billNotFoundDesc')}</p>
        <Button onClick={() => navigate('/')}>
          <Home className="h-4 w-4" />
          {tr('goHome')}
        </Button>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-2 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 sm:h-16 sm:w-16 dark:bg-neutral-800">
          <span className="text-2xl">⌛</span>
        </div>
        <p className="text-base font-semibold sm:text-lg">{tr('expiredTitle')}</p>
        <p className="max-w-sm text-sm text-neutral-500">{tr('expiredDesc')}</p>
        {bill && (
          <p className="max-w-full truncate px-2 text-xs text-neutral-400">
            {bill.eventName} · {formatDate(bill.createdAt)}
          </p>
        )}
        <Button onClick={() => navigate('/')}>
          <Home className="h-4 w-4" />
          {tr('goHome')}
        </Button>
      </div>
    );
  }

  if (!bill || !calc) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center text-sm text-neutral-500">
        {tr('loading')}
      </div>
    );
  }

  return (
    <div className="page-root mx-auto flex w-full max-w-2xl flex-col gap-4 pb-6 sm:gap-5 sm:pb-8 lg:max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-neutral-400 sm:text-xs">
            {tr('friendView')}
          </p>
          <h1 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl">
            {bill.eventName || 'Split Bill'}
          </h1>
          {bill.storeName && (
            <p className="truncate text-sm text-neutral-500">{bill.storeName}</p>
          )}
        </div>
        <div className="shrink-0 self-start">
          <Countdown expiresAt={bill.expiresAt} compact />
        </div>
      </div>

      {!selectedId ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{tr('selectParticipant')}</p>
          <ul className="flex flex-col gap-2">
            {bill.participants.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => selectPerson(p.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold dark:bg-neutral-800">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm font-medium">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {!isPrivate && (
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="mb-2 text-xs font-medium text-neutral-500">{tr('grandTotal')}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatCurrency(calc.grandTotal, tr('currency'))}
              </p>
            </div>
          )}
        </motion.div>
      ) : me ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:rounded-3xl sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-sm text-neutral-500">
              {tr('welcomeFriend')},{' '}
              <span className="font-medium text-neutral-900 dark:text-white">{me.name}</span>
            </p>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-neutral-400 sm:text-xs">
              {tr('mustPay')}
            </p>
            <p className="break-all text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
              {formatCurrency(me.total, tr('currency'))}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-1.5 text-[11px] text-neutral-500 min-[400px]:grid-cols-2 sm:gap-2 sm:text-xs">
              <span>
                {tr('subtotal')}: {formatCurrency(me.itemsSubtotal, tr('currency'))}
              </span>
              <span>
                {tr('tax')}: {formatCurrency(me.taxShare, tr('currency'))}
              </span>
              <span>
                {tr('serviceCharge')}: {formatCurrency(me.serviceShare, tr('currency'))}
              </span>
              {me.discountShare > 0 && (
                <span>
                  {tr('discount')}: -{formatCurrency(me.discountShare, tr('currency'))}
                </span>
              )}
            </div>
          </div>

          {me.items.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-2 text-sm font-semibold">{tr('yourItems')}</h3>
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {me.items.map((it, i) => (
                  <li key={i} className="flex justify-between py-2 text-sm">
                    <span className="text-neutral-700 dark:text-neutral-300">{it.name}</span>
                    <span className="tabular-nums font-medium">
                      {formatCurrency(it.share, tr('currency'))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Public: show others */}
          {!isPrivate && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-2 text-sm font-semibold">{tr('paymentSummary')}</h3>
              <ul className="flex flex-col gap-2">
                {calc.perPerson.map((p) => (
                  <li key={p.participantId} className="flex items-center justify-between text-sm">
                    <span className={p.participantId === me.participantId ? 'font-semibold' : ''}>
                      {bill.hideParticipantNames && p.participantId !== me.participantId
                        ? '•••'
                        : p.name}
                      {p.participantId === me.participantId ? ` (${tr('you')})` : ''}
                    </span>
                    <span className="tabular-nums">
                      {formatCurrency(p.total, tr('currency'))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {bill.bankAccount.accountNumber && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs text-neutral-500">{tr('payTo')}</p>
              <p className="mt-1 text-sm font-medium">
                {bill.bankAccount.bankName} · {bill.bankAccount.accountName}
              </p>
              <div className="mt-2 flex min-w-0 items-center gap-2">
                <p className="min-w-0 break-all font-mono text-sm font-semibold sm:text-base">
                  {bill.bankAccount.accountNumber}
                </p>
                <button
                  type="button"
                  onClick={copyAccount}
                  className="shrink-0 rounded-lg border border-neutral-200 p-2 dark:border-neutral-700"
                  aria-label={tr('copyAccount')}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {me.paymentStatus !== 'paid' ? (
              <Button size="lg" fullWidth className="sm:flex-1" onClick={markPaid}>
                {tr('markPaid')}
              </Button>
            ) : (
              <div className="w-full rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700 sm:flex-1 dark:bg-emerald-950/40 dark:text-emerald-400">
                ✓ {tr('paid')}
              </div>
            )}
            <Button variant="outline" fullWidth className="sm:flex-1" onClick={waPay}>
              <MessageCircle className="h-4 w-4" />
              {tr('shareWhatsApp')}
            </Button>
            <Button variant="ghost" fullWidth className="sm:basis-full" onClick={() => setSelectedId(null)}>
              {tr('selectParticipant')}
            </Button>
          </div>

          <p className="text-center text-[11px] text-neutral-400">{tr('viewOnly')}</p>
        </motion.div>
      ) : null}
    </div>
  );
}
