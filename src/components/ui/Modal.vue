<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { onUnmounted, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    size?: 'sm' | 'md' | 'lg' | 'full';
  }>(),
  { size: 'md' },
);

const emit = defineEmits<{ close: [] }>();

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  full: 'max-w-2xl',
};

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    }
  },
);

onUnmounted(() => {
  document.removeEventListener('keydown', onKey);
  document.body.style.overflow = '';
});
</script>

<template>
  <Transition
    enter-active-class="transition duration-150"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end justify-center overflow-x-hidden p-0 sm:items-center sm:p-4 md:p-6"
      :style="{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }"
    >
      <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px]" @click="emit('close')" />
      <div
        :class="`relative z-10 flex w-full ${sizes[size]} max-h-[min(92dvh,920px)] flex-col overflow-hidden rounded-t-3xl border border-neutral-200/80 bg-white shadow-2xl landscape:max-h-[88dvh] sm:rounded-3xl dark:border-neutral-700 dark:bg-neutral-900`"
      >
        <div
          v-if="title"
          class="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 bg-white/95 px-4 py-3.5 backdrop-blur sm:px-5 sm:py-4 dark:border-neutral-800 dark:bg-neutral-900/95"
        >
          <h2 class="min-w-0 truncate text-sm font-semibold text-neutral-900 sm:text-base dark:text-white">
            {{ title }}
          </h2>
          <button
            type="button"
            class="shrink-0 rounded-xl p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
            @click="emit('close')"
          >
            <X class="h-5 w-5" />
          </button>
        </div>
        <div class="overflow-y-auto overscroll-contain p-4 sm:p-5">
          <slot />
        </div>
      </div>
    </div>
  </Transition>
</template>
