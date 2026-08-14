<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  label?: string;
  description?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    class="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left transition hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span class="flex min-w-0 flex-col gap-0.5">
      <span v-if="label" class="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">{{
        label
      }}</span>
      <span v-if="description" class="text-[11px] leading-snug text-neutral-500">{{
        description
      }}</span>
    </span>
    <span
      :class="`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
        modelValue ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-neutral-700'
      }`"
    >
      <span
        :class="`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-neutral-900 ${
          modelValue ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
        }`"
      />
    </span>
  </button>
</template>
