<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next';
import { useApp } from '../../composables/useApp';

const { state, dismissToast } = useApp();
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 z-[100] mx-auto flex w-full max-w-sm flex-col gap-2 px-3 sm:px-4"
    :style="{ bottom: 'max(1rem, var(--safe-bottom))' }"
  >
    <TransitionGroup
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0 translate-y-4 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-200"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-2 scale-95"
    >
      <div
        v-for="t in state.toasts"
        :key="t.id"
        class="pointer-events-auto flex items-start gap-3 rounded-2xl border border-neutral-200/80 bg-white/95 px-3.5 py-3 shadow-lg backdrop-blur sm:items-center sm:px-4 dark:border-neutral-700 dark:bg-neutral-900/95"
      >
        <CheckCircle2
          v-if="t.type === 'success'"
          class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500 sm:mt-0"
        />
        <XCircle v-else-if="t.type === 'error'" class="mt-0.5 h-5 w-5 shrink-0 text-red-500 sm:mt-0" />
        <Info v-else class="mt-0.5 h-5 w-5 shrink-0 text-neutral-500 sm:mt-0" />
        <p class="min-w-0 flex-1 break-words text-sm text-neutral-800 dark:text-neutral-100">
          {{ t.message }}
        </p>
        <button
          type="button"
          class="shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          @click="dismissToast(t.id)"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
