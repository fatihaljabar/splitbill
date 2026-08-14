<script setup lang="ts">
import { Languages, Moon, Receipt, Sun } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useApp } from '../composables/useApp';

const { state, setLang, setTheme, tr } = useApp();
const route = useRoute();

const isFriend = computed(() => route.path.startsWith('/s/'));
const isHome = computed(() => route.path === '/' || route.path === '');
const isScan = computed(() => route.path === '/scan');
</script>

<template>
  <div
    class="flex min-h-dvh min-h-svh w-full max-w-[100%] flex-col overflow-x-hidden bg-[#FAFAF9] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50"
  >
    <header
      v-if="!isFriend"
      class="sticky top-0 z-40 w-full max-w-[100%] shrink-0 border-b border-neutral-200/70 bg-[#FAFAF9]/85 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/85"
      :style="{ paddingTop: 'var(--safe-top)' }"
    >
      <div class="app-shell flex h-12 items-center justify-between sm:h-14 md:h-16">
        <RouterLink to="/" class="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white sm:h-9 sm:w-9 dark:bg-white dark:text-neutral-900"
          >
            <Receipt class="h-4 w-4" :stroke-width="2" />
          </span>
          <span class="truncate text-sm font-semibold tracking-tight sm:text-[15px]">{{
            tr('appName')
          }}</span>
        </RouterLink>
        <div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            class="flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 sm:px-2.5 dark:text-neutral-300 dark:hover:bg-neutral-800"
            :aria-label="tr('language')"
            @click="setLang(state.lang === 'id' ? 'en' : 'id')"
          >
            <Languages class="h-4 w-4 shrink-0" />
            <span class="hidden min-[360px]:inline">{{ state.lang.toUpperCase() }}</span>
          </button>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            :aria-label="tr('theme')"
            @click="setTheme(state.theme === 'light' ? 'dark' : 'light')"
          >
            <Moon v-if="state.theme === 'light'" class="h-4 w-4" />
            <Sun v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
    <main
      :class="`app-shell min-w-0 flex-1 ${
        isFriend
          ? 'py-4 sm:py-6'
          : isHome || isScan
            ? 'pb-6 pt-4 sm:pb-8 sm:pt-5 md:pt-6'
            : 'pb-8 pt-4 sm:pb-10 sm:pt-5 md:pt-6'
      }`"
    >
      <slot />
    </main>
  </div>
</template>
