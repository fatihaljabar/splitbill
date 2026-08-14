<script setup lang="ts">
import { Clock } from 'lucide-vue-next';
import { computed, onUnmounted, ref } from 'vue';
import { formatCountdown } from '../../shared/format.ts';
import { useApp } from '../composables/useApp';

const props = defineProps<{ expiresAt: number; compact?: boolean }>();

const { tr } = useApp();
const left = ref(props.expiresAt - Date.now());

const id = setInterval(() => (left.value = props.expiresAt - Date.now()), 1000);
onUnmounted(() => clearInterval(id));

const text = computed(() =>
  formatCountdown(left.value, {
    days: tr('days'),
    hours: tr('hours'),
    minutes: tr('minutes'),
    seconds: tr('seconds'),
  }),
);
</script>

<template>
  <span
    v-if="left <= 0"
    class="inline-flex max-w-full items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600 sm:gap-1.5 sm:px-2.5 sm:text-xs dark:bg-red-950/40 dark:text-red-400"
  >
    <Clock class="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
    <span class="truncate">{{ tr('expired') }}</span>
  </span>
  <span
    v-else
    class="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 sm:gap-1.5 sm:px-2.5 sm:text-xs dark:bg-amber-950/40 dark:text-amber-400"
  >
    <Clock class="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
    <span class="truncate">{{ compact ? text : `${tr('countdown')}: ${text}` }}</span>
  </span>
</template>
