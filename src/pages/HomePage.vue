<script setup lang="ts">
import {
  Camera,
  ChevronRight,
  Clock,
  Plus,
  ScanLine,
  Share2,
  Shield,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatCurrency, formatDate } from '../../shared/format.ts';
import Button from '../components/ui/Button.vue';
import Modal from '../components/ui/Modal.vue';
import { useApp } from '../composables/useApp';
import { faqItems } from '../i18n/faq.ts';
import { clearHistory, deleteHistoryEntry, loadBill, loadHistory } from '../lib/storage.ts';

const { tr, state, createEmptyBill, setCurrentBill, toast } = useApp();
const router = useRouter();

const tick = ref(0);
const confirmClear = ref(false);

const history = computed(() => {
  void tick.value;
  return loadHistory();
});

const steps = computed(() => [
  { n: '01', title: tr('step1Title'), desc: tr('step1Desc') },
  { n: '02', title: tr('step2Title'), desc: tr('step2Desc') },
  { n: '03', title: tr('step3Title'), desc: tr('step3Desc') },
]);

const faq = computed(() => faqItems(state.lang));

const features = computed(() => [
  { icon: Camera, title: tr('scanReceipt'), desc: tr('feature1') },
  { icon: Users, title: tr('byItem'), desc: tr('feature2') },
  { icon: Share2, title: tr('shareLink'), desc: tr('feature3') },
  { icon: Shield, title: tr('localOnly'), desc: tr('feature4') },
]);

function startNew() {
  const bill = createEmptyBill();
  setCurrentBill(bill);
  router.push('/bill');
}

function startScan() {
  const bill = createEmptyBill();
  setCurrentBill(bill);
  router.push('/scan');
}

function openBill(id: string, expired: boolean) {
  if (expired) {
    // Kedaluwarsa berarti baris di server sudah dihapus (F17) — tidak ada apa pun untuk
    // ditampilkan, jadi tidak usah navigasi ke halaman yang pasti "tidak ditemukan".
    toast(tr('expiredDesc'), 'info');
    return;
  }
  const bill = loadBill(id);
  if (bill) {
    setCurrentBill(bill);
    router.push('/results');
  }
}

function removeEntry(id: string) {
  deleteHistoryEntry(id);
  tick.value += 1;
  toast(tr('saved'), 'info');
}

function confirmClearAll() {
  clearHistory();
  tick.value += 1;
  confirmClear.value = false;
}
</script>

