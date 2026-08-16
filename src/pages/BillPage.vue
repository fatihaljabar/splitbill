<script setup lang="ts">
import {
  ArrowLeft,
  Calculator,
  Camera,
  Copy,
  CreditCard,
  ImagePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  ScanLine,
  Settings2,
  Trash2,
  Undo2,
  UserPlus,
  Users,
} from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { calculateBill } from '../../shared/calculate.ts';
import { formatCurrency, uid } from '../../shared/format.ts';
import type { BillItem, Participant } from '../../shared/types.ts';
import FeeField from '../components/FeeField.vue';
import ParticipantChips from '../components/ParticipantChips.vue';
import Button from '../components/ui/Button.vue';
import CurrencyInput from '../components/ui/CurrencyInput.vue';
import Dropdown from '../components/ui/Dropdown.vue';
import Input from '../components/ui/Input.vue';
import Modal from '../components/ui/Modal.vue';
import NumberInput from '../components/ui/NumberInput.vue';
import Textarea from '../components/ui/Textarea.vue';
import Toggle from '../components/ui/Toggle.vue';
import { useApp } from '../composables/useApp';

type Tab = 'people' | 'items' | 'fees' | 'settings';

const { tr, state, updateBill, toast, createEmptyBill, setCurrentBill, persistBill } = useApp();
const router = useRouter();

if (!state.currentBill) setCurrentBill(createEmptyBill());

const tab = ref<Tab>('people');
const nameInput = ref('');
const itemModal = ref(false);
const editingItem = ref<BillItem | null>(null);
const itemForm = reactive({ name: '', price: 0, qty: 1, participantIds: [] as string[] });
const undoItem = ref<BillItem | null>(null);
const editPerson = ref<Participant | null>(null);
const personName = ref('');
const leaveOpen = ref(false);
const unassignedOpen = ref(false);

const bill = computed(() => state.currentBill!);
const calc = computed(() => (state.currentBill ? calculateBill(state.currentBill) : null));

// F7: sistem tidak boleh diam-diam membetulkan persentase/nominal khusus yang tidak
// berjumlah pas — cuma memberi tahu. calculateBill() sendiri tidak diubah.
const percentageSum = computed(() =>
  bill.value.participants.reduce((s, p) => s + (p.percentage ?? 0), 0),
);
const percentageMatches = computed(() => percentageSum.value === 100);

const customSum = computed(() =>
  bill.value.participants.reduce((s, p) => s + (p.customAmount ?? 0), 0),
);
const customMatches = computed(() => customSum.value === (calc.value?.grandTotal ?? 0));

const tabs: { id: Tab; label: string; icon: unknown }[] = [
  {
    id: 'people',
    get label() {
      return tr('participants');
    },
    icon: Users,
  },
  {
    id: 'items',
    get label() {
      return tr('items');
    },
    icon: MoreHorizontal,
  },
  {
    id: 'fees',
    get label() {
      return tr('tax');
    },
    icon: Calculator,
  },
  {
    id: 'settings',
    get label() {
      return tr('settings');
    },
    icon: Settings2,
  },
];

function addParticipant() {
  const name = nameInput.value.trim();
  if (!name) return;
  if (bill.value.participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    toast(tr('participantExists'), 'error');
    return;
  }
  if (bill.value.participants.length >= 50) {
    toast(tr('maxParticipants'), 'error');
    return;
  }
  const p: Participant = {
    id: uid(),
    name,
    isPayer: bill.value.participants.length === 0,
    paymentStatus: 'unpaid',
  };
  updateBill({ participants: [...bill.value.participants, p] });
  nameInput.value = '';
}

function removeParticipant(id: string) {
  updateBill({
    participants: bill.value.participants.filter((p) => p.id !== id),
    items: bill.value.items.map((it) => ({
      ...it,
      participantIds: it.participantIds.filter((pid) => pid !== id),
    })),
  });
}

function openAddItem() {
  editingItem.value = null;
  itemForm.name = '';
  itemForm.price = 0;
  itemForm.qty = 1;
  itemForm.participantIds = bill.value.participants.map((p) => p.id);
  itemModal.value = true;
}

