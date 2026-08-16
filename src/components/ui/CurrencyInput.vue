<script setup lang="ts">
import { ref, watch } from 'vue';
import { useApp } from '../../composables/useApp';

const props = withDefaults(
  defineProps<{
    label?: string;
    modelValue: number;
    class?: string;
    placeholder?: string;
    compact?: boolean;
  }>(),
  { placeholder: '0', compact: false, class: '' },
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const { tr } = useApp();

function formatDots(n: number) {
  return Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const focused = ref(false);
const text = ref(props.modelValue > 0 ? formatDots(props.modelValue) : '');

watch(
  () => props.modelValue,
  (value) => {
    if (focused.value) return;
    text.value = value > 0 ? formatDots(value) : '';
  },
);

function onFocus(e: FocusEvent) {
  focused.value = true;
  requestAnimationFrame(() => (e.target as HTMLInputElement).select());
}

function onBlur() {
  focused.value = false;
  const digits = text.value.replace(/[^\d]/g, '');
  emit('update:modelValue', digits ? parseInt(digits, 10) : 0);
  const num = digits ? parseInt(digits, 10) : 0;
  text.value = num > 0 ? formatDots(num) : '';
}

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits === '') {
    text.value = '';
    emit('update:modelValue', 0);
    return;
  }
  const normalized = digits.replace(/^0+(?=\d)/, '');
  const num = parseInt(normalized || '0', 10);
  text.value = formatDots(num);
  emit('update:modelValue', num);
}
</script>

<template>
  <div :class="`flex min-w-0 flex-col ${compact ? 'gap-1' : 'gap-1.5'} ${props.class}`">
    <label v-if="label" class="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
      {{ label }}
    </label>
    <div class="relative min-w-0">
      <span
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-neutral-400"
      >
        {{ tr('currency') }}
      </span>
      <input
        type="text"
        inputmode="numeric"
        :value="text"
        :placeholder="placeholder"
        :class="`w-full min-w-0 rounded-lg border border-neutral-200 bg-white pl-9 pr-2.5 text-[13px] text-neutral-900 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-800 ${
          compact ? 'h-8 py-1.5' : 'h-9 py-2'
        }`"
        @focus="onFocus"
        @blur="onBlur"
        @input="onInput"
      />
    </div>
  </div>
</template>
