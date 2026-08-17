<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useApp } from '../composables/useApp';
import { privacyDoc, termsDoc } from '../i18n/legal.ts';

const route = useRoute();
const router = useRouter();
const { state } = useApp();

const doc = computed(() =>
  route.path === '/terms' ? termsDoc(state.lang) : privacyDoc(state.lang),
);
</script>

<template>
  <div class="page-root mx-auto flex w-full max-w-2xl flex-col gap-4 pb-8 sm:gap-5 sm:pb-10">
    <div class="flex items-start gap-2 sm:items-center sm:gap-3">
      <button
        type="button"
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
        @click="router.push('/')"
      >
        <ArrowLeft class="h-4 w-4" />
      </button>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-base font-semibold sm:text-lg">{{ doc.title }}</h1>
        <p class="truncate text-[11px] text-neutral-500 sm:text-xs">{{ doc.updated }}</p>
      </div>
    </div>

    <div
      class="flex flex-col gap-5 rounded-2xl border border-neutral-200 bg-white p-4 sm:rounded-3xl sm:p-5 md:p-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <p class="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{{ doc.intro }}</p>

      <section v-for="(section, i) in doc.sections" :key="i" class="flex flex-col gap-2">
        <h2 class="text-sm font-semibold">{{ section.heading }}</h2>
        <p
          v-for="(para, j) in section.body"
          :key="j"
          class="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300"
        >
          {{ para }}
        </p>
      </section>
    </div>
  </div>
</template>
