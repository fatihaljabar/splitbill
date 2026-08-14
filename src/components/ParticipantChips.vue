<script setup lang="ts">
import type { Participant } from '../../shared/types.ts';

defineProps<{
  participants: Participant[];
  selectedIds: string[];
  selectAllLabel?: string;
  deselectAllLabel?: string;
}>();

const emit = defineEmits<{
  toggle: [id: string];
  selectAll: [];
  deselectAll: [];
}>();

const colors = [
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
];

function participantColor(index: number) {
  return colors[index % colors.length];
}
</script>

<template>
  <div class="flex flex-col gap-1 sm:gap-1.5">
    <div v-if="selectAllLabel || deselectAllLabel" class="flex gap-2">
      <button
        v-if="selectAllLabel"
        type="button"
        class="text-[10px] font-medium leading-none text-neutral-500 hover:text-neutral-800 sm:text-[11px] dark:hover:text-neutral-200"
        @click="emit('selectAll')"
      >
        {{ selectAllLabel }}
      </button>
      <button
        v-if="deselectAllLabel"
        type="button"
        class="text-[10px] font-medium leading-none text-neutral-500 hover:text-neutral-800 sm:text-[11px] dark:hover:text-neutral-200"
        @click="emit('deselectAll')"
      >
        {{ deselectAllLabel }}
      </button>
    </div>
    <div class="flex flex-wrap gap-1 sm:gap-1.5">
      <button
        v-for="(p, i) in participants"
        :key="p.id"
        type="button"
        :class="`inline-flex max-w-[7rem] items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-4 transition active:scale-[0.97] sm:max-w-[9rem] sm:px-2 sm:py-1 sm:text-[11px] sm:leading-4 md:max-w-[10rem] ${
          selectedIds.includes(p.id)
            ? `${participantColor(i)} ring-1 ring-inset ring-black/5 dark:ring-white/10`
            : 'bg-neutral-100 text-neutral-400 line-through decoration-neutral-300 dark:bg-neutral-800 dark:text-neutral-500'
        }`"
        @click="emit('toggle', p.id)"
      >
        <span class="truncate">
          <span class="opacity-70">{{ selectedIds.includes(p.id) ? '✓' : '✕' }}</span> {{ p.name }}
        </span>
      </button>
    </div>
  </div>
</template>
