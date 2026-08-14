<script setup lang="ts">
import { useApp } from '../composables/useApp';
import CurrencyInput from './ui/CurrencyInput.vue';
import NumberInput from './ui/NumberInput.vue';

defineProps<{
  label: string;
  modelValue: number;
  isPercent: boolean;
  hint: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number];
  'update:isPercent': [value: boolean];
}>();

const { tr } = useApp();
</script>

<template>
  <div class="rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-900">
    <div class="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
      <p class="min-w-0 text-[12px] font-medium leading-none">{{ label }}</p>
      <div class="flex shrink-0 rounded-md bg-neutral-100 p-0.5 text-[10px] leading-none dark:bg-neutral-800">
        <button
          type="button"
          :class="`rounded px-1.5 py-1 ${isPercent ? 'bg-white shadow-sm dark:bg-neutral-700' : ''}`"
          @click="emit('update:isPercent', true)"
        >
          {{ tr('percent') }}
        </button>
        <button
          type="button"
          :class="`rounded px-1.5 py-1 ${!isPercent ? 'bg-white shadow-sm dark:bg-neutral-700' : ''}`"
          @click="emit('update:isPercent', false)"
        >
          {{ tr('fixed') }}
        </button>
      </div>
    </div>
    <NumberInput
      v-if="isPercent"
      compact
      :min="0"
      :max="100"
      allow-decimal
      :empty-value="0"
      :model-value="modelValue"
      suffix="%"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <CurrencyInput
      v-else
      compact
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <p class="mt-1 text-[10px] leading-snug text-neutral-400">{{ hint }}</p>
  </div>
</template>
