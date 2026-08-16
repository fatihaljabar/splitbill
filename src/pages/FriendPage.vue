<script setup lang="ts">
import { Copy, Home, MessageCircle } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { calculateBill } from '../../shared/calculate.ts';
import { formatCurrency, formatDate } from '../../shared/format.ts';
import type { BankAccount, CalculationResult, PersonBreakdown } from '../../shared/types.ts';
import CountdownBadge from '../components/CountdownBadge.vue';
import Button from '../components/ui/Button.vue';
import { useApp } from '../composables/useApp';
import { markPaid as apiMarkPaid, fetchBill } from '../lib/api.ts';
import { decodeBill } from '../lib/share.ts';

interface DisplayInfo {
  eventName: string;
  storeName?: string;
  date?: string;
  createdAt?: number;
  expiresAt: number;
  bankAccount: BankAccount;
}

const route = useRoute();
const router = useRouter();
const { tr, toast } = useApp();

const code = route.params.code as string;
const loading = ref(true);
const expired = ref(false);
const notFound = ref(false);
const isPrivate = ref(false);
const display = ref<DisplayInfo | null>(null);
const participants = ref<Array<{ id: string; name: string }>>([]);
// calc/perPerson tersedia utuh untuk bill publik (dan link lama) — server kirim semuanya
// sekaligus. Bill privat sengaja tidak pernah punya ini (TSD §7): baru terisi per-orang
// lewat `me` setelah peserta memilih namanya.
const calc = ref<CalculationResult | null>(null);
const me = ref<PersonBreakdown | null>(null);
const selectedId = ref<string | null>(null);

onMounted(async () => {
  if (!code) {
    notFound.value = true;
    loading.value = false;
    return;
  }

  // Link lama (data bill dititipkan di URL) — dibaca langsung di klien, tanpa server.
  const dataParam = route.query.d as string | undefined;
  if (dataParam) {
    const decoded = decodeBill(dataParam);
    if (decoded) {
      if (Date.now() > decoded.expiresAt) {
        expired.value = true;
        display.value = {
          eventName: decoded.eventName,
          createdAt: decoded.createdAt,
          expiresAt: decoded.expiresAt,
          bankAccount: decoded.bankAccount,
        };
        loading.value = false;
        return;
      }
      isPrivate.value = decoded.privacyMode === 'private';
      display.value = {
        eventName: decoded.eventName,
        storeName: decoded.storeName,
        date: decoded.date,
        expiresAt: decoded.expiresAt,
        bankAccount: decoded.bankAccount,
      };
      participants.value = decoded.participants.map((p) => ({ id: p.id, name: p.name }));
      calc.value = calculateBill(decoded);
      restoreSelection();
      loading.value = false;
      return;
    }
  }

  try {
    const res = await fetchBill(code);
    if (res.mode === 'public') {
      isPrivate.value = false;
      display.value = {
        eventName: res.bill.eventName,
        storeName: res.bill.storeName,
        date: res.bill.date,
        expiresAt: res.bill.expiresAt,
        bankAccount: res.bill.bankAccount,
      };
      participants.value = res.bill.participants.map((p) => ({ id: p.id, name: p.name }));
      calc.value = res.calc;
    } else {
      isPrivate.value = true;
      display.value = {
        eventName: res.eventName,
        storeName: res.storeName,
        date: res.date,
        expiresAt: res.expiresAt,
        bankAccount: res.bankAccount,
      };
      participants.value = res.participants;
    }
    restoreSelection();
  } catch (e) {
    if (e instanceof Error && e.message === 'expired') {
      expired.value = true;
    } else {
      notFound.value = true;
    }
  } finally {
    loading.value = false;
  }
});

function restoreSelection() {
  const saved = localStorage.getItem(`splitbill_self_${code}`);
  if (saved) selectPerson(saved);
}

async function selectPerson(id: string) {
  selectedId.value = id;
  localStorage.setItem(`splitbill_self_${code}`, id);
  if (!isPrivate.value) {
    me.value = calc.value?.perPerson.find((p) => p.participantId === id) ?? null;
    return;
  }
  try {
    const res = await fetchBill(code, id);
    me.value = res.mode === 'private' ? (res.me ?? null) : null;
  } catch {
    toast(tr('error'), 'error');
  }
}