function openEditItem(item: BillItem) {
  editingItem.value = item;
  itemForm.name = item.name;
  itemForm.price = item.price;
  itemForm.qty = item.qty;
  itemForm.participantIds = [...item.participantIds];
  itemModal.value = true;
}

function saveItem() {
  if (!itemForm.name.trim()) {
    toast(tr('nameRequired'), 'error');
    return;
  }
  if (itemForm.price <= 0) {
    toast(tr('priceRequired'), 'error');
    return;
  }
  if (itemForm.participantIds.length === 0 && bill.value.splitMethod === 'by_item') {
    toast(tr('atLeastOnePerson'), 'error');
    return;
  }
  if (editingItem.value) {
    const editingId = editingItem.value.id;
    updateBill({
      items: bill.value.items.map((it) =>
        it.id === editingId
          ? {
              ...it,
              name: itemForm.name.trim(),
              price: itemForm.price,
              qty: itemForm.qty,
              participantIds: itemForm.participantIds,
            }
          : it,
      ),
    });
  } else {
    if (bill.value.items.length >= 100) {
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
    updateBill({ items: [...bill.value.items, item] });
  }
  itemModal.value = false;
}

function deleteItem(item: BillItem) {
  undoItem.value = item;
  updateBill({ items: bill.value.items.filter((i) => i.id !== item.id) });
  toast(tr('itemDeleted'), 'info');
}

function duplicateItem(item: BillItem) {
  updateBill({
    items: [...bill.value.items, { ...item, id: uid(), name: `${item.name} (copy)` }],
  });
}

const canCalculate = computed(
  () =>
    bill.value.participants.length > 0 &&
    (bill.value.splitMethod === 'custom' ||
      bill.value.splitMethod === 'percentage' ||
      bill.value.items.length > 0),
);

const hasUnassignedItems = computed(
  () =>
    bill.value.splitMethod === 'by_item' &&
    bill.value.items.some((it) => !it.participantIds || it.participantIds.length === 0),
);

async function goToResults() {
  await persistBill();
  router.push('/results');
}

async function leaveBillConfirmed() {
  await persistBill();
  leaveOpen.value = false;
  router.push('/');
}

function handleCalculate() {
  if (!canCalculate.value) {
    toast(tr('addAtLeast'), 'error');
    return;
  }
  if (hasUnassignedItems.value) {
    unassignedOpen.value = true;
    return;
  }
  goToResults();
}

function onGalleryFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    updateBill({ receiptImage: reader.result as string });
    router.push('/scan');
  };
  reader.readAsDataURL(file);
}
</script>

