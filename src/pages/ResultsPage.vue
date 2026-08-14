<script setup lang="ts">
import confetti from 'canvas-confetti';
import { toPng } from 'html-to-image';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  Link2,
  MessageCircle,
  Pencil,
  QrCode,
  Share2,
} from 'lucide-vue-next';
import QrcodeVue from 'qrcode.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { buildShareText, calculateBill } from '../../shared/calculate.ts';
import { formatCurrency, formatDate } from '../../shared/format.ts';
import CountdownBadge from '../components/CountdownBadge.vue';
import Button from '../components/ui/Button.vue';
import Modal from '../components/ui/Modal.vue';
import { useApp } from '../composables/useApp';
import { markPaid as apiMarkPaid, createBill, fetchBill } from '../lib/api.ts';
import { buildShareUrl } from '../lib/share.ts';

const { tr, state, toast } = useApp();
const router = useRouter();
const summaryRef = ref<HTMLDivElement | null>(null);
const shareOpen = ref(false);
const qrOpen = ref(false);

const bill = computed(() => state.currentBill);
const calc = computed(() => (state.currentBill ? calculateBill(state.currentBill) : null));

// Kode dan masa berlaku dari server — bukan bill.shortCode lokal, server abaikan itu dan
// terbitkan miliknya sendiri (TSD §6). Disimpan per bill.id di sessionStorage supaya
// bolak-balik ke halaman ini (mis. dari BillPage) tidak menerbitkan link baru tiap kali —
// tidak ada endpoint update, jadi satu bill lokal = satu kode server yang dipakai ulang.
const serverCode = ref<string | null>(null);
const serverExpiresAt = ref<number | null>(null);
const posting = ref(false);
const postFailed = ref(false);

function postedKey(billId: string) {
  return `splitbill_posted_${billId}`;
}

async function persistToServer() {
  if (!bill.value) return;
  const cached = sessionStorage.getItem(postedKey(bill.value.id));
  if (cached) {
    const { shortCode, expiresAt } = JSON.parse(cached) as {
      shortCode: string;
      expiresAt: number;
    };
    serverCode.value = shortCode;
    serverExpiresAt.value = expiresAt;
    return;
  }
  posting.value = true;
  postFailed.value = false;
  try {
    const { shortCode, expiresAt } = await createBill(bill.value);
    serverCode.value = shortCode;
    serverExpiresAt.value = expiresAt;
    sessionStorage.setItem(postedKey(bill.value.id), JSON.stringify({ shortCode, expiresAt }));
  } catch {
    postFailed.value = true;
    toast(tr('error'), 'error');
  } finally {
    posting.value = false;
  }
}

async function refreshFromServer() {
  if (!serverCode.value || !state.currentBill) return;
  try {
    const res = await fetchBill(serverCode.value);
    // ponytail: bila bill.privacyMode === 'private', GET tanpa ?p= sengaja tidak membawa
    // status bayar (kontrak TSD §7 tidak punya jalur "pemilik" yang bisa lihat semua status
    // pada bill privat). Poll di sini efektif no-op untuk bill privat sampai ada endpoint
    // khusus pemilik.
    if (res.mode === 'public') {
      state.currentBill = { ...state.currentBill, participants: res.bill.participants };
    }
  } catch {
    /* diamkan — polling latar belakang, jangan ganggu pengguna dengan toast tiap gagal */
  }
}

let poll: ReturnType<typeof setInterval> | undefined;

onMounted(async () => {
  if (!state.currentBill) {
    router.push('/bill');
    return;
  }

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

  await persistToServer();

  poll = setInterval(() => {
    if (!document.hidden) refreshFromServer();
  }, 5000);
});

onUnmounted(() => {
  if (poll) clearInterval(poll);
});

const shareUrl = computed(() => (serverCode.value ? buildShareUrl(serverCode.value) : ''));

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    toast(tr('linkCopied'), 'success');
  } catch {
    toast(shareUrl.value, 'info');
  }
}

