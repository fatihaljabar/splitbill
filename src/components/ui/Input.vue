<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    label?: string;
    hint?: string;
    error?: string;
    inputClass?: string;
    compact?: boolean;
    id?: string;
    class?: string;
  }>(),
  { compact: false, class: '' },
);

defineEmits<{ 'update:modelValue': [value: string] }>();

defineOptions({ inheritAttrs: false });
</script>

<template>
  <div :class="`flex min-w-0 flex-col ${compact ? 'gap-1' : 'gap-1.5'} ${props.class}`">
    <label
      v-if="label"
      :for="id"
      class="text-[11px] font-medium text-neutral-600 dark:text-neutral-400"
    >
      {{ label }}
    </label>
    <div class="relative flex min-w-0 items-center">
      <span v-if="$slots.leftIcon" class="pointer-events-none absolute left-2.5 text-neutral-400">
        <slot name="leftIcon" />
      </span>
      <input
        :id="id"
        :value="modelValue"
        v-bind="$attrs"
        :class="`w-full min-w-0 rounded-lg border border-neutral-200 bg-white text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-800 ${
          compact ? 'h-8 px-2.5 py-1.5 text-[13px]' : 'h-9 px-2.5 py-2 text-[13px] sm:text-sm'
        } ${$slots.leftIcon ? 'pl-9' : ''} ${$slots.rightSlot ? 'pr-10' : ''} ${
          error ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''
        } ${inputClass || ''}`"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <span v-if="$slots.rightSlot" class="absolute right-2">
        <slot name="rightSlot" />
      </span>
    </div>
    <p v-if="hint && !error" class="text-[10px] text-neutral-500">{{ hint }}</p>
    <p v-if="error" class="text-[10px] text-red-500">{{ error }}</p>
  </div>
</template>