<template>
  <div class="page-root page-fit-desktop flex flex-col gap-5 sm:gap-6 lg:gap-7">
    <section class="pt-1 lg:grid lg:flex-1 lg:grid-cols-2 lg:items-center lg:gap-10">
      <div class="flex flex-col gap-3 sm:gap-4">
        <div
          class="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 sm:px-3 sm:text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
        >
          <Sparkles class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate">{{ tr('noLogin') }} · {{ tr('noInstall') }}</span>
        </div>
        <h1
          class="text-2xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-3xl md:text-4xl lg:text-[2.5rem] dark:text-white"
        >
          {{ tr('tagline') }}
        </h1>
        <p class="max-w-xl text-sm leading-relaxed text-neutral-500 sm:text-[15px] dark:text-neutral-400">
          {{ tr('feature1') }}. {{ tr('feature2') }}. {{ tr('feature3') }}.
        </p>
        <div class="flex flex-col gap-2.5 min-[400px]:flex-row sm:gap-3">
          <Button size="lg" class="w-full min-[400px]:flex-1" @click="startNew">
            <Plus class="h-5 w-5 shrink-0" />
            <span class="truncate">{{ tr('createBill') }}</span>
          </Button>
          <Button size="lg" variant="outline" class="w-full min-[400px]:flex-1" @click="startScan">
            <ScanLine class="h-5 w-5 shrink-0" />
            <span class="truncate">{{ tr('scanReceipt') }}</span>
          </Button>
        </div>
      </div>

      <div
        class="mt-5 hidden rounded-3xl border border-neutral-200/80 bg-white p-5 lg:mt-0 lg:block dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p class="text-sm font-medium text-neutral-900 dark:text-white">{{ tr('howItWorks') }}</p>
        <ol class="mt-3 space-y-3">
          <li v-for="s in steps" :key="s.n" class="flex gap-3">
            <span class="text-sm font-semibold tabular-nums text-neutral-300 dark:text-neutral-600">{{
              s.n
            }}</span>
            <div class="min-w-0">
              <p class="text-sm font-medium">{{ s.title }}</p>
              <p class="mt-0.5 text-xs text-neutral-500">{{ s.desc }}</p>
            </div>
          </li>
        </ol>
      </div>
    </section>

    <section class="grid shrink-0 grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 lg:gap-3">
      <div
        v-for="f in features"
        :key="f.title"
        class="rounded-2xl border border-neutral-200/80 bg-white p-3 sm:p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <component
          :is="f.icon"
          class="mb-2 h-4 w-4 text-neutral-700 sm:mb-3 sm:h-5 sm:w-5 dark:text-neutral-300"
          :stroke-width="1.75"
        />
        <p class="text-xs font-medium text-neutral-900 sm:text-sm dark:text-white">{{ f.title }}</p>
        <p class="mt-1 line-clamp-2 text-[11px] leading-relaxed text-neutral-500 sm:text-xs">
          {{ f.desc }}
        </p>
      </div>
    </section>

    <section id="how" class="flex flex-col gap-3 sm:gap-4 lg:hidden">
      <h2 class="text-base font-semibold tracking-tight sm:text-lg">{{ tr('howItWorks') }}</h2>
      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <div
          v-for="s in steps"
          :key="s.n"
          class="flex gap-3 rounded-2xl border border-neutral-200/80 bg-white p-3.5 sm:flex-col sm:gap-2 sm:p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <span class="shrink-0 text-sm font-semibold tabular-nums text-neutral-300 dark:text-neutral-600">{{
            s.n
          }}</span>
          <div class="min-w-0">
            <p class="text-sm font-medium">{{ s.title }}</p>
            <p class="mt-0.5 text-xs text-neutral-500">{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
      <div class="flex shrink-0 items-center justify-between gap-3">
        <h2 class="text-base font-semibold tracking-tight sm:text-lg">{{ tr('history') }}</h2>
        <button
          v-if="history.length > 0"
          type="button"
          class="shrink-0 text-xs font-medium text-neutral-400 hover:text-red-500"
          @click="confirmClear = true"
        >
          {{ tr('clearAll') }}
        </button>
      </div>

      <div
        v-if="history.length === 0"
        class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center lg:min-h-0 lg:flex-1 lg:py-6 dark:border-neutral-800"
      >
        <Clock class="h-7 w-7 text-neutral-300 dark:text-neutral-600" />
        <p class="text-sm font-medium text-neutral-600 dark:text-neutral-300">{{ tr('noHistory') }}</p>
        <p class="text-xs text-neutral-400">{{ tr('noHistoryDesc') }}</p>
      </div>

      <ul v-else class="grid min-h-0 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2 lg:gap-3">
        <li v-for="h in history" :key="h.id" class="min-w-0">
          <div
            class="flex w-full items-stretch gap-1 rounded-2xl border border-neutral-200/80 bg-white transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2.5 p-3 text-left sm:gap-3 sm:p-3.5"
              @click="openBill(h.id, Date.now() > h.expiresAt)"
            >
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 sm:h-10 sm:w-10 dark:bg-neutral-800"
              >
                <Users class="h-4 w-4 text-neutral-500" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <p class="truncate text-sm font-medium">{{ h.eventName || '—' }}</p>
                  <span
                    :class="`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      Date.now() > h.expiresAt
                        ? 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'
                        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                    }`"
                  >
                    {{ Date.now() > h.expiresAt ? tr('expired') : tr('active') }}
                  </span>
                </div>
                <p class="mt-0.5 truncate text-[11px] text-neutral-500 sm:text-xs">
                  {{ formatCurrency(h.grandTotal, tr('currency')) }} · {{ h.participantCount }}
                  {{ tr('people') }}
                  <span class="hidden sm:inline"> · {{ formatDate(h.createdAt) }}</span>
                </p>
              </div>
              <ChevronRight class="hidden h-4 w-4 shrink-0 text-neutral-300 sm:block" />
            </button>
            <button
              type="button"
              class="flex shrink-0 items-center rounded-r-2xl px-2.5 text-neutral-400 hover:bg-neutral-50 hover:text-red-500 sm:px-3 dark:hover:bg-neutral-800"
              :aria-label="tr('delete')"
              @click="removeEntry(h.id)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-2.5 sm:gap-3">
      <h2 class="text-base font-semibold tracking-tight sm:text-lg">{{ tr('faqTitle') }}</h2>
      <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
        <div
          v-for="item in faq"
          :key="item.q"
          class="rounded-2xl border border-neutral-200/80 bg-white p-3.5 sm:p-4 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h3 class="text-sm font-medium">{{ item.q }}</h3>
          <p class="mt-1 text-xs leading-relaxed text-neutral-500">{{ item.a }}</p>
        </div>
      </div>
    </section>

    <div class="shrink-0 pt-1 text-center text-[11px] text-neutral-400 sm:text-xs">
      <p>{{ tr('footer') }}</p>
      <p class="mt-1 flex items-center justify-center gap-2">
        <RouterLink to="/privacy" class="hover:text-neutral-600 dark:hover:text-neutral-300">
          {{ tr('privacyPolicy') }}
        </RouterLink>
        <span aria-hidden="true">·</span>
        <RouterLink to="/terms" class="hover:text-neutral-600 dark:hover:text-neutral-300">
          {{ tr('termsOfService') }}
        </RouterLink>
      </p>
    </div>

    <Modal :open="confirmClear" :title="tr('confirmDelete')" @close="confirmClear = false">
      <div class="flex flex-col gap-4">
        <p class="text-sm text-neutral-600 dark:text-neutral-300">{{ tr('deleteHistory') }}?</p>
        <div class="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" full-width @click="confirmClear = false">{{ tr('no') }}</Button>
          <Button variant="danger" full-width @click="confirmClearAll">{{ tr('yes') }}</Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
