<script setup lang="ts">
import { ArrowLeft, Check, Plus, ScanLine, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatCurrency, uid } from '../../shared/format.ts';
import type { BillItem } from '../../shared/types.ts';
import Button from '../components/ui/Button.vue';
import CurrencyInput from '../components/ui/CurrencyInput.vue';
import Input from '../components/ui/Input.vue';
import NumberInput from '../components/ui/NumberInput.vue';
import { useApp } from '../composables/useApp';
import { forceNormalizeQtyPrice } from '../lib/ocr.ts';

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

const { tr, state, updateBill, toast } = useApp();
const router = useRouter();

const items = ref<ReviewData['items']>([]);
const tax = ref(0);
const service = ref(0);
const discount = ref(0);
const extraFees = ref(0);
const total = ref(0);
const storeName = ref('');
const showRaw = ref(false);
const rawText = ref('');
const loaded = ref(false);

onMounted(() => {
  const raw = sessionStorage.getItem('ocr_review');
  if (!raw) {
    router.push('/scan');
    return;
  }
  try {
    const data = JSON.parse(raw) as ReviewData;
    const normalized = (data.items || []).map((it) => {
      const n = forceNormalizeQtyPrice({ name: it.name, price: it.price, qty: it.qty });
      return { id: it.id || uid(), name: n.name, price: n.price, qty: n.qty };
    });
    items.value = normalized.length ? normalized : [{ id: uid(), name: '', price: 0, qty: 1 }];
    tax.value = data.tax || 0;
    service.value = data.serviceCharge || 0;
    discount.value = data.discount || 0;
    extraFees.value = data.extraFees || 0;
    total.value = data.total || 0;
    storeName.value = data.storeName || '';
    rawText.value = data.rawText || '';
    loaded.value = true;
    if (!data.items.length) toast(tr('ocrNoItems'), 'info');
  } catch {
    router.push('/scan');
  }
});

const itemsSum = computed(() => items.value.reduce((s, it) => s + it.price * it.qty, 0));
const calcTotal = computed(
  () => itemsSum.value + tax.value + service.value + extraFees.value - discount.value,
);
const matches = computed(() =>
  total.value > 0 ? Math.abs(calcTotal.value - total.value) <= 2 : null,
);

function addItem() {
  items.value.push({ id: uid(), name: '', price: 0, qty: 1 });
}

function removeItem(id: string) {
  items.value = items.value.filter((x) => x.id !== id);
}

function goBack() {
  // ScanPage reads the last photo straight from state.currentBill.receiptImage
  // (route state isn't a thing in vue-router the way it is in react-router).
  router.push('/scan');
}

function confirm() {
  const valid = items.value.filter((it) => it.name.trim() && it.price > 0);
  if (!valid.length) {
    toast(tr('addAtLeast'), 'error');
    return;
  }
  const participantIds = state.currentBill?.participants.map((p) => p.id) ?? [];
  const billItems: BillItem[] = valid.map((it) => ({
    id: it.id,
    name: it.name.trim(),
    price: it.price,
    qty: it.qty,
    participantIds: [...participantIds],
  }));

  updateBill({
    items: billItems,
    storeName: storeName.value || state.currentBill?.storeName,
    tax: tax.value,
    taxIsPercent: false,
    serviceCharge: service.value,
    serviceChargeIsPercent: false,
    discount: discount.value,
    discountIsPercent: false,
    extraFees: extraFees.value,
    totalOverride: total.value || undefined,
    eventName: state.currentBill?.eventName || storeName.value || '',
  });
  sessionStorage.removeItem('ocr_review');
  toast(tr('changesSaved'), 'success');
  router.push('/bill');
}
</script>