async function markPaid() {
  if (!me.value || !selectedId.value) return;
  if (me.value.isPayer) {
    toast(tr('payer'), 'info');
    return;
  }
  try {
    await apiMarkPaid(code, selectedId.value, 'paid');
    me.value = { ...me.value, paymentStatus: 'paid' };
    toast(tr('paid'), 'success');
  } catch {
    toast(tr('error'), 'error');
  }
}

async function copyAccount() {
  if (!display.value?.bankAccount.accountNumber) return;
  try {
    await navigator.clipboard.writeText(display.value.bankAccount.accountNumber);
    toast(tr('accountCopied'), 'success');
  } catch {
    /* ignore */
  }
}

function waPay() {
  if (!display.value || !me.value) return;
  // Bill privat tidak mengirim daftar isPayer per orang (TSD §7) — sapaan tanpa nama
  // pembayar untuk kasus itu, sama seperti saat nama pembayar tak diketahui.
  const payerName = calc.value?.perPerson.find((p) => p.isPayer)?.name;
  const text = [
    `Halo${payerName ? ` ${payerName}` : ''},`,
    `Saya ${me.value.name} sudah siap transfer untuk *${display.value.eventName || 'Split Bill'}*.`,
    `Nominal: ${formatCurrency(me.value.total, tr('currency'))}`,
    display.value.bankAccount.accountNumber
      ? `Rek: ${display.value.bankAccount.bankName} ${display.value.bankAccount.accountNumber} a/n ${display.value.bankAccount.accountName}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
</script>

<template>
  <div v-if="notFound" class="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-2 text-center">
    <p class="text-base font-semibold sm:text-lg">{{ tr('billNotFound') }}</p>
    <p class="max-w-sm text-sm text-neutral-500">{{ tr('billNotFoundDesc') }}</p>
    <Button @click="router.push('/')">
      <Home class="h-4 w-4" />
      {{ tr('goHome') }}
    </Button>
  </div>

  <div v-else-if="expired" class="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-2 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 sm:h-16 sm:w-16 dark:bg-neutral-800">
      <span class="text-2xl">⌛</span>
    </div>
    <p class="text-base font-semibold sm:text-lg">{{ tr('expiredTitle') }}</p>
    <p class="max-w-sm text-sm text-neutral-500">{{ tr('expiredDesc') }}</p>
    <p v-if="display" class="max-w-full truncate px-2 text-xs text-neutral-400">
      {{ display.eventName }}<span v-if="display.createdAt"> · {{ formatDate(display.createdAt) }}</span>
    </p>
    <Button @click="router.push('/')">
      <Home class="h-4 w-4" />
      {{ tr('goHome') }}
    </Button>
  </div>

  <div v-else-if="loading || !display" class="flex min-h-[50dvh] items-center justify-center text-sm text-neutral-500">
    {{ tr('loading') }}
  </div>

  <div v-else class="page-root mx-auto flex w-full max-w-2xl flex-col gap-4 pb-6 sm:gap-5 sm:pb-8 lg:max-w-3xl">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <p class="text-[11px] uppercase tracking-wider text-neutral-400 sm:text-xs">{{ tr('friendView') }}</p>
        <h1 class="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl">{{ display.eventName || 'Split Bill' }}</h1>
        <p v-if="display.storeName" class="truncate text-sm text-neutral-500">{{ display.storeName }}</p>
      </div>
      <div class="shrink-0 self-start">
        <CountdownBadge :expires-at="display.expiresAt" compact />
      </div>
    </div>

    <div v-if="!selectedId" class="flex flex-col gap-3">
      <p class="text-sm text-neutral-600 dark:text-neutral-300">{{ tr('selectParticipant') }}</p>
      <ul class="flex flex-col gap-2">
        <li v-for="p in participants" :key="p.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
            @click="selectPerson(p.id)"
          >
            <span class="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold dark:bg-neutral-800">
              {{ p.name.charAt(0).toUpperCase() }}
            </span>
            <span class="text-sm font-medium">{{ p.name }}</span>
          </button>
        </li>
      </ul>
      <div v-if="!isPrivate && calc" class="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p class="mb-2 text-xs font-medium text-neutral-500">{{ tr('grandTotal') }}</p>
        <p class="text-2xl font-semibold tabular-nums">{{ formatCurrency(calc.grandTotal, tr('currency')) }}</p>
      </div>
    </div>

    <div v-else-if="me" class="flex flex-col gap-4">
      <div class="rounded-2xl border border-neutral-200 bg-white p-4 sm:rounded-3xl sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <p class="text-sm text-neutral-500">
          {{ tr('welcomeFriend') }}, <span class="font-medium text-neutral-900 dark:text-white">{{ me.name }}</span>
        </p>
        <p class="mt-3 text-[11px] uppercase tracking-wider text-neutral-400 sm:text-xs">{{ tr('mustPay') }}</p>
        <p class="break-all text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
          {{ formatCurrency(me.total, tr('currency')) }}
        </p>
        <div class="mt-4 grid grid-cols-1 gap-1.5 text-[11px] text-neutral-500 min-[400px]:grid-cols-2 sm:gap-2 sm:text-xs">
          <span>{{ tr('subtotal') }}: {{ formatCurrency(me.itemsSubtotal, tr('currency')) }}</span>
          <span>{{ tr('tax') }}: {{ formatCurrency(me.taxShare, tr('currency')) }}</span>
          <span>{{ tr('serviceCharge') }}: {{ formatCurrency(me.serviceShare, tr('currency')) }}</span>
          <span v-if="me.discountShare > 0">{{ tr('discount') }}: -{{ formatCurrency(me.discountShare, tr('currency')) }}</span>
        </div>
      </div>

      <div v-if="me.items.length > 0" class="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h3 class="mb-2 text-sm font-semibold">{{ tr('yourItems') }}</h3>
        <ul class="divide-y divide-neutral-100 dark:divide-neutral-800">
          <li v-for="(it, i) in me.items" :key="i" class="flex justify-between py-2 text-sm">
            <span class="text-neutral-700 dark:text-neutral-300">{{ it.name }}</span>
            <span class="tabular-nums font-medium">{{ formatCurrency(it.share, tr('currency')) }}</span>
          </li>
        </ul>
      </div>

      <div v-if="!isPrivate && calc" class="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h3 class="mb-2 text-sm font-semibold">{{ tr('paymentSummary') }}</h3>
        <ul class="flex flex-col gap-2">
          <li v-for="p in calc.perPerson" :key="p.participantId" class="flex items-center justify-between text-sm">
            <span :class="p.participantId === me.participantId ? 'font-semibold' : ''">
              {{ p.name }}{{ p.participantId === me.participantId ? ` (${tr('you')})` : '' }}
            </span>
            <span class="tabular-nums">{{ formatCurrency(p.total, tr('currency')) }}</span>
          </li>
        </ul>
      </div>

      <div v-if="display.bankAccount.accountNumber" class="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p class="text-xs text-neutral-500">{{ tr('payTo') }}</p>
        <p class="mt-1 text-sm font-medium">{{ display.bankAccount.bankName }} · {{ display.bankAccount.accountName }}</p>
        <div class="mt-2 flex min-w-0 items-center gap-2">
          <p class="min-w-0 break-all font-mono text-sm font-semibold sm:text-base">{{ display.bankAccount.accountNumber }}</p>
          <button
            type="button"
            class="shrink-0 rounded-lg border border-neutral-200 p-2 dark:border-neutral-700"
            :aria-label="tr('copyAccount')"
            @click="copyAccount"
          >
            <Copy class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button v-if="me.paymentStatus !== 'paid'" size="lg" full-width class="sm:flex-1" @click="markPaid">
          {{ tr('markPaid') }}
        </Button>
        <div
          v-else
          class="w-full rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700 sm:flex-1 dark:bg-emerald-950/40 dark:text-emerald-400"
        >
          ✓ {{ tr('paid') }}
        </div>
        <Button variant="outline" full-width class="sm:flex-1" @click="waPay">
          <MessageCircle class="h-4 w-4" />
          {{ tr('shareWhatsApp') }}
        </Button>
        <Button variant="ghost" full-width class="sm:basis-full" @click="selectedId = null">
          {{ tr('selectParticipant') }}
        </Button>
      </div>

      <p class="text-center text-[11px] text-neutral-400">{{ tr('viewOnly') }}</p>
    </div>
  </div>
</template>
