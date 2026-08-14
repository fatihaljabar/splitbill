import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  Copy,
  CreditCard,
  MoreHorizontal,
  Pencil,
  Plus,
  ScanLine,
  Settings2,
  Trash2,
  UserPlus,
  Users,
  Undo2,
  Calculator,
  ImagePlus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { Dropdown } from '../components/ui/Dropdown';
import { Toggle } from '../components/ui/Toggle';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { NumberInput } from '../components/ui/NumberInput';
import { ParticipantChips } from '../components/ParticipantChips';
import { formatCurrency } from '../../shared/format.ts';
import { uid } from '../../shared/format.ts';
import type { BillItem, Participant, SplitMethod, PrivacyMode } from '../../shared/types.ts';
import { calculateBill } from '../../shared/calculate.ts';

type Tab = 'people' | 'items' | 'fees' | 'settings';

export function BillPage() {
  const { tr, currentBill, setCurrentBill, updateBill, toast, createEmptyBill, persistBill } =
    useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('people');
  const [nameInput, setNameInput] = useState('');
  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BillItem | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', price: 0, qty: 1, participantIds: [] as string[] });
  const [undoItem, setUndoItem] = useState<BillItem | null>(null);
  const [editPerson, setEditPerson] = useState<Participant | null>(null);
  const [personName, setPersonName] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [unassignedOpen, setUnassignedOpen] = useState(false);

  useEffect(() => {
    if (!currentBill) {
      const b = createEmptyBill();
      setCurrentBill(b);
    }
  }, [currentBill, createEmptyBill, setCurrentBill]);

  const bill = currentBill;
  const calc = useMemo(() => (bill ? calculateBill(bill) : null), [bill]);

  if (!bill) return null;

  const addParticipant = () => {
    const name = nameInput.trim();
    if (!name) return;
    if (bill.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast(tr('participantExists'), 'error');
      return;
    }
    if (bill.participants.length >= 50) {
      toast(tr('maxParticipants'), 'error');
      return;
    }
    const p: Participant = {
      id: uid(),
      name,
      isPayer: bill.participants.length === 0,
      paymentStatus: 'unpaid',
    };
    updateBill({ participants: [...bill.participants, p] });
    setNameInput('');
  };

  const removeParticipant = (id: string) => {
    updateBill({
      participants: bill.participants.filter((p) => p.id !== id),
      items: bill.items.map((it) => ({
        ...it,
        participantIds: it.participantIds.filter((pid) => pid !== id),
      })),
    });
  };

  const openAddItem = () => {
    setEditingItem(null);
    setItemForm({
      name: '',
      price: 0,
      qty: 1,
      participantIds: bill.participants.map((p) => p.id),
    });
    setItemModal(true);
  };

  const openEditItem = (item: BillItem) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      price: item.price,
      qty: item.qty,
      participantIds: [...item.participantIds],
    });
    setItemModal(true);
  };

  const saveItem = () => {
    if (!itemForm.name.trim()) {
      toast(tr('nameRequired'), 'error');
      return;
    }
    if (itemForm.price <= 0) {
      toast(tr('priceRequired'), 'error');
      return;
    }
    if (itemForm.participantIds.length === 0 && bill.splitMethod === 'by_item') {
      toast(tr('atLeastOnePerson'), 'error');
      return;
    }
    if (editingItem) {
      updateBill({
        items: bill.items.map((it) =>
          it.id === editingItem.id
            ? {
                ...it,
                name: itemForm.name.trim(),
                price: itemForm.price,
                qty: itemForm.qty,
                participantIds: itemForm.participantIds,
              }
            : it
        ),
      });
    } else {
      if (bill.items.length >= 100) {
        toast(tr('maxItems'), 'error');
        return;
      }
      const item: BillItem = {
        id: uid(),
        name: itemForm.name.trim(),
        price: itemForm.price,
        qty: itemForm.qty,
        participantIds: itemForm.participantIds,
      };
      updateBill({ items: [...bill.items, item] });
    }
    setItemModal(false);
  };

  const deleteItem = (item: BillItem) => {
    setUndoItem(item);
    updateBill({ items: bill.items.filter((i) => i.id !== item.id) });
    toast(tr('itemDeleted'), 'info');
  };

  const duplicateItem = (item: BillItem) => {
    updateBill({
      items: [...bill.items, { ...item, id: uid(), name: `${item.name} (copy)` }],
    });
  };

  const canCalculate =
    bill.participants.length > 0 &&
    (bill.splitMethod === 'custom' ||
      bill.splitMethod === 'percentage' ||
      bill.items.length > 0);

  const hasUnassignedItems =
    bill.splitMethod === 'by_item' &&
    bill.items.some((it) => !it.participantIds || it.participantIds.length === 0);

  const goToResults = () => {
    persistBill();
    navigate('/results');
  };

  const handleCalculate = () => {
    if (!canCalculate) {
      toast(tr('addAtLeast'), 'error');
      return;
    }
    if (hasUnassignedItems) {
      setUnassignedOpen(true);
      return;
    }
    goToResults();
  };

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'people', label: tr('participants'), icon: Users },
    { id: 'items', label: tr('items'), icon: MoreHorizontal },
    { id: 'fees', label: tr('tax'), icon: Calculator },
    { id: 'settings', label: tr('settings'), icon: Settings2 },
  ];

  return (
    <div className="page-root flex flex-col gap-3 pb-24 sm:gap-4 sm:pb-28">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLeaveOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
          aria-label={tr('back')}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <Input
            value={bill.eventName}
            onChange={(e) => updateBill({ eventName: e.target.value })}
            placeholder={tr('eventNamePlaceholder')}
            className="[&_input]:border-0 [&_input]:bg-transparent [&_input]:px-0 [&_input]:py-1 [&_input]:text-[15px] [&_input]:font-semibold [&_input]:shadow-none [&_input]:focus:ring-0"
          />
        </div>
      </div>

      <div className="scroll-x-soft flex items-center gap-1.5 pb-0.5">
        <button
          type="button"
          onClick={() => navigate('/scan')}
          className="action-chip"
        >
          <ScanLine className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden min-[380px]:inline">{tr('scanReceipt')}</span>
          <span className="min-[380px]:hidden">Scan</span>
        </button>
        <label className="inline-flex shrink-0">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                updateBill({ receiptImage: reader.result as string });
                navigate('/scan', { state: { image: reader.result } });
              };
              reader.readAsDataURL(file);
            }}
          />
          <span className="action-chip cursor-pointer">
            <ImagePlus className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden min-[380px]:inline">{tr('fromGallery')}</span>
          </span>
        </label>
        <button
          type="button"
          onClick={() => navigate('/scan', { state: { camera: true } })}
          className="action-chip"
        >
          <Camera className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">{tr('useCamera')}</span>
        </button>
      </div>

      {/* Tabs — compact single-row */}
      <div className="flex gap-0.5 rounded-lg border border-neutral-200 bg-neutral-100/80 p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex min-h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] font-medium leading-none transition ${
              tab === t.id
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <t.icon className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} />
            <span className="max-w-full truncate">{t.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'people' && (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5">
                <Input
                  compact
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={tr('participantName')}
                  onKeyDown={(e) => e.key === 'Enter' && addParticipant()}
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={addParticipant}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  aria-label={tr('addParticipant')}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </button>
              </div>

              {bill.participants.length === 0 ? (
                <Empty hint={tr('emptyParticipantsHint')} />
              ) : (
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 lg:gap-2.5">
                  {bill.participants.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-600 sm:h-8 sm:w-8 sm:text-xs dark:bg-neutral-800 dark:text-neutral-300">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="truncate text-[12px] font-medium leading-4 sm:text-[13px] sm:leading-5">
                          {p.name}
                        </p>
                        {p.isPayer ? (
                          <span className="block truncate text-[10px] font-medium leading-4 text-emerald-600 sm:text-[11px] dark:text-emerald-400">
                            {tr('payer')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              updateBill({
                                participants: bill.participants.map((x) => ({
                                  ...x,
                                  isPayer: x.id === p.id,
                                })),
                              })
                            }
                            className="block max-w-full truncate p-0 text-left text-[10px] font-medium leading-4 text-neutral-400 hover:text-neutral-700 sm:text-[11px] dark:hover:text-neutral-200"
                            title={tr('selectPayer')}
                          >
                            {tr('selectPayer')}
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditPerson(p);
                            setPersonName(p.name);
                          }}
                          className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          aria-label={tr('edit')}
                        >
                          <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeParticipant(p.id)}
                          className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                          aria-label={tr('delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {(bill.splitMethod === 'custom' || bill.splitMethod === 'percentage') &&
                bill.participants.length > 0 && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                    <p className="text-sm font-medium">
                      {bill.splitMethod === 'custom' ? tr('customAmountHint') : tr('percentageHint')}
                    </p>
                    {bill.participants.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-col gap-1.5 min-[400px]:flex-row min-[400px]:items-center min-[400px]:gap-3"
                      >
                        <span className="w-full truncate text-sm min-[400px]:w-24 md:w-28">
                          {p.name}
                        </span>
                        {bill.splitMethod === 'custom' ? (
                          <CurrencyInput
                            value={p.customAmount ?? 0}
                            onChange={(v) =>
                              updateBill({
                                participants: bill.participants.map((x) =>
                                  x.id === p.id ? { ...x, customAmount: v } : x
                                ),
                              })
                            }
                            className="min-w-0 flex-1"
                          />
                        ) : (
                          <NumberInput
                            compact
                            className="min-w-0 flex-1"
                            min={0}
                            max={100}
                            emptyValue={0}
                            value={p.percentage ?? 0}
                            suffix="%"
                            onChange={(v) =>
                              updateBill({
                                participants: bill.participants.map((x) =>
                                  x.id === p.id ? { ...x, percentage: v } : x
                                ),
                              })
                            }
                          />
                        )}
                      </div>
                    ))}
                    {bill.splitMethod === 'percentage' && (
                      <p className="text-xs text-neutral-500">
                        {tr('percentageTotal')}:{' '}
                        {bill.participants.reduce((s, p) => s + (p.percentage ?? 0), 0)}%
                      </p>
                    )}
                  </div>
                )}
            </div>
          )}

          {tab === 'items' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs text-neutral-500">
                  {bill.items.length} {tr('items')}
                </p>
                <Button size="sm" onClick={openAddItem} className="h-8 shrink-0 px-2.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  {tr('addItem')}
                </Button>
              </div>

              {undoItem && (
                <button
                  type="button"
                  onClick={() => {
                    updateBill({ items: [...bill.items, undoItem] });
                    setUndoItem(null);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[11px] font-medium dark:bg-neutral-800"
                >
                  <Undo2 className="h-3 w-3" />
                  {tr('undo')}: {undoItem.name}
                </button>
              )}

              {bill.items.length === 0 ? (
                <Empty hint={tr('emptyItemsHint')} />
              ) : (
                <ul className="grid grid-cols-1 gap-1.5 sm:gap-2 lg:grid-cols-2 lg:gap-2.5">
                  {bill.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-neutral-200 bg-white p-2.5 sm:p-3 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="flex items-start gap-1">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium leading-snug sm:text-[13px]">
                            {item.name}
                          </p>
                          <p className="mt-0.5 text-[11px] tabular-nums leading-4 text-neutral-500 sm:text-xs">
                            {formatCurrency(item.price, tr('currency'))} × {item.qty} ={' '}
                            {formatCurrency(item.price * item.qty, tr('currency'))}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <button
                            type="button"
                            onClick={() => openEditItem(item)}
                            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            aria-label={tr('edit')}
                          >
                            <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateItem(item)}
                            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            aria-label={tr('copy')}
                          >
                            <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItem(item)}
                            className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                            aria-label={tr('delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </button>
                        </div>
                      </div>
                      {bill.splitMethod === 'by_item' && bill.participants.length > 0 && (
                        <div className="mt-2 border-t border-neutral-100 pt-2 dark:border-neutral-800">
                          <p className="mb-1.5 text-[10px] font-medium leading-none text-neutral-400 sm:text-[11px]">
                            {tr('whoAte')}
                          </p>
                          <ParticipantChips
                            participants={bill.participants}
                            selectedIds={item.participantIds}
                            onToggle={(id) => {
                              const has = item.participantIds.includes(id);
                              updateBill({
                                items: bill.items.map((it) =>
                                  it.id === item.id
                                    ? {
                                        ...it,
                                        participantIds: has
                                          ? it.participantIds.filter((x) => x !== id)
                                          : [...it.participantIds, id],
                                      }
                                    : it
                                ),
                              });
                            }}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === 'fees' && (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <FeeField
                label={tr('tax')}
                value={bill.tax}
                isPercent={bill.taxIsPercent}
                onValue={(v) => updateBill({ tax: v })}
                onToggle={(v) => updateBill({ taxIsPercent: v })}
                hint={tr('taxHint')}
                tr={tr}
              />
              <FeeField
                label={tr('serviceCharge')}
                value={bill.serviceCharge}
                isPercent={bill.serviceChargeIsPercent}
                onValue={(v) => updateBill({ serviceCharge: v })}
                onToggle={(v) => updateBill({ serviceChargeIsPercent: v })}
                hint={tr('serviceHint')}
                tr={tr}
              />
              <FeeField
                label={tr('discount')}
                value={bill.discount}
                isPercent={bill.discountIsPercent}
                onValue={(v) => updateBill({ discount: v })}
                onToggle={(v) => updateBill({ discountIsPercent: v })}
                hint={tr('discountHint')}
                tr={tr}
              />
              <div className="rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
                <p className="mb-1.5 text-[12px] font-medium leading-none">{tr('extraFees')}</p>
                <CurrencyInput
                  compact
                  value={bill.extraFees}
                  onChange={(v) => updateBill({ extraFees: v })}
                />
                <p className="mt-1 text-[10px] leading-snug text-neutral-400">
                  Ongkir / admin / packing
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
                <p className="mb-1.5 text-[12px] font-medium leading-none">
                  {tr('receiptTotal')}{' '}
                  <span className="font-normal text-neutral-400">({tr('optional')})</span>
                </p>
                <CurrencyInput
                  compact
                  value={bill.totalOverride ?? 0}
                  onChange={(v) => updateBill({ totalOverride: v || undefined })}
                />
              </div>
              <div className="sm:col-span-2">
                <Toggle
                  checked={bill.rounding}
                  onChange={(v) => updateBill({ rounding: v })}
                  label={tr('rounding')}
                  description={tr('enableRounding')}
                />
              </div>
              <div className="sm:col-span-2">
                <Textarea
                  label={tr('notes')}
                  value={bill.notes}
                  onChange={(e) => updateBill({ notes: e.target.value })}
                  placeholder={tr('notesPlaceholder')}
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label={tr('storeName')}
                  value={bill.storeName || ''}
                  onChange={(e) => updateBill({ storeName: e.target.value })}
                />
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <Dropdown<SplitMethod>
                  label={tr('splitMethod')}
                  value={bill.splitMethod}
                  onChange={(v) => updateBill({ splitMethod: v })}
                  options={[
                    { value: 'equal', label: tr('equal'), description: tr('equalHint') },
                    { value: 'by_item', label: tr('byItem'), description: tr('byItemHint') },
                    { value: 'custom', label: tr('custom'), description: tr('customHint') },
                    {
                      value: 'percentage',
                      label: tr('percentage'),
                      description: tr('percentageHint2'),
                    },
                  ]}
                />
                <Dropdown<PrivacyMode>
                  label={tr('privacy')}
                  value={bill.privacyMode}
                  onChange={(v) => updateBill({ privacyMode: v })}
                  options={[
                    { value: 'public', label: tr('publicMode'), description: tr('publicDesc') },
                    { value: 'private', label: tr('privateMode'), description: tr('privateDesc') },
                  ]}
                />
                {bill.privacyMode === 'private' && (
                  <Toggle
                    checked={bill.hideParticipantNames}
                    onChange={(v) => updateBill({ hideParticipantNames: v })}
                    label={tr('hideNames')}
                  />
                )}
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-3.5 sm:p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 shrink-0 text-neutral-500" />
                  <p className="text-sm font-medium">{tr('bankAccount')}</p>
                </div>
                <div className="flex flex-col gap-3">
                  <Input
                    label={tr('bankName')}
                    value={bill.bankAccount.bankName}
                    onChange={(e) =>
                      updateBill({
                        bankAccount: { ...bill.bankAccount, bankName: e.target.value },
                      })
                    }
                    placeholder="BCA / Mandiri / ..."
                  />
                  <Input
                    label={tr('accountNumber')}
                    value={bill.bankAccount.accountNumber}
                    onChange={(e) =>
                      updateBill({
                        bankAccount: { ...bill.bankAccount, accountNumber: e.target.value },
                      })
                    }
                  />
                  <Input
                    label={tr('accountName')}
                    value={bill.bankAccount.accountName}
                    onChange={(e) =>
                      updateBill({
                        bankAccount: { ...bill.bankAccount, accountName: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Sticky footer */}
      <div className="fixed-footer fixed bottom-0 z-30 border-t border-neutral-200/80 bg-white/90 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="app-shell sticky-bar flex items-center gap-2 py-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] leading-none text-neutral-500">{tr('grandTotal')}</p>
            <p className="mt-0.5 truncate text-[15px] font-semibold tabular-nums">
              {formatCurrency(calc?.grandTotal ?? 0, tr('currency'))}
            </p>
          </div>
          <Button
            size="sm"
            className="h-9 shrink-0 px-3 text-xs"
            disabled={!canCalculate}
            onClick={handleCalculate}
          >
            <Calculator className="h-3.5 w-3.5" />
            <span className="hidden min-[360px]:inline">{tr('calculate')}</span>
            <span className="min-[360px]:hidden">Split</span>
          </Button>
        </div>
      </div>

      {/* Leave bill confirm */}
      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title={tr('leaveBillTitle')} size="sm">
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
            {tr('leaveBillDesc')}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" fullWidth onClick={() => setLeaveOpen(false)}>
              {tr('leaveBillStay')}
            </Button>
            <Button
              fullWidth
              onClick={() => {
                persistBill();
                setLeaveOpen(false);
                navigate('/');
              }}
            >
              {tr('leaveBillConfirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Unassigned items confirm */}
      <Modal
        open={unassignedOpen}
        onClose={() => setUnassignedOpen(false)}
        title={tr('unassignedTitle')}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
            {tr('unassignedDesc')}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              fullWidth
              onClick={() => {
                setUnassignedOpen(false);
                setTab('items');
              }}
            >
              {tr('unassignedFix')}
            </Button>
            <Button
              fullWidth
              onClick={() => {
                setUnassignedOpen(false);
                goToResults();
              }}
            >
              {tr('unassignedConfirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Item modal */}
      <Modal
        open={itemModal}
        onClose={() => setItemModal(false)}
        title={editingItem ? tr('edit') : tr('addItem')}
      >
        <div className="flex flex-col gap-4">
          <Input
            label={tr('itemName')}
            value={itemForm.name}
            onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <CurrencyInput
              label={tr('price')}
              value={itemForm.price}
              onChange={(v) => setItemForm((f) => ({ ...f, price: v }))}
            />
            <NumberInput
              label={tr('qty')}
              min={1}
              emptyValue={1}
              value={itemForm.qty}
              onChange={(v) => setItemForm((f) => ({ ...f, qty: v }))}
            />
          </div>
          {bill.participants.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">{tr('whoAte')}</p>
              <p className="mb-2 text-xs text-neutral-500">{tr('assignHint')}</p>
              <ParticipantChips
                participants={bill.participants}
                selectedIds={itemForm.participantIds}
                selectAllLabel={tr('selectAll')}
                deselectAllLabel={tr('deselectAll')}
                onSelectAll={() =>
                  setItemForm((f) => ({
                    ...f,
                    participantIds: bill.participants.map((p) => p.id),
                  }))
                }
                onDeselectAll={() => setItemForm((f) => ({ ...f, participantIds: [] }))}
                onToggle={(id) =>
                  setItemForm((f) => ({
                    ...f,
                    participantIds: f.participantIds.includes(id)
                      ? f.participantIds.filter((x) => x !== id)
                      : [...f.participantIds, id],
                  }))
                }
              />
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button variant="outline" fullWidth onClick={() => setItemModal(false)}>
              {tr('cancel')}
            </Button>
            <Button fullWidth onClick={saveItem}>
              {tr('save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit person modal */}
      <Modal
        open={!!editPerson}
        onClose={() => setEditPerson(null)}
        title={tr('editName')}
      >
        <div className="flex flex-col gap-4">
          <Input value={personName} onChange={(e) => setPersonName(e.target.value)} />
          <Button
            fullWidth
            onClick={() => {
              if (!editPerson || !personName.trim()) return;
              updateBill({
                participants: bill.participants.map((p) =>
                  p.id === editPerson.id ? { ...p, name: personName.trim() } : p
                ),
              });
              setEditPerson(null);
            }}
          >
            {tr('save')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 py-12 text-center dark:border-neutral-800">
      <p className="text-sm text-neutral-400">{hint}</p>
    </div>
  );
}

function FeeField({
  label,
  value,
  isPercent,
  onValue,
  onToggle,
  hint,
  tr,
}: {
  label: string;
  value: number;
  isPercent: boolean;
  onValue: (v: number) => void;
  onToggle: (v: boolean) => void;
  hint: string;
  tr: (k: 'percent' | 'fixed' | 'currency') => string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
        <p className="min-w-0 text-[12px] font-medium leading-none">{label}</p>
        <div className="flex shrink-0 rounded-md bg-neutral-100 p-0.5 text-[10px] leading-none dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => onToggle(true)}
            className={`rounded px-1.5 py-1 ${isPercent ? 'bg-white shadow-sm dark:bg-neutral-700' : ''}`}
          >
            {tr('percent')}
          </button>
          <button
            type="button"
            onClick={() => onToggle(false)}
            className={`rounded px-1.5 py-1 ${!isPercent ? 'bg-white shadow-sm dark:bg-neutral-700' : ''}`}
          >
            {tr('fixed')}
          </button>
        </div>
      </div>
      {isPercent ? (
        <NumberInput
          compact
          min={0}
          max={100}
          step={0.5}
          allowDecimal
          emptyValue={0}
          value={value}
          onChange={onValue}
          suffix="%"
        />
      ) : (
        <CurrencyInput compact value={value} onChange={onValue} />
      )}
      <p className="mt-1 text-[10px] leading-snug text-neutral-400">{hint}</p>
    </div>
  );
}