async function copyResult() {
  if (!bill.value || !calc.value) return;
  const text = `${buildShareText(bill.value, calc.value, tr('currency'))}\n\n${shareUrl.value}`;
  try {
    await navigator.clipboard.writeText(text);
    toast(tr('resultCopied'), 'success');
  } catch {
    toast(tr('error'), 'error');
  }
}

function shareWhatsApp() {
  if (!bill.value || !calc.value) return;
  const text = `${buildShareText(bill.value, calc.value, tr('currency'))}\n\n${shareUrl.value}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

async function downloadImage() {
  if (!summaryRef.value || !bill.value) return;
  try {
    const dataUrl = await toPng(summaryRef.value, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `splitbill-${bill.value.shortCode}.png`;
    a.click();
    toast(tr('imageDownloaded'), 'success');
  } catch {
    toast(tr('error'), 'error');
  }
}

async function togglePaid(pid: string) {
  if (!bill.value || !serverCode.value) return;
  const target = bill.value.participants.find((p) => p.id === pid);
  if (!target || target.isPayer) return;
  const nextStatus = target.paymentStatus === 'paid' ? 'unpaid' : 'paid';
  // Optimistic — server tetap sumber kebenaran, poll berikutnya mengoreksi bila gagal.
  state.currentBill = {
    ...bill.value,
    participants: bill.value.participants.map((p) =>
      p.id === pid ? { ...p, paymentStatus: nextStatus } : p,
    ),
  };
  try {
    await apiMarkPaid(serverCode.value, pid, nextStatus);
  } catch {
    toast(tr('error'), 'error');
    refreshFromServer();
  }
}

async function copyAccount() {
  if (!bill.value) return;
  try {
    await navigator.clipboard.writeText(bill.value.bankAccount.accountNumber);
    toast(tr('accountCopied'), 'success');
  } catch {
    /* ignore */
  }
}

async function generateLink() {
  if (postFailed.value) await persistToServer();
  if (serverCode.value) shareOpen.value = true;
}
</script>

<template>
  <div v-if="bill && calc" class="page-root flex flex-col gap-4 pb-8 sm:gap-5 sm:pb-10">
    <div class="flex items-start gap-2 sm:items-center sm:gap-3">
      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
        :aria-label="tr('back')"
        @click="router.push('/')"
      >
        <ArrowLeft class="h-4 w-4" />
      </button>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-base font-semibold sm:text-lg">{{ tr('results') }}</h1>
        <p class="truncate text-[11px] text-neutral-500 sm:text-xs">{{ tr('confetti') }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 text-[11px] font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          @click="router.push('/bill')"
        >
          <Pencil class="h-3.5 w-3.5" />
          <span class="hidden min-[360px]:inline">{{ tr('editBill') }}</span>
        </button>
        <CountdownBadge :expires-at="serverExpiresAt ?? bill.expiresAt" compact />
      </div>
    </div>

    <div
      ref="summaryRef"
      class="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:rounded-3xl sm:p-5 md:p-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div class="min-w-0">
        <p class="text-[11px] uppercase tracking-wider text-neutral-400 sm:text-xs">{{ tr('appName') }}</p>
        <h2 class="mt-1 break-words text-lg font-semibold sm:text-xl">{{ bill.eventName || 'Split Bill' }}</h2>
        <p v-if="bill.storeName" class="truncate text-sm text-neutral-500">{{ bill.storeName }}</p>
        <p class="mt-1 text-[11px] text-neutral-400 sm:text-xs">{{ formatDate(bill.createdAt) }}</p>
      </div>

      <div class="rounded-2xl bg-neutral-50 p-3.5 sm:p-4 dark:bg-neutral-950">
        <p class="text-xs text-neutral-500">{{ tr('grandTotal') }}</p>
        <p class="break-all text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
          {{ formatCurrency(calc.grandTotal, tr('currency')) }}
        </p>
        <div class="mt-3 grid grid-cols-1 gap-1.5 text-[11px] text-neutral-500 min-[400px]:grid-cols-2 sm:gap-2 sm:text-xs">
          <span>{{ tr('subtotal') }}: {{ formatCurrency(calc.itemsSubtotal, tr('currency')) }}</span>
          <span>{{ tr('tax') }}: {{ formatCurrency(calc.taxAmount, tr('currency')) }}</span>
          <span>{{ tr('serviceCharge') }}: {{ formatCurrency(calc.serviceAmount, tr('currency')) }}</span>
          <span v-if="calc.discountAmount > 0">{{ tr('discount') }}: -{{ formatCurrency(calc.discountAmount, tr('currency')) }}</span>
          <span v-if="calc.extraFees > 0">{{ tr('extraFees') }}: {{ formatCurrency(calc.extraFees, tr('currency')) }}</span>
        </div>
      </div>

      <div
        v-if="calc.matchesReceipt !== null"
        :class="`rounded-xl px-3 py-2 text-xs font-medium ${
          calc.matchesReceipt
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
        }`"
      >
        {{ calc.matchesReceipt ? `✓ ${tr('totalMatch')}` : tr('totalMismatch') }}
        <span class="mt-1 block opacity-80">
          {{ tr('receiptTotal') }}: {{ formatCurrency(calc.receiptTotal || 0, tr('currency')) }} ·
          {{ tr('calculated') }}: {{ formatCurrency(calc.calculatedTotal, tr('currency')) }}
        </span>
      </div>

      <div>
        <h3 class="mb-2 text-sm font-semibold">{{ tr('perPerson') }}</h3>
        <ul class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <li
            v-for="p in calc.perPerson"
            :key="p.participantId"
            class="rounded-2xl border border-neutral-100 p-3 dark:border-neutral-800"
          >
            <div class="flex items-start gap-2 sm:items-center sm:gap-3">
              <span v-if="p.isPayer" class="mt-0.5 shrink-0 text-emerald-500 sm:mt-0" :title="tr('payer')">
                <CheckCircle2 class="h-5 w-5" />
              </span>
              <button
                v-else
                type="button"
                class="mt-0.5 shrink-0 cursor-pointer rounded-full text-neutral-400 transition hover:text-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:mt-0"
                :title="p.paymentStatus === 'paid' ? tr('markUnpaid') : tr('markPaid')"
                :aria-pressed="p.paymentStatus === 'paid'"
                @click.prevent.stop="togglePaid(p.participantId)"
              >
                <CheckCircle2 v-if="p.paymentStatus === 'paid'" class="h-5 w-5 text-emerald-500" />
                <Circle v-else class="h-5 w-5" />
              </button>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <p class="max-w-full truncate text-sm font-medium">{{ p.name }}</p>
                  <span
                    v-if="p.isPayer"
                    class="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    {{ tr('payer') }}
                  </span>
                  <span
                    v-else
                    :class="`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      p.paymentStatus === 'paid'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'
                    }`"
                  >
                    {{ p.paymentStatus === 'paid' ? tr('paid') : tr('unpaid') }}
                  </span>
                </div>
                <ul v-if="p.items.length > 0" class="mt-1 space-y-0.5">
                  <li v-for="(it, j) in p.items" :key="j" class="break-words text-[11px] text-neutral-500">
                    {{ it.name }} · {{ formatCurrency(it.share, tr('currency')) }}
                  </li>
                </ul>
              </div>
              <p class="shrink-0 text-sm font-semibold tabular-nums">{{ formatCurrency(p.total, tr('currency')) }}</p>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="calc.settlements.length > 0">
        <h3 class="mb-2 text-sm font-semibold">{{ tr('settlements') }}</h3>
        <ul class="flex flex-col gap-2">
          <li
            v-for="(s, i) in calc.settlements"
            :key="i"
            class="flex flex-col gap-1 rounded-xl bg-neutral-50 px-3 py-2.5 text-sm min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between dark:bg-neutral-950"
          >
            <span class="min-w-0 break-words">
              <span class="font-medium">{{ s.fromName }}</span>
              <span class="text-neutral-400"> → </span>
              <span class="font-medium">{{ s.toName }}</span>
            </span>
            <span class="shrink-0 font-semibold tabular-nums">{{ formatCurrency(s.amount, tr('currency')) }}</span>
          </li>
        </ul>
      </div>

      <div v-if="bill.bankAccount.accountNumber" class="rounded-2xl border border-dashed border-neutral-200 p-3 dark:border-neutral-700">
        <p class="text-xs text-neutral-500">{{ tr('bankAccount') }}</p>
        <p class="mt-1 text-sm font-medium">{{ bill.bankAccount.bankName }} · {{ bill.bankAccount.accountName }}</p>
        <div class="mt-1 flex items-center gap-2">
          <p class="font-mono text-sm">{{ bill.bankAccount.accountNumber }}</p>
          <button
            type="button"
            class="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            @click="copyAccount"
          >
            <Copy class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p v-if="bill.notes" class="text-xs text-neutral-500">{{ tr('notes') }}: {{ bill.notes }}</p>
    </div>

    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Button variant="outline" class="min-w-0" @click="shareOpen = true">
        <Share2 class="h-4 w-4 shrink-0" />
        <span class="truncate">{{ tr('share') }}</span>
      </Button>
      <Button variant="outline" class="min-w-0" @click="downloadImage">
        <Download class="h-4 w-4 shrink-0" />
        <span class="truncate">{{ tr('downloadImage') }}</span>
      </Button>
      <Button variant="outline" class="min-w-0" @click="copyResult">
        <Copy class="h-4 w-4 shrink-0" />
        <span class="truncate">{{ tr('copyResult') }}</span>
      </Button>
      <Button variant="outline" class="min-w-0" @click="qrOpen = true">
        <QrCode class="h-4 w-4 shrink-0" />
        <span class="truncate">{{ tr('qrCode') }}</span>
      </Button>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row">
      <Button size="lg" full-width :loading="posting" @click="generateLink">
        <Link2 class="h-4 w-4" />
        {{ tr('generateLink') }}
      </Button>
      <Button variant="ghost" full-width @click="router.push('/')">{{ tr('home') }}</Button>
    </div>

    <Modal :open="shareOpen" :title="tr('shareLink')" @close="shareOpen = false">
      <div class="flex flex-col gap-4">
        <p class="text-xs text-neutral-500">{{ tr('shareHint') }}</p>
        <CountdownBadge :expires-at="serverExpiresAt ?? bill.expiresAt" />
        <div class="flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-950">
          <p class="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed sm:text-xs">{{ shareUrl }}</p>
          <button
            type="button"
            class="shrink-0 rounded-lg p-2 hover:bg-white dark:hover:bg-neutral-800"
            :aria-label="tr('copyLink')"
            @click="copyLink"
          >
            <Copy class="h-4 w-4" />
          </button>
        </div>
        <div class="flex justify-center rounded-2xl bg-white p-3 sm:p-4 dark:bg-neutral-950">
          <QrcodeVue :value="shareUrl" :size="148" level="M" :margin="2" class="h-auto max-w-full" />
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <Button full-width @click="copyLink">
            <Copy class="h-4 w-4" />
            {{ tr('copyLink') }}
          </Button>
          <Button full-width variant="outline" @click="shareWhatsApp">
            <MessageCircle class="h-4 w-4" />
            {{ tr('shareWhatsApp') }}
          </Button>
        </div>
      </div>
    </Modal>

    <Modal :open="qrOpen" :title="tr('qrCode')" @close="qrOpen = false">
      <div class="flex flex-col items-center gap-4">
        <QrcodeVue :value="shareUrl" :size="200" level="M" :margin="2" />
        <p class="text-center text-xs text-neutral-500">{{ tr('linkValidFor') }}</p>
        <Button full-width @click="copyLink">
          <Check class="h-4 w-4" />
          {{ tr('copyLink') }}
        </Button>
      </div>
    </Modal>
  </div>
</template>
