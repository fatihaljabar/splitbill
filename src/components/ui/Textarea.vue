<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: string;
    label?: string;
    hint?: string;
    id?: string;
    class?: string;
  }>(),
  { class: '' },
);

defineEmits<{ 'update:modelValue': [value: string] }>();

defineOptions({ inheritAttrs: false });
</script>

<template>
  <div :class="`flex flex-col gap-1.5 ${props.class}`">
    <label
      v-if="label"
      :for="id"
      class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
    >
      {{ label }}
    </label>
    <textarea
      :id="id"
      :value="modelValue"
      v-bind="$attrs"
      class="min-h-[88px] w-full min-w-0 resize-y rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 sm:px-3.5 sm:text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-800"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <p v-if="hint" class="text-xs text-neutral-500">{{ hint }}</p>
  </div>
</template>