<template>
  <div v-if="loaded" class="page-root flex flex-col gap-4 pb-28 sm:gap-5 sm:pb-32">
    <div class="flex items-start gap-2 sm:items-center sm:gap-3">
      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
        :aria-label="tr('back')"
        @click="goBack"
      >
        <ArrowLeft class="h-4 w-4" />
      </button>
      <div class="min-w-0">
        <h1 class="text-base font-semibold sm:text-lg">{{ tr('reviewScan') }}</h1>
        <p class="text-[11px] text-neutral-500 sm:text-xs">{{ tr('reviewDesc') }}</p>
      </div>
    </div>

    <Input v-model="storeName" :label="tr('storeName')" />

    <div
      :class="`rounded-2xl border p-4 ${
        matches === null
          ? 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'
          : matches
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
            : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
      }`"
    >
      <p class="text-sm font-medium">
        {{ matches === null ? tr('summary') : matches ? `✓ ${tr('totalMatch')}` : tr('totalMismatch') }}
      </p>
      <div class="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p class="text-neutral-500">{{ tr('subtotal') }} (item)</p>
          <p class="font-medium tabular-nums">{{ formatCurrency(itemsSum, tr('currency')) }}</p>
        </div>
        <div>
          <p class="text-neutral-500">{{ tr('tax') }}</p>
          <p class="font-medium tabular-nums">{{ formatCurrency(tax, tr('currency')) }}</p>
        </div>
        <div>
          <p class="text-neutral-500">{{ tr('serviceCharge') }}</p>
          <p class="font-medium tabular-nums">{{ formatCurrency(service, tr('currency')) }}</p>
        </div>
        <div>
          <p class="text-neutral-500">{{ tr('extraFees') }}</p>
          <p class="font-medium tabular-nums">{{ formatCurrency(extraFees, tr('currency')) }}</p>
        </div>
        <div>
          <p class="text-neutral-500">{{ tr('discount') }}</p>
          <p class="font-medium tabular-nums">−{{ formatCurrency(discount, tr('currency')) }}</p>
        </div>
        <div>
          <p class="text-neutral-500">{{ tr('calculated') }}</p>
          <p class="font-medium tabular-nums">{{ formatCurrency(calcTotal, tr('currency')) }}</p>
        </div>
        <div class="col-span-2">
          <p class="text-neutral-500">{{ tr('receiptTotal') }}</p>
          <p class="text-base font-semibold tabular-nums">{{ formatCurrency(total, tr('currency')) }}</p>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-[13px] font-semibold leading-none text-neutral-800 dark:text-neutral-100">
        {{ tr('items') }}
      </h2>
      <button
        type="button"
        class="inline-flex h-auto shrink-0 items-center gap-0.5 border-0 bg-transparent p-0 text-[13px] font-semibold leading-none text-neutral-800 transition hover:text-neutral-600 dark:text-neutral-100 dark:hover:text-neutral-300"
        @click="addItem"
      >
        <Plus class="h-3.5 w-3.5" :stroke-width="2.25" />
        <span>{{ tr('addMissingItem') }}</span>
      </button>
    </div>

    <ul class="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <li
        v-for="(item, idx) in items"
        :key="item.id"
        class="rounded-2xl border border-neutral-200 bg-white p-3 sm:p-3.5 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-neutral-400">#{{ idx + 1 }}</span>
          <span class="text-[11px] tabular-nums text-neutral-500">
            {{ tr('lineTotal') }}: {{ formatCurrency(item.price * item.qty, tr('currency')) }}
          </span>
          <button
            type="button"
            class="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500"
            :aria-label="tr('delete')"
            @click="removeItem(item.id)"
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
        <div class="flex flex-col gap-2">
          <Input v-model="item.name" :label="tr('itemName')" />
          <div class="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <CurrencyInput v-model="item.price" :label="`${tr('price')} (${tr('unitPrice')})`" />
            <NumberInput v-model="item.qty" :label="tr('qty')" :min="1" :empty-value="1" />
          </div>
        </div>
      </li>
    </ul>

    <div class="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
      <CurrencyInput v-model="tax" :label="tr('tax')" />
      <CurrencyInput v-model="service" :label="tr('serviceCharge')" />
      <CurrencyInput v-model="extraFees" :label="`${tr('extraFees')} (ongkir/admin)`" />
      <CurrencyInput v-model="discount" :label="tr('discount')" />
      <div class="min-[400px]:col-span-2">
        <CurrencyInput v-model="total" :label="tr('receiptTotal')" />
      </div>
    </div>

    <div v-if="rawText" class="rounded-2xl border border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        class="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-medium text-neutral-500"
        @click="showRaw = !showRaw"
      >
        <span>Teks OCR mentah (debug)</span>
        <span>{{ showRaw ? '−' : '+' }}</span>
      </button>
      <pre
        v-if="showRaw"
        class="max-h-48 overflow-auto whitespace-pre-wrap border-t border-neutral-100 px-4 py-3 text-[11px] leading-relaxed text-neutral-600 dark:border-neutral-800 dark:text-neutral-400"
        >{{ rawText }}</pre
      >
    </div>

    <div
      class="fixed-footer fixed bottom-0 z-30 border-t border-neutral-200/80 bg-white/90 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/90"
    >
      <div class="app-shell sticky-bar flex gap-2 py-2.5 sm:py-3">
        <Button variant="outline" class="shrink-0" @click="router.push('/scan')">
          <ScanLine class="h-4 w-4" />
          <span class="hidden min-[400px]:inline">{{ tr('rescan') }}</span>
        </Button>
        <Button full-width @click="confirm">
          <Check class="h-4 w-4" />
          <span class="truncate">{{ tr('confirmScan') }}</span>
        </Button>
      </div>
    </div>
  </div>
</template>
