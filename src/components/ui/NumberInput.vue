<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    label?: string;
    modelValue: number;
    min?: number;
    max?: number;
    emptyValue?: number;
    class?: string;
    inputClass?: string;
    placeholder?: string;
    suffix?: string;
    compact?: boolean;
    allowDecimal?: boolean;
  }>(),
  { compact: false, allowDecimal: false, class: '' },
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const focused = ref(false);
const fallback = () => props.emptyValue ?? props.min ?? 0;
const text = ref(String(props.modelValue));

watch(
  () => props.modelValue,
  (value) => {
    if (focused.value) return;
    text.value = String(value);
  },
);

function clamp(n: number) {
  let x = n;
  if (props.min != null && x < props.min) x = props.min;
  if (props.max != null && x > props.max) x = props.max;
  return x;
}

function parse(s: string): number | null {
  if (s.trim() === '' || s === '-' || s === '.') return null;
  const n = props.allowDecimal ? parseFloat(s) : parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function onFocus(e: FocusEvent) {
  focused.value = true;
  (e.target as HTMLInputElement).select();
}

function onBlur() {
  focused.value = false;
  const n = parse(text.value);
  const next = clamp(n == null ? fallback() : n);
  emit('update:modelValue', next);
  text.value = String(next);
}

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  if (raw === '') {
    text.value = '';
    return;
  }
  const pattern = props.allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
  if (!pattern.test(raw)) return;
  text.value = raw;
  const n = parse(raw);
  if (n != null) {
    let next = n;
    if (props.max != null && next > props.max) next = props.max;
    emit('update:modelValue', next);
  }
}
</script>

<template>
  <div :class="`flex min-w-0 flex-col ${compact ? 'gap-1' : 'gap-1.5'} ${props.class}`">
    <label v-if="label" class="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
      {{ label }}
    </label>
    <div class="relative min-w-0">
      <input
        type="text"
        :inputmode="allowDecimal ? 'decimal' : 'numeric'"
        :value="text"
        :placeholder="placeholder ?? String(fallback())"
        :class="`w-full min-w-0 rounded-lg border border-neutral-200 bg-white text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-500 dark:focus:ring-neutral-800 ${
          compact ? 'h-8 px-2.5 py-1.5 text-[13px]' : 'h-9 px-2.5 py-2 text-[13px] sm:text-sm'
        } ${suffix ? 'pr-8' : ''} ${inputClass || ''}`"
        @focus="onFocus"
        @blur="onBlur"
        @input="onInput"
      />
      <span
        v-if="suffix"
        class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400"
      >
        {{ suffix }}
      </span>
    </div>
  </div>
</template>
