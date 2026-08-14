<script setup lang="ts" generic="T extends string = string">
import { Check, ChevronDown } from 'lucide-vue-next';
import { onMounted, onUnmounted, ref } from 'vue';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: T;
    options: DropdownOption<T>[];
    label?: string;
    placeholder?: string;
    class?: string;
  }>(),
  { placeholder: 'Select', class: '' },
);

const emit = defineEmits<{ 'update:modelValue': [value: T] }>();

const open = ref(false);
const root = ref<HTMLDivElement | null>(null);
const selected = () => props.options.find((o) => o.value === props.modelValue);

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener('mousedown', onDocClick));
onUnmounted(() => document.removeEventListener('mousedown', onDocClick));

function select(value: T) {
  emit('update:modelValue', value);
  open.value = false;
}
</script>

<template>
  <div ref="root" :class="`relative flex flex-col gap-1.5 ${props.class}`">
    <span v-if="label" class="text-sm font-medium text-neutral-700 dark:text-neutral-300">{{
      label
    }}</span>
    <button
      type="button"
      class="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-left text-sm transition hover:border-neutral-300 sm:px-3.5 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600"
      @click="open = !open"
    >
      <span
        :class="`min-w-0 truncate ${selected() ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400'}`"
      >
        {{ selected()?.label ?? placeholder }}
      </span>
      <ChevronDown :class="`h-4 w-4 text-neutral-400 transition ${open ? 'rotate-180' : ''}`" />
    </button>
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0 -translate-y-1.5"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <ul
        v-if="open"
        class="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-64 overflow-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <li v-for="opt in options" :key="opt.value">
          <button
            type="button"
            class="flex w-full items-start gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
            @click="select(opt.value)"
          >
            <span class="mt-0.5 w-4 shrink-0">
              <Check v-if="opt.value === modelValue" class="h-4 w-4 text-neutral-900 dark:text-white" />
            </span>
            <span class="flex flex-col">
              <span class="font-medium text-neutral-800 dark:text-neutral-100">{{ opt.label }}</span>
              <span v-if="opt.description" class="text-xs text-neutral-500">{{ opt.description }}</span>
            </span>
          </button>
        </li>
      </ul>
    </Transition>
  </div>
</template>
