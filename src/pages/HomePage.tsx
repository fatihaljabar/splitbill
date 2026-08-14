import { motion } from 'framer-motion';
import {
  Camera,
  Clock,
  Plus,
  ScanLine,
  Share2,
  Shield,
  Sparkles,
  Trash2,
  ChevronRight,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { formatCurrency, formatDate } from '../../shared/format.ts';
import { clearHistory, deleteHistoryEntry, loadHistory } from '../lib/storage';
import { Modal } from '../components/ui/Modal';

export function HomePage() {
  const { tr, createEmptyBill, setCurrentBill, toast } = useApp();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  const history = useMemo(() => {
    void tick;
    return loadHistory();
  }, [tick]);

  const startNew = () => {
    const bill = createEmptyBill();
    setCurrentBill(bill);
    navigate('/bill');
  };

  const startScan = () => {
    const bill = createEmptyBill();
    setCurrentBill(bill);
    navigate('/scan');
  };

  const openBill = (id: string, expired: boolean) => {
    if (expired) {
      navigate(`/s/${id}`);
      return;
    }
    const entry = history.find((h) => h.id === id);
    if (entry) {
      setCurrentBill(entry.bill);
      // History opens results (view split), not the editor
      navigate('/results');
    }
  };

  return (
    <div className="page-root page-fit-desktop flex flex-col gap-5 sm:gap-6 lg:gap-7">
      {/* Hero */}
      <section className="pt-1 lg:grid lg:flex-1 lg:grid-cols-2 lg:items-center lg:gap-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 sm:gap-4"
        >
          <div className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 sm:px-3 sm:text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {tr('noLogin')} · {tr('noInstall')}
            </span>
          </div>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-3xl md:text-4xl lg:text-[2.5rem] dark:text-white">
            {tr('tagline')}
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-neutral-500 sm:text-[15px] dark:text-neutral-400">
            {tr('feature1')}. {tr('feature2')}. {tr('feature3')}.
          </p>
          <div className="flex flex-col gap-2.5 min-[400px]:flex-row sm:gap-3">
            <Button size="lg" onClick={startNew} className="w-full min-[400px]:flex-1">
              <Plus className="h-5 w-5 shrink-0" />
              <span className="truncate">{tr('createBill')}</span>
            </Button>
            <Button size="lg" variant="outline" onClick={startScan} className="w-full min-[400px]:flex-1">
              <ScanLine className="h-5 w-5 shrink-0" />
              <span className="truncate">{tr('scanReceipt')}</span>
            </Button>
          </div>
        </motion.div>

        {/* Desktop side panel */}
        <div className="mt-5 hidden rounded-3xl border border-neutral-200/80 bg-white p-5 lg:mt-0 lg:block dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium text-neutral-900 dark:text-white">{tr('howItWorks')}</p>
          <ol className="mt-3 space-y-3">
            {[
              { n: '01', title: tr('step1Title'), desc: tr('step1Desc') },
              { n: '02', title: tr('step2Title'), desc: tr('step2Desc') },
              { n: '03', title: tr('step3Title'), desc: tr('step3Desc') },
            ].map((s) => (
              <li key={s.n} className="flex gap-3">
                <span className="text-sm font-semibold tabular-nums text-neutral-300 dark:text-neutral-600">
                  {s.n}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section className="grid shrink-0 grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 lg:gap-3">
        {[
          { icon: Camera, title: tr('scanReceipt'), desc: tr('feature1') },
          { icon: Users, title: tr('byItem'), desc: tr('feature2') },
          { icon: Share2, title: tr('shareLink'), desc: tr('feature3') },
          { icon: Shield, title: tr('localOnly'), desc: tr('feature4') },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            className="rounded-2xl border border-neutral-200/80 bg-white p-3 sm:p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <f.icon
              className="mb-2 h-4 w-4 text-neutral-700 sm:mb-3 sm:h-5 sm:w-5 dark:text-neutral-300"
              strokeWidth={1.75}
            />
            <p className="text-xs font-medium text-neutral-900 sm:text-sm dark:text-white">
              {f.title}
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-neutral-500 sm:text-xs">
              {f.desc}
            </p>
          </motion.div>
        ))}
      </section>

      {/* How it works — mobile/tablet */}
      <section id="how" className="flex flex-col gap-3 sm:gap-4 lg:hidden">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">{tr('howItWorks')}</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
          {[
            { n: '01', title: tr('step1Title'), desc: tr('step1Desc') },
            { n: '02', title: tr('step2Title'), desc: tr('step2Desc') },
            { n: '03', title: tr('step3Title'), desc: tr('step3Desc') },
          ].map((s) => (
            <div
              key={s.n}
              className="flex gap-3 rounded-2xl border border-neutral-200/80 bg-white p-3.5 sm:flex-col sm:gap-2 sm:p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-300 dark:text-neutral-600">
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* History */}
      <section className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">{tr('history')}</h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="shrink-0 text-xs font-medium text-neutral-400 hover:text-red-500"
            >
              {tr('clearAll')}
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center lg:min-h-0 lg:flex-1 lg:py-6 dark:border-neutral-800">
            <Clock className="h-7 w-7 text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
              {tr('noHistory')}
            </p>
            <p className="text-xs text-neutral-400">{tr('noHistoryDesc')}</p>
          </div>
        ) : (
          <ul className="grid min-h-0 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2 lg:gap-3">
            {history.map((h) => {
              const expired = Date.now() > h.expiresAt;
              return (
                <li key={h.id} className="min-w-0">
                  <div className="flex w-full items-stretch gap-1 rounded-2xl border border-neutral-200/80 bg-white transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
                    <button
                      type="button"
                      onClick={() => openBill(h.id, expired)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 p-3 text-left sm:gap-3 sm:p-3.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 sm:h-10 sm:w-10 dark:bg-neutral-800">
                        <Users className="h-4 w-4 text-neutral-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <p className="truncate text-sm font-medium">{h.eventName || '—'}</p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              expired
                                ? 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'
                                : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                            }`}
                          >
                            {expired ? tr('expired') : tr('active')}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-neutral-500 sm:text-xs">
                          {formatCurrency(h.grandTotal, tr('currency'))} · {h.participantCount}{' '}
                          {tr('people')}
                          <span className="hidden sm:inline"> · {formatDate(h.createdAt)}</span>
                        </p>
                      </div>
                      <ChevronRight className="hidden h-4 w-4 shrink-0 text-neutral-300 sm:block" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteHistoryEntry(h.id);
                        setTick((x) => x + 1);
                        toast(tr('saved'), 'info');
                      }}
                      className="flex shrink-0 items-center rounded-r-2xl px-2.5 text-neutral-400 hover:bg-neutral-50 hover:text-red-500 sm:px-3 dark:hover:bg-neutral-800"
                      aria-label={tr('delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="shrink-0 pt-1 text-center text-[11px] text-neutral-400 sm:text-xs">
        {tr('footer')}
      </p>

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title={tr('confirmDelete')}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{tr('deleteHistory')}?</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" fullWidth onClick={() => setConfirmClear(false)}>
              {tr('no')}
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                clearHistory();
                setTick((x) => x + 1);
                setConfirmClear(false);
              }}
            >
              {tr('yes')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