<template>
  <div class="page-root flex flex-col gap-3 pb-24 sm:gap-4 sm:pb-28">
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
        :aria-label="tr('back')"
        @click="leaveOpen = true"
      >
        <ArrowLeft class="h-3.5 w-3.5" />
      </button>
      <div class="min-w-0 flex-1">
        <Input
          :model-value="bill.eventName"
          :placeholder="tr('eventNamePlaceholder')"
          class="[&_input]:border-0 [&_input]:bg-transparent [&_input]:px-0 [&_input]:py-1 [&_input]:text-[15px] [&_input]:font-semibold [&_input]:shadow-none [&_input]:focus:ring-0"
          @update:model-value="updateBill({ eventName: $event })"
        />
      </div>
    </div>

    <div class="scroll-x-soft flex items-center gap-1.5 pb-0.5">
      <button type="button" class="action-chip" @click="router.push('/scan')">
        <ScanLine class="h-3.5 w-3.5 shrink-0" />
        <span class="hidden min-[380px]:inline">{{ tr('scanReceipt') }}</span>
        <span class="min-[380px]:hidden">Scan</span>
      </button>
      <label class="inline-flex shrink-0">
        <input type="file" accept="image/*" class="hidden" @change="onGalleryFile" />
        <span class="action-chip cursor-pointer">
          <ImagePlus class="h-3.5 w-3.5 shrink-0" />
          <span class="hidden min-[380px]:inline">{{ tr('fromGallery') }}</span>
        </span>
      </label>
      <button type="button" class="action-chip" @click="router.push('/scan')">
        <Camera class="h-3.5 w-3.5 shrink-0" />
        <span class="hidden sm:inline">{{ tr('useCamera') }}</span>
      </button>
    </div>

    <div class="flex gap-0.5 rounded-lg border border-neutral-200 bg-neutral-100/80 p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        :class="`flex min-h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] font-medium leading-none transition ${
          tab === t.id
            ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white'
            : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
        }`"
        @click="tab = t.id"
      >
        <component :is="t.icon" class="h-3 w-3 shrink-0 opacity-70" :stroke-width="2" />
        <span class="max-w-full truncate">{{ t.label }}</span>
      </button>
    </div>

    <div v-if="tab === 'people'" class="flex flex-col gap-2.5">
      <div class="flex items-center gap-1.5">
        <Input
          v-model="nameInput"
          compact
          :placeholder="tr('participantName')"
          class="min-w-0 flex-1"
          @keydown.enter="addParticipant"
        />
        <button
          type="button"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          :aria-label="tr('addParticipant')"
          @click="addParticipant"
        >
          <UserPlus class="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        v-if="bill.participants.length === 0"
        class="rounded-2xl border border-dashed border-neutral-200 py-12 text-center dark:border-neutral-800"
      >
        <p class="text-sm text-neutral-400">{{ tr('emptyParticipantsHint') }}</p>
      </div>
      <ul v-else class="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2 lg:gap-2.5">
        <li
          v-for="p in bill.participants"
          :key="p.id"
          class="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-neutral-600 sm:h-8 sm:w-8 sm:text-xs dark:bg-neutral-800 dark:text-neutral-300"
          >
            {{ p.name.charAt(0).toUpperCase() }}
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <p class="truncate text-[12px] font-medium leading-4 sm:text-[13px] sm:leading-5">{{ p.name }}</p>
            <span
              v-if="p.isPayer"
              class="block truncate text-[10px] font-medium leading-4 text-emerald-600 sm:text-[11px] dark:text-emerald-400"
            >
              {{ tr('payer') }}
            </span>
            <button
              v-else
              type="button"
              class="block max-w-full truncate p-0 text-left text-[10px] font-medium leading-4 text-neutral-400 hover:text-neutral-700 sm:text-[11px] dark:hover:text-neutral-200"
              :title="tr('selectPayer')"
              @click="updateBill({ participants: bill.participants.map((x) => ({ ...x, isPayer: x.id === p.id })) })"
            >
              {{ tr('selectPayer') }}
            </button>
          </div>
          <div class="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              class="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              :aria-label="tr('edit')"
              @click="
                editPerson = p;
                personName = p.name;
              "
            >
              <Pencil class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
            <button
              type="button"
              class="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
              :aria-label="tr('delete')"
              @click="removeParticipant(p.id)"
            >
              <Trash2 class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </li>
      </ul>

      <div
        v-if="(bill.splitMethod === 'custom' || bill.splitMethod === 'percentage') && bill.participants.length > 0"
        class="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p class="text-sm font-medium">
          {{ bill.splitMethod === 'custom' ? tr('customAmountHint') : tr('percentageHint') }}
        </p>
        <div
          v-for="p in bill.participants"
          :key="p.id"
          class="flex flex-col gap-1.5 min-[400px]:flex-row min-[400px]:items-center min-[400px]:gap-3"
        >
          <span class="w-full truncate text-sm min-[400px]:w-24 md:w-28">{{ p.name }}</span>
          <CurrencyInput
            v-if="bill.splitMethod === 'custom'"
            :model-value="p.customAmount ?? 0"
            class="min-w-0 flex-1"
            @update:model-value="
              updateBill({ participants: bill.participants.map((x) => (x.id === p.id ? { ...x, customAmount: $event } : x)) })
            "
          />
          <NumberInput
            v-else
            compact
            class="min-w-0 flex-1"
            :min="0"
            :max="100"
            :empty-value="0"
            :model-value="p.percentage ?? 0"
            suffix="%"
            @update:model-value="
              updateBill({ participants: bill.participants.map((x) => (x.id === p.id ? { ...x, percentage: $event } : x)) })
            "
          />
        </div>
        <p
          v-if="bill.splitMethod === 'percentage'"
          :class="`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
            percentageMatches
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
          }`"
        >
          {{ percentageMatches ? tr('splitMatch') : tr('percentageMismatch') }} ·
          {{ tr('percentageTotal') }}: {{ percentageSum }}%
        </p>
        <p
          v-if="bill.splitMethod === 'custom'"
          :class="`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
            customMatches
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
          }`"
        >
          {{ customMatches ? tr('splitMatch') : tr('customMismatch') }} ·
          {{ formatCurrency(customSum, tr('currency')) }} / {{ formatCurrency(calc?.grandTotal ?? 0, tr('currency')) }}
        </p>
      </div>
    </div>

    <div v-else-if="tab === 'items'" class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <p class="min-w-0 truncate text-xs text-neutral-500">{{ bill.items.length }} {{ tr('items') }}</p>
        <Button size="sm" class="h-8 shrink-0 px-2.5 text-xs" @click="openAddItem">
          <Plus class="h-3.5 w-3.5" />
          {{ tr('addItem') }}
        </Button>
      </div>

      <button
        v-if="undoItem"
        type="button"
        class="flex items-center gap-1.5 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[11px] font-medium dark:bg-neutral-800"
        @click="
          updateBill({ items: [...bill.items, undoItem] });
          undoItem = null;
        "
      >
        <Undo2 class="h-3 w-3" />
        {{ tr('undo') }}: {{ undoItem.name }}
      </button>

      <div
        v-if="bill.items.length === 0"
        class="rounded-2xl border border-dashed border-neutral-200 py-12 text-center dark:border-neutral-800"
      >
        <p class="text-sm text-neutral-400">{{ tr('emptyItemsHint') }}</p>
      </div>
      <ul v-else class="grid grid-cols-1 gap-1.5 sm:gap-2 lg:grid-cols-2 lg:gap-2.5">
        <li
          v-for="item in bill.items"
          :key="item.id"
          class="rounded-xl border border-neutral-200 bg-white p-2.5 sm:p-3 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div class="flex items-start gap-1">
            <div class="min-w-0 flex-1">
              <p class="truncate text-[12px] font-medium leading-snug sm:text-[13px]">{{ item.name }}</p>
              <p class="mt-0.5 text-[11px] tabular-nums leading-4 text-neutral-500 sm:text-xs">
                {{ formatCurrency(item.price, tr('currency')) }} × {{ item.qty }} =
                {{ formatCurrency(item.price * item.qty, tr('currency')) }}
              </p>
            </div>
            <div class="flex shrink-0 gap-0.5">
              <button
                type="button"
                class="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                :aria-label="tr('edit')"
                @click="openEditItem(item)"
              >
                <Pencil class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              <button
                type="button"
                class="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                :aria-label="tr('copy')"
                @click="duplicateItem(item)"
              >
                <Copy class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
              <button
                type="button"
                class="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500"
                :aria-label="tr('delete')"
                @click="deleteItem(item)"
              >
                <Trash2 class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>
          <div
            v-if="bill.splitMethod === 'by_item' && bill.participants.length > 0"
            class="mt-2 border-t border-neutral-100 pt-2 dark:border-neutral-800"
          >
            <p class="mb-1.5 text-[10px] font-medium leading-none text-neutral-400 sm:text-[11px]">{{ tr('whoAte') }}</p>
            <ParticipantChips
              :participants="bill.participants"
              :selected-ids="item.participantIds"
              @toggle="
                (id) => {
                  const has = item.participantIds.includes(id);
                  updateBill({
                    items: bill.items.map((it) =>
                      it.id === item.id
                        ? { ...it, participantIds: has ? it.participantIds.filter((x) => x !== id) : [...it.participantIds, id] }
                        : it,
                    ),
                  });
                }
              "
            />
          </div>
        </li>
      </ul>
    </div>

    <div v-else-if="tab === 'fees'" class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <FeeField
        :label="tr('tax')"
        :model-value="bill.tax"
        :is-percent="bill.taxIsPercent"
        :hint="tr('taxHint')"
        @update:model-value="updateBill({ tax: $event })"
        @update:is-percent="updateBill({ taxIsPercent: $event })"
      />
      <FeeField
        :label="tr('serviceCharge')"
        :model-value="bill.serviceCharge"
        :is-percent="bill.serviceChargeIsPercent"
        :hint="tr('serviceHint')"
        @update:model-value="updateBill({ serviceCharge: $event })"
        @update:is-percent="updateBill({ serviceChargeIsPercent: $event })"
      />
      <FeeField
        :label="tr('discount')"
        :model-value="bill.discount"
        :is-percent="bill.discountIsPercent"
        :hint="tr('discountHint')"
        @update:model-value="updateBill({ discount: $event })"
        @update:is-percent="updateBill({ discountIsPercent: $event })"
      />
      <div class="rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
        <p class="mb-1.5 text-[12px] font-medium leading-none">{{ tr('extraFees') }}</p>
        <CurrencyInput compact :model-value="bill.extraFees" @update:model-value="updateBill({ extraFees: $event })" />
        <p class="mt-1 text-[10px] leading-snug text-neutral-400">Ongkir / admin / packing</p>
      </div>
      <div class="rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
        <p class="mb-1.5 text-[12px] font-medium leading-none">
          {{ tr('receiptTotal') }} <span class="font-normal text-neutral-400">({{ tr('optional') }})</span>
        </p>
        <CurrencyInput
          compact
          :model-value="bill.totalOverride ?? 0"
          @update:model-value="updateBill({ totalOverride: $event || undefined })"
        />
      </div>
      <div class="sm:col-span-2">
        <Toggle
          :model-value="bill.rounding"
          :label="tr('rounding')"
          :description="tr('enableRounding')"
          @update:model-value="updateBill({ rounding: $event })"
        />
      </div>
      <div class="sm:col-span-2">
        <Textarea
          :label="tr('notes')"
          :model-value="bill.notes"
          :placeholder="tr('notesPlaceholder')"
          @update:model-value="updateBill({ notes: $event })"
        />
      </div>
      <div class="sm:col-span-2">
        <Input :label="tr('storeName')" :model-value="bill.storeName || ''" @update:model-value="updateBill({ storeName: $event })" />
      </div>
    </div>

    <div v-else-if="tab === 'settings'" class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="flex flex-col gap-4">
        <Dropdown
          :label="tr('splitMethod')"
          :model-value="bill.splitMethod"
          :options="[
            { value: 'equal', label: tr('equal'), description: tr('equalHint') },
            { value: 'by_item', label: tr('byItem'), description: tr('byItemHint') },
            { value: 'custom', label: tr('custom'), description: tr('customHint') },
            { value: 'percentage', label: tr('percentage'), description: tr('percentageHint2') },
          ]"
          @update:model-value="updateBill({ splitMethod: $event })"
        />
        <Dropdown
          :label="tr('privacy')"
          :model-value="bill.privacyMode"
          :options="[
            { value: 'public', label: tr('publicMode'), description: tr('publicDesc') },
            { value: 'private', label: tr('privateMode'), description: tr('privateDesc') },
          ]"
          @update:model-value="updateBill({ privacyMode: $event })"
        />
        <Toggle
          v-if="bill.privacyMode === 'private'"
          :model-value="bill.hideParticipantNames"
          :label="tr('hideNames')"
          @update:model-value="updateBill({ hideParticipantNames: $event })"
        />
      </div>

      <div class="rounded-2xl border border-neutral-200 bg-white p-3.5 sm:p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div class="mb-3 flex items-center gap-2">
          <CreditCard class="h-4 w-4 shrink-0 text-neutral-500" />
          <p class="text-sm font-medium">{{ tr('bankAccount') }}</p>
        </div>
        <div class="flex flex-col gap-3">
          <Input
            :label="tr('bankName')"
            :model-value="bill.bankAccount.bankName"
            placeholder="BCA / Mandiri / ..."
            @update:model-value="updateBill({ bankAccount: { ...bill.bankAccount, bankName: $event } })"
          />
          <Input
            :label="tr('accountNumber')"
            :model-value="bill.bankAccount.accountNumber"
            @update:model-value="updateBill({ bankAccount: { ...bill.bankAccount, accountNumber: $event } })"
          />
          <Input
            :label="tr('accountName')"
            :model-value="bill.bankAccount.accountName"
            @update:model-value="updateBill({ bankAccount: { ...bill.bankAccount, accountName: $event } })"
          />
        </div>
      </div>
    </div>

    <div class="fixed-footer fixed bottom-0 z-30 border-t border-neutral-200/80 bg-white/90 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/90">
      <div class="app-shell sticky-bar flex items-center gap-2 py-2 sm:gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-[10px] leading-none text-neutral-500">{{ tr('grandTotal') }}</p>
          <p class="mt-0.5 truncate text-[15px] font-semibold tabular-nums">
            {{ formatCurrency(calc?.grandTotal ?? 0, tr('currency')) }}
          </p>
        </div>
        <Button size="sm" class="h-9 shrink-0 px-3 text-xs" :disabled="!canCalculate" @click="handleCalculate">
          <Calculator class="h-3.5 w-3.5" />
          <span class="hidden min-[360px]:inline">{{ tr('calculate') }}</span>
          <span class="min-[360px]:hidden">Split</span>
        </Button>
      </div>
    </div>

    <Modal :open="leaveOpen" :title="tr('leaveBillTitle')" size="sm" @close="leaveOpen = false">
      <div class="flex flex-col gap-4">
        <p class="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">{{ tr('leaveBillDesc') }}</p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" full-width @click="leaveOpen = false">{{ tr('leaveBillStay') }}</Button>
          <Button full-width @click="leaveBillConfirmed">
            {{ tr('leaveBillConfirm') }}
          </Button>
        </div>
      </div>
    </Modal>

    <Modal :open="unassignedOpen" :title="tr('unassignedTitle')" size="sm" @close="unassignedOpen = false">
      <div class="flex flex-col gap-4">
        <p class="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">{{ tr('unassignedDesc') }}</p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="outline"
            full-width
            @click="
              unassignedOpen = false;
              tab = 'items';
            "
          >
            {{ tr('unassignedFix') }}
          </Button>
          <Button
            full-width
            @click="
              unassignedOpen = false;
              goToResults();
            "
          >
            {{ tr('unassignedConfirm') }}
          </Button>
        </div>
      </div>
    </Modal>

    <Modal :open="itemModal" :title="editingItem ? tr('edit') : tr('addItem')" @close="itemModal = false">
      <div class="flex flex-col gap-4">
        <Input v-model="itemForm.name" :label="tr('itemName')" />
        <div class="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <CurrencyInput v-model="itemForm.price" :label="tr('price')" />
          <NumberInput v-model="itemForm.qty" :label="tr('qty')" :min="1" :empty-value="1" />
        </div>
        <div v-if="bill.participants.length > 0">
          <p class="mb-2 text-sm font-medium">{{ tr('whoAte') }}</p>
          <p class="mb-2 text-xs text-neutral-500">{{ tr('assignHint') }}</p>
          <ParticipantChips
            :participants="bill.participants"
            :selected-ids="itemForm.participantIds"
            :select-all-label="tr('selectAll')"
            :deselect-all-label="tr('deselectAll')"
            @select-all="itemForm.participantIds = bill.participants.map((p) => p.id)"
            @deselect-all="itemForm.participantIds = []"
            @toggle="
              (id) =>
                (itemForm.participantIds = itemForm.participantIds.includes(id)
                  ? itemForm.participantIds.filter((x) => x !== id)
                  : [...itemForm.participantIds, id])
            "
          />
        </div>
        <div class="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button variant="outline" full-width @click="itemModal = false">{{ tr('cancel') }}</Button>
          <Button full-width @click="saveItem">{{ tr('save') }}</Button>
        </div>
      </div>
    </Modal>

    <Modal :open="!!editPerson" :title="tr('editName')" @close="editPerson = null">
      <div class="flex flex-col gap-4">
        <Input v-model="personName" />
        <Button
          full-width
          @click="
            if (editPerson && personName.trim()) {
              updateBill({
                participants: bill.participants.map((p) => (p.id === editPerson!.id ? { ...p, name: personName.trim() } : p)),
              });
              editPerson = null;
            }
          "
        >
          {{ tr('save') }}
        </Button>
      </div>
    </Modal>
  </div>
</template>
